-- Quiz géo : comptes, parties et classement de la famille.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ».
-- Même projet Supabase que le Démineur Sauvage : les tables sont préfixées qg_ pour ne rien mélanger.
--
-- AVANT DE LANCER : remplacez CHANGEZ-MOI (tout en bas) par le code famille de votre choix.
-- C'est ce code que les enfants taperont une fois sur chaque appareil.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------

create table if not exists public.qg_famille (
  id smallint primary key default 1 check (id = 1),
  code_hash text not null
);

create table if not exists public.qg_joueurs (
  id bigint generated always as identity primary key,
  pseudo text not null check (char_length(pseudo) between 2 and 20),
  pin_hash text not null,
  cree_le timestamptz not null default now()
);
create unique index if not exists qg_joueurs_pseudo_idx on public.qg_joueurs (lower(pseudo));

create table if not exists public.qg_parties (
  id bigint generated always as identity primary key,
  joueur_id bigint not null references public.qg_joueurs(id) on delete cascade,
  theme text not null check (char_length(theme) between 1 and 60),
  mode text not null check (mode in ('qcm', 'saisie', 'liste', 'carte', 'carte-trouve')),
  total integer not null check (total between 1 and 1000),
  bonnes integer not null check (bonnes between 0 and total),
  duree_ms integer not null check (duree_ms between 0 and 100000000),
  details jsonb not null default '{}'::jsonb,
  jouee_le timestamptz not null default now()
);
create index if not exists qg_parties_joueur_idx on public.qg_parties (joueur_id, jouee_le desc);
create index if not exists qg_parties_theme_idx on public.qg_parties (theme, mode);

-- Aucun accès direct aux tables depuis le site : tout passe par les fonctions ci-dessous.
alter table public.qg_famille enable row level security;
alter table public.qg_joueurs enable row level security;
alter table public.qg_parties enable row level security;
revoke all on public.qg_famille, public.qg_joueurs, public.qg_parties from anon, authenticated;

-- ---------- Fonctions internes ----------

create or replace function public.qg_verifier_famille(p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from qg_famille where code_hash = crypt(coalesce(p_code, ''), code_hash)) then
    raise exception 'Code famille incorrect' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.qg_verifier_joueur(p_code text, p_pseudo text, p_pin text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  perform qg_verifier_famille(p_code);
  select id into v_id from qg_joueurs
    where lower(pseudo) = lower(trim(p_pseudo)) and pin_hash = crypt(coalesce(p_pin, ''), pin_hash);
  if v_id is null then
    raise exception 'Pseudo ou code secret incorrect' using errcode = 'P0002';
  end if;
  return v_id;
end $$;

-- ---------- Fonctions appelées par le site (rpc) ----------

create or replace function public.qg_inscription(p_code text, p_pseudo text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint; v_pseudo text := trim(p_pseudo);
begin
  perform qg_verifier_famille(p_code);
  if v_pseudo !~ '^[[:alnum:] _.-]{2,20}$' then
    raise exception 'Pseudo : 2 à 20 lettres ou chiffres' using errcode = 'P0003';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'Le code secret doit faire 4 chiffres' using errcode = 'P0004';
  end if;
  if exists (select 1 from qg_joueurs where lower(pseudo) = lower(v_pseudo)) then
    raise exception 'Ce pseudo est déjà pris' using errcode = 'P0005';
  end if;
  insert into qg_joueurs (pseudo, pin_hash) values (v_pseudo, crypt(p_pin, gen_salt('bf')))
    returning id into v_id;
  return json_build_object('id', v_id, 'pseudo', v_pseudo);
end $$;

create or replace function public.qg_connexion(p_code text, p_pseudo text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  v_id := qg_verifier_joueur(p_code, p_pseudo, p_pin);
  return (select json_build_object('id', id, 'pseudo', pseudo) from qg_joueurs where id = v_id);
end $$;

create or replace function public.qg_enregistrer_partie(
  p_code text, p_pseudo text, p_pin text,
  p_theme text, p_mode text, p_total integer, p_bonnes integer, p_duree_ms integer, p_details jsonb
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint; v_partie bigint;
begin
  v_id := qg_verifier_joueur(p_code, p_pseudo, p_pin);
  insert into qg_parties (joueur_id, theme, mode, total, bonnes, duree_ms, details)
    values (v_id, p_theme, p_mode, p_total, p_bonnes, p_duree_ms, coalesce(p_details, '{}'::jsonb))
    returning id into v_partie;
  return v_partie;
end $$;

-- Meilleure partie de chaque joueur pour chaque thème et chaque mode, plus le nombre de parties jouées.
create or replace function public.qg_classement(p_code text)
returns table (pseudo text, theme text, mode text, bonnes integer, total integer, duree_ms integer, jouee_le timestamptz, parties bigint)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform qg_verifier_famille(p_code);
  return query
  select distinct on (j.id, p.theme, p.mode)
    j.pseudo, p.theme, p.mode, p.bonnes, p.total, p.duree_ms, p.jouee_le,
    count(*) over (partition by j.id, p.theme, p.mode) as parties
  from qg_parties p join qg_joueurs j on j.id = p.joueur_id
  order by j.id, p.theme, p.mode, p.bonnes desc, p.duree_ms asc, p.jouee_le desc;
end $$;

-- Les 30 dernières parties de la famille (fil d'actualité).
create or replace function public.qg_dernieres_parties(p_code text)
returns table (pseudo text, theme text, mode text, bonnes integer, total integer, duree_ms integer, jouee_le timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform qg_verifier_famille(p_code);
  return query
  select j.pseudo, p.theme, p.mode, p.bonnes, p.total, p.duree_ms, p.jouee_le
  from qg_parties p join qg_joueurs j on j.id = p.joueur_id
  order by p.jouee_le desc limit 30;
end $$;

-- Historique complet d'un joueur (avec le détail des réponses ratées), pour sa page de progression.
create or replace function public.qg_historique(p_code text, p_pseudo text, p_pin text)
returns table (id bigint, theme text, mode text, bonnes integer, total integer, duree_ms integer, details jsonb, jouee_le timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  v_id := qg_verifier_joueur(p_code, p_pseudo, p_pin);
  return query
  select p.id, p.theme, p.mode, p.bonnes, p.total, p.duree_ms, p.details, p.jouee_le
  from qg_parties p where p.joueur_id = v_id
  order by p.jouee_le desc limit 500;
end $$;

grant execute on function
  public.qg_inscription(text, text, text),
  public.qg_connexion(text, text, text),
  public.qg_enregistrer_partie(text, text, text, text, text, integer, integer, integer, jsonb),
  public.qg_classement(text),
  public.qg_dernieres_parties(text),
  public.qg_historique(text, text, text)
to anon;

-- ---------- Code famille ----------
-- Remplacez CHANGEZ-MOI ci-dessous, puis lancez. Relancer ce bloc seul suffit pour changer le code plus tard.
insert into public.qg_famille (id, code_hash)
  values (1, extensions.crypt('CHANGEZ-MOI', extensions.gen_salt('bf')))
  on conflict (id) do update set code_hash = excluded.code_hash;
