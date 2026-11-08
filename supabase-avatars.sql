-- Quiz géo, mise à jour « avatars » : à coller dans Supabase > SQL Editor après supabase-quiz.sql.
-- Ajoute un avatar par joueur et le renvoie dans la connexion et les classements.

alter table public.qg_joueurs add column if not exists avatar text check (avatar is null or char_length(avatar) <= 30);

create or replace function public.qg_definir_avatar(p_code text, p_pseudo text, p_pin text, p_avatar text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  v_id := qg_verifier_joueur(p_code, p_pseudo, p_pin);
  update qg_joueurs set avatar = nullif(p_avatar, '') where id = v_id;
end $$;

create or replace function public.qg_connexion(p_code text, p_pseudo text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  v_id := qg_verifier_joueur(p_code, p_pseudo, p_pin);
  return (select json_build_object('id', id, 'pseudo', pseudo, 'avatar', avatar) from qg_joueurs where id = v_id);
end $$;

drop function if exists public.qg_classement(text);
create or replace function public.qg_classement(p_code text)
returns table (pseudo text, avatar text, theme text, mode text, bonnes integer, total integer, duree_ms integer, jouee_le timestamptz, parties bigint)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform qg_verifier_famille(p_code);
  return query
  select distinct on (j.id, p.theme, p.mode)
    j.pseudo, j.avatar, p.theme, p.mode, p.bonnes, p.total, p.duree_ms, p.jouee_le,
    count(*) over (partition by j.id, p.theme, p.mode) as parties
  from qg_parties p join qg_joueurs j on j.id = p.joueur_id
  order by j.id, p.theme, p.mode, p.bonnes desc, p.duree_ms asc, p.jouee_le desc;
end $$;

drop function if exists public.qg_dernieres_parties(text);
create or replace function public.qg_dernieres_parties(p_code text)
returns table (pseudo text, avatar text, theme text, mode text, bonnes integer, total integer, duree_ms integer, jouee_le timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform qg_verifier_famille(p_code);
  return query
  select j.pseudo, j.avatar, p.theme, p.mode, p.bonnes, p.total, p.duree_ms, p.jouee_le
  from qg_parties p join qg_joueurs j on j.id = p.joueur_id
  order by p.jouee_le desc limit 30;
end $$;

grant execute on function
  public.qg_definir_avatar(text, text, text, text),
  public.qg_connexion(text, text, text),
  public.qg_classement(text),
  public.qg_dernieres_parties(text)
to anon;
