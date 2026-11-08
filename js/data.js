// Thèmes, modes et construction des parties à partir de data/pays.json.
import { melanger } from './texte.js';

export const CONTINENTS = [
  { id: 'europe', nom: 'Europe' },
  { id: 'asie', nom: 'Asie' },
  { id: 'afrique', nom: 'Afrique' },
  { id: 'amerique-nord', nom: 'Amérique du Nord' },
  { id: 'amerique-centrale', nom: 'Amérique centrale et Caraïbes' },
  { id: 'amerique-sud', nom: 'Amérique du Sud' },
  { id: 'oceanie', nom: 'Océanie' },
  { id: 'monde', nom: 'Monde entier' }
];

export const TYPES = [
  { id: 'pays', nom: 'Pays', question: 'Quel est ce pays ?', description: 'Un drapeau s’affiche, retrouve le pays.' },
  { id: 'capitales', nom: 'Capitales', question: 'Quelle est la capitale ?', description: 'Un pays s’affiche, donne sa capitale.' }
];

export const MODES = [
  { id: 'qcm', nom: 'QCM', description: '4 propositions, une seule est juste.' },
  { id: 'saisie', nom: 'Saisie', description: 'Tape la réponse. Les accents et les petites fautes sont tolérés.' },
  { id: 'liste', nom: 'Nomme-les tous', description: 'Un chrono, un champ : tape tout ce que tu connais, dans l’ordre que tu veux.' },
  { id: 'carte', nom: 'Carte : nomme-les tous', description: 'Touche chaque pays sur la carte et tape sa réponse, contre la montre.', carte: true },
  { id: 'carte-trouve', nom: 'Carte : trouve-le', description: 'Un nom s’affiche, touche le bon pays sur la carte.', carte: true }
];

export const MODES_CHRONO = ['liste', 'carte'];

// Secondes accordées par élément en mode « Nomme-les tous ».
export const CHRONOS = [
  { id: 'rapide', nom: 'Rapide', secondes: 5 },
  { id: 'normal', nom: 'Normal', secondes: 10 },
  { id: 'large', nom: 'Large', secondes: 20 }
];

let cachePays = null;
export async function chargerPays() {
  if (cachePays) return cachePays;
  const r = await fetch('data/pays.json');
  if (!r.ok) throw new Error('Impossible de charger les pays');
  cachePays = await r.json();
  return cachePays;
}

export function themeId(type, continent) { return `${type}-${continent}`; }

export function decouperTheme(id) {
  const type = TYPES.find(t => id.startsWith(t.id + '-'));
  if (!type) return null;
  const continent = CONTINENTS.find(c => c.id === id.slice(type.id.length + 1));
  return continent ? { type, continent } : null;
}

export function nomTheme(id) {
  const d = decouperTheme(id);
  return d ? `${d.type.nom} · ${d.continent.nom}` : id;
}

export function nomMode(id) { return (MODES.find(m => m.id === id) || { nom: id }).nom; }

export function drapeau(code, largeur = 320) {
  return `https://flagcdn.com/w${largeur}/${code.toLowerCase()}.png`;
}

export function paysDuContinent(pays, continent) {
  return continent === 'monde' ? pays : pays.filter(p => p.continent === continent);
}

/** Les éléments d'un thème : ce qu'on montre, ce qu'on attend, ce qu'on accepte. */
export function elementsTheme(theme, pays) {
  const d = decouperTheme(theme);
  if (!d) return [];
  // court : libellé bref (propositions du QCM, pastilles) ; reponse : libellé complet affiché à la correction.
  return paysDuContinent(pays, d.continent.id).map(p => d.type.id === 'pays'
    ? { id: p.code, pays: p, court: p.nom, reponse: p.nom, formes: [p.nom, ...(p.alias || [])] }
    : { id: p.code, pays: p, court: p.capitales[0], reponse: p.capitale, formes: p.capitales });
}

/** Génère l'ordre des questions et, pour le QCM, les propositions. */
export function genererPartie(theme, mode, pays, options = {}) {
  const elements = elementsTheme(theme, pays);
  const ordre = melanger(elements.map(e => e.id));
  const partie = { theme, mode, ordre, index: 0, reponses: {}, debut: Date.now(), ecoule: 0 };
  if (mode === 'qcm') {
    partie.choix = {};
    for (const e of elements) {
      const autres = melanger(elements.filter(x => x.id !== e.id)).slice(0, 3);
      partie.choix[e.id] = melanger([e.id, ...autres.map(a => a.id)]);
    }
  }
  if (MODES_CHRONO.includes(mode)) {
    const chrono = CHRONOS.find(c => c.id === options.chrono) || CHRONOS[1];
    partie.chrono = chrono.id;
    partie.dureeMax = elements.length * chrono.secondes * 1000;
    partie.trouves = [];
    partie.erreurs = 0;
  }
  return partie;
}
