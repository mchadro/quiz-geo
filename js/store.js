// Comptes et scores : Supabase quand il est configuré, sinon le navigateur.
import { ONLINE } from './config.js';

const local = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* rien */ } }
};

// « ?local » dans l'adresse force le mode hors ligne (tests sans toucher à Supabase).
const forceLocal = new URLSearchParams(location.search).has('local');
export const enLigne = () => !forceLocal && Boolean(ONLINE.url && ONLINE.key);

// ---------- Session ----------
export function session() { return local.get('qg.session'); }
export function ouvrirSession(s) { local.set('qg.session', s); }
export function fermerSession() { local.del('qg.session'); }
export function codeFamille() { return local.get('qg.code', ''); }
export function retenirCode(code) { local.set('qg.code', code); }

// ---------- Partie en cours / préférences ----------
export function partieEnCours() { return local.get('qg.partie'); }
export function sauverPartie(p) { local.set('qg.partie', p); }
export function effacerPartie() { local.del('qg.partie'); }
export function prefs() { return local.get('qg.prefs', { chrono: 'normal', mode: 'saisie' }); }
export function sauverPrefs(p) { local.set('qg.prefs', { ...prefs(), ...p }); }

// ---------- Appels Supabase ----------
class ErreurServeur extends Error {}

async function rpc(nom, params) {
  const r = await fetch(`${ONLINE.url.replace(/\/+$/, '')}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: { apikey: ONLINE.key, Authorization: `Bearer ${ONLINE.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!r.ok) {
    let msg = `Erreur ${r.status}`;
    try { const j = await r.json(); msg = j.message || j.hint || msg; } catch { /* pas de JSON */ }
    throw new ErreurServeur(msg);
  }
  const texte = await r.text();
  return texte ? JSON.parse(texte) : null;
}

// ---------- Backend local (hors ligne) ----------
const hors = {
  joueurs() { return local.get('qg.local.joueurs', []); },
  parties() { return local.get('qg.local.parties', []); },
  async inscription(code, pseudo, pin) {
    const j = this.joueurs();
    if (j.some(x => x.pseudo.toLowerCase() === pseudo.toLowerCase())) throw new Error('Ce pseudo est déjà pris');
    const joueur = { id: Date.now(), pseudo, pin, avatar: null };
    local.set('qg.local.joueurs', [...j, joueur]);
    return { id: joueur.id, pseudo, avatar: null };
  },
  async connexion(code, pseudo, pin) {
    const j = this.joueurs().find(x => x.pseudo.toLowerCase() === pseudo.toLowerCase() && x.pin === pin);
    if (!j) throw new Error('Pseudo ou code secret incorrect');
    return { id: j.id, pseudo: j.pseudo, avatar: j.avatar || null };
  },
  async definirAvatar(s, avatar) {
    local.set('qg.local.joueurs', this.joueurs().map(x => (x.id === s.id ? { ...x, avatar } : x)));
  },
  avatarDe(pseudo) { return (this.joueurs().find(x => x.pseudo === pseudo) || {}).avatar || null; },
  async enregistrer(s, p) {
    const partie = { id: Date.now(), pseudo: s.pseudo, ...p, jouee_le: new Date().toISOString() };
    local.set('qg.local.parties', [partie, ...this.parties()].slice(0, 500));
    return partie.id;
  },
  async classement() {
    const meilleures = new Map();
    for (const p of this.parties()) {
      const k = `${p.pseudo}|${p.theme}|${p.mode}`;
      const m = meilleures.get(k);
      if (!m) meilleures.set(k, { ...p, parties: 1 });
      else { m.parties++; if (p.bonnes > m.bonnes || (p.bonnes === m.bonnes && p.duree_ms < m.duree_ms)) Object.assign(m, p, { parties: m.parties }); }
    }
    return [...meilleures.values()].map(p => ({ ...p, avatar: this.avatarDe(p.pseudo) }));
  },
  async dernieres() { return this.parties().slice(0, 30).map(p => ({ ...p, avatar: this.avatarDe(p.pseudo) })); },
  async historique(s) { return this.parties().filter(p => p.pseudo === s.pseudo); }
};

// ---------- API ----------
export async function inscription(code, pseudo, pin) {
  return enLigne() ? rpc('qg_inscription', { p_code: code, p_pseudo: pseudo, p_pin: pin }) : hors.inscription(code, pseudo, pin);
}

export async function connexion(code, pseudo, pin) {
  return enLigne() ? rpc('qg_connexion', { p_code: code, p_pseudo: pseudo, p_pin: pin }) : hors.connexion(code, pseudo, pin);
}

/** Enregistre une partie ; si le réseau manque, elle est mise en attente et renvoyée plus tard. */
export async function enregistrerPartie(p) {
  const s = session();
  if (!s) throw new Error('Pas de joueur connecté');
  if (!enLigne()) return hors.enregistrer(s, p);
  try {
    return await envoyer(s, p);
  } catch (e) {
    if (e instanceof ErreurServeur) throw e;
    local.set('qg.attente', [...local.get('qg.attente', []), p]);
    throw new Error('Pas de réseau : la partie sera envoyée plus tard');
  }
}

function envoyer(s, p) {
  return rpc('qg_enregistrer_partie', {
    p_code: codeFamille(), p_pseudo: s.pseudo, p_pin: s.pin,
    p_theme: p.theme, p_mode: p.mode, p_total: p.total, p_bonnes: p.bonnes, p_duree_ms: p.duree_ms, p_details: p.details
  });
}

export async function synchroniser() {
  const s = session(); const attente = local.get('qg.attente', []);
  if (!s || !enLigne() || !attente.length) return 0;
  const restantes = [];
  for (const p of attente) {
    try { await envoyer(s, p); } catch (e) { if (!(e instanceof ErreurServeur)) restantes.push(p); }
  }
  local.set('qg.attente', restantes);
  return attente.length - restantes.length;
}

/** Change l'avatar du joueur connecté et le mémorise dans la session. */
export async function definirAvatar(avatar) {
  const s = session();
  if (!s) throw new Error('Pas de joueur connecté');
  if (enLigne()) await rpc('qg_definir_avatar', { p_code: codeFamille(), p_pseudo: s.pseudo, p_pin: s.pin, p_avatar: avatar });
  else await hors.definirAvatar(s, avatar);
  ouvrirSession({ ...s, avatar });
}

export async function classement() {
  return enLigne() ? rpc('qg_classement', { p_code: codeFamille() }) : hors.classement();
}

export async function dernieresParties() {
  return enLigne() ? rpc('qg_dernieres_parties', { p_code: codeFamille() }) : hors.dernieres();
}

export async function historique() {
  const s = session();
  if (!s) return [];
  return enLigne() ? rpc('qg_historique', { p_code: codeFamille(), p_pseudo: s.pseudo, p_pin: s.pin }) : hors.historique(s);
}
