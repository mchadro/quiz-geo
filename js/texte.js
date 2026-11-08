// Comparaison tolérante des réponses tapées : accents, majuscules, articles, traits d'union et petites fautes.

const ARTICLES = /\b(le|la|les|l|the|of|de|du|des|d|el|al|la)\b/g;

export function normaliser(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`´ʻ\-_.,():;]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(ARTICLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function tolerance(longueur) {
  if (longueur >= 10) return 2;
  if (longueur >= 5) return 1;
  return 0;
}

/**
 * Cherche la saisie parmi des candidats { id, formes: [chaînes acceptées] }.
 * Retourne { id, exact } ou null. Une correspondance exacte l'emporte toujours ;
 * sinon la plus proche dans la tolérance, à condition qu'elle soit unique.
 */
export function trouver(saisie, candidats) {
  const s = normaliser(saisie);
  if (!s) return null;
  for (const c of candidats) {
    if (c.formes.some(f => normaliser(f) === s)) return { id: c.id, exact: true };
  }
  let meilleur = null, meilleureDist = Infinity, ambigu = false;
  for (const c of candidats) {
    for (const f of c.formes) {
      const n = normaliser(f);
      const d = distance(s, n);
      if (d > tolerance(Math.min(s.length, n.length))) continue;
      if (d < meilleureDist) { meilleur = c; meilleureDist = d; ambigu = false; }
      else if (d === meilleureDist && c !== meilleur) ambigu = true;
    }
  }
  return meilleur && !ambigu ? { id: meilleur.id, exact: false } : null;
}

export function melanger(tableau) {
  const t = tableau.slice();
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

export function formaterDuree(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

export function formaterDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function echapper(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
