// Thèmes, modes et construction des parties à partir des fichiers data/*.json.
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

export const GROUPES = [
  { id: 'pays', nom: 'Pays', description: 'Un drapeau s’affiche, retrouve le pays. Sur la carte : touche-le.' },
  { id: 'capitales', nom: 'Capitales', description: 'Un pays s’affiche, donne sa capitale.' },
  { id: 'usa', nom: 'États-Unis', description: 'Les 50 États et leurs capitales.' },
  { id: 'villes', nom: 'Grandes villes', description: 'Les 5 villes les plus peuplées des 10 premières économies du monde.' },
  { id: 'perso', nom: 'Personnalités', description: 'Quelle est, ou était, la nationalité de cette personne ? Trois infos à la clé.' }
];

export const MODES = [
  { id: 'qcm', nom: 'QCM', description: '4 propositions, une seule est juste.' },
  { id: 'saisie', nom: 'Saisie', description: 'Tape la réponse. Les accents et les petites fautes sont tolérés.' },
  { id: 'liste', nom: 'Nomme-les tous', description: 'Un chrono, un champ : tape tout ce que tu connais, dans l’ordre que tu veux.' },
  { id: 'carte', nom: 'Carte : nomme-les tous', description: 'Touche chaque élément sur la carte et tape sa réponse, contre la montre.', carte: true },
  { id: 'carte-trouve', nom: 'Carte : trouve-le', description: 'Un nom s’affiche, touche le bon endroit sur la carte.', carte: true }
];

export const MODES_CHRONO = ['liste', 'carte'];

// Secondes accordées par élément en mode chrono.
export const CHRONOS = [
  { id: 'rapide', nom: 'Rapide', secondes: 5 },
  { id: 'normal', nom: 'Normal', secondes: 10 },
  { id: 'large', nom: 'Large', secondes: 20 }
];

let cache = null;
export async function chargerDonnees() {
  if (cache) return cache;
  const [pays, etats, villes, perso] = await Promise.all(['pays', 'etats-usa', 'villes', 'personnalites'].map(async n => {
    const r = await fetch(`data/${n}.json`);
    if (!r.ok) throw new Error(`Impossible de charger ${n}`);
    return r.json();
  }));
  cache = {
    pays, etats, villes: villes.villes, economies: villes.pays, personnes: perso.personnes, domaines: perso.domaines,
    parCode: Object.fromEntries(pays.map(p => [p.code, p]))
  };
  return cache;
}

export function drapeau(code, largeur = 320) {
  return `https://flagcdn.com/w${largeur}/${code.toLowerCase()}.png`;
}

export function paysDuContinent(pays, continent) {
  return continent === 'monde' ? pays : pays.filter(p => p.continent === continent);
}

export function nomMode(id) { return (MODES.find(m => m.id === id) || { nom: id }).nom; }

/**
 * Description d'un thème : nom, groupe, consigne des modes texte, et vue de la carte.
 * prompt : 'drapeau' (grand drapeau à identifier) ou 'texte' (petit drapeau + titre).
 */
export function infoTheme(id, D) {
  const [groupe, reste] = [id.slice(0, id.indexOf('-')), id.slice(id.indexOf('-') + 1)];
  if (id === 'etats-usa') return { id, groupe: 'usa', nom: 'États des États-Unis', court: 'Les 50 États', unite: 'États', consigne: 'Quel est cet État ?', consigneCarte: 'Quel est cet État ?', prompt: 'drapeau', carte: { type: 'usa' } };
  if (id === 'capitales-usa') return { id, groupe: 'usa', nom: 'Capitales des États américains', court: 'Les 50 capitales', unite: 'capitales', consigne: 'Quelle est la capitale de cet État ?', consigneCarte: 'Quelle est sa capitale ?', prompt: 'texte', carte: { type: 'usa' } };
  if (groupe === 'pays' || groupe === 'capitales') {
    const c = CONTINENTS.find(x => x.id === reste); if (!c) return null;
    return groupe === 'pays'
      ? { id, groupe, nom: `Pays · ${c.nom}`, court: c.nom, unite: 'pays', consigne: 'Quel est ce pays ?', consigneCarte: 'Quel est ce pays ?', prompt: 'drapeau', carte: { type: 'monde', continent: c.id } }
      : { id, groupe, nom: `Capitales · ${c.nom}`, court: c.nom, unite: 'capitales', consigne: 'Quelle est la capitale ?', consigneCarte: 'Quelle est sa capitale ?', prompt: 'texte', carte: { type: 'monde', continent: c.id } };
  }
  if (groupe === 'perso') {
    const c = CONTINENTS.find(x => x.id === reste); if (!c) return null;
    return { id, groupe, nom: `Personnalités · ${c.nom}`, court: c.nom, unite: 'personnes', consigne: 'Quelle est sa nationalité ?', prompt: 'texte',
      carte: { type: 'monde', continent: c.id }, cibles: `pays-${c.id}`, modes: ['qcm', 'saisie', 'carte-trouve'] };
  }
  if (groupe === 'villes') {
    if (reste === 'monde') return { id, groupe, nom: 'Villes · Monde entier', court: 'Les 50 villes', unite: 'villes', consigne: 'Dans quel pays se trouve cette ville ?', consigneCarte: 'Quelle est cette ville ?', prompt: 'texte', carte: { type: 'points', pays: null } };
    const p = D?.parCode[reste]; if (!p) return null;
    return { id, groupe, nom: `Villes · ${p.nom}`, court: p.nom, drapeau: p.code, unite: 'villes', consigne: 'Quelle est cette ville ?', consigneCarte: 'Quelle est cette ville ?', prompt: 'texte', carte: { type: 'points', pays: p.code } };
  }
  return null;
}

export function nomTheme(id, D) { return infoTheme(id, D)?.nom || id; }

/** Tous les thèmes, groupés, pour l'écran d'accueil et les classements. */
export function listeThemes(D) {
  const t = [];
  for (const c of CONTINENTS) t.push(infoTheme(`pays-${c.id}`, D));
  for (const c of CONTINENTS) t.push(infoTheme(`capitales-${c.id}`, D));
  t.push(infoTheme('etats-usa', D), infoTheme('capitales-usa', D));
  for (const code of D.economies) t.push(infoTheme(`villes-${code}`, D));
  t.push(infoTheme('villes-monde', D));
  for (const c of CONTINENTS) t.push(infoTheme(`perso-${c.id}`, D));
  return t.map(x => ({ ...x, compte: elementsTheme(x.id, D).length })).filter(x => x.compte > 0);
}

/** Libellés acceptés comme bonne réponse au QCM (plusieurs pour une double nationalité). */
export function courts(el) { const r = repTexte(el); return r.courts || [r.court]; }

function ordinal(n) { return n === 1 ? '1re' : `${n}e`; }

/**
 * Les éléments d'un thème, sous une forme commune à tous les modes :
 *  id, court (libellé bref), reponse (libellé complet), formes (réponses acceptées), drapeau (url ou null),
 *  titre (ce que montrent les modes texte quand prompt = 'texte'), libelle (ligne des résultats), info, latlng.
 *  texte : réponse différente pour les modes texte quand la carte demande autre chose (villes du monde).
 */
export function elementsTheme(id, D) {
  const t = infoTheme(id, D);
  if (!t) return [];
  if (t.groupe === 'pays') {
    return paysDuContinent(D.pays, t.carte.continent).map(p => ({
      id: p.code, court: p.nom, reponse: p.nom, formes: [p.nom, ...(p.alias || [])], drapeau: drapeau(p.code), petitDrapeau: drapeau(p.code, 80),
      titre: p.nom, libelle: p.nom, info: p.statut, latlng: p.latlng
    }));
  }
  if (t.groupe === 'capitales') {
    return paysDuContinent(D.pays, t.carte.continent).map(p => ({
      id: p.code, court: p.capitales[0], reponse: p.capitale, formes: p.capitales, drapeau: drapeau(p.code), petitDrapeau: drapeau(p.code, 80),
      titre: p.nom, libelle: `${p.nom} → ${p.capitale}`, info: p.statut, latlng: p.latlng
    }));
  }
  if (id === 'etats-usa') {
    return D.etats.map(s => ({
      id: s.code, court: s.nom, reponse: s.nom, formes: [s.nom, ...(s.alias || [])], drapeau: drapeau(`us-${s.code}`), petitDrapeau: drapeau(`us-${s.code}`, 80),
      titre: s.nom, libelle: s.nom
    }));
  }
  if (id === 'capitales-usa') {
    return D.etats.map(s => ({
      id: s.code, court: s.capitale, reponse: s.capitale, formes: s.capitales || [s.capitale], drapeau: drapeau(`us-${s.code}`), petitDrapeau: drapeau(`us-${s.code}`, 80),
      titre: s.nom, libelle: `${s.nom} → ${s.capitale}`
    }));
  }
  if (t.groupe === 'perso') {
    const continent = t.carte.continent;
    const paysDuTheme = paysDuContinent(D.pays, continent);
    const personnes = D.personnes.filter(p => continent === 'monde' || D.parCode[p.pays[0]]?.continent === continent);
    return personnes.map(p => {
      const pays = p.pays.map(c => D.parCode[c]).filter(Boolean);
      const noms = pays.map(x => x.nom);
      return {
        id: p.id, court: noms.join(' / '), courts: noms, reponse: noms.join(' et '),
        formes: pays.flatMap(x => [x.nom, ...(x.alias || []), ...(x.gentile || [])]),
        drapeau: drapeau(pays[0].code), petitDrapeau: drapeau(pays[0].code, 80),
        titre: p.nom, sousTitre: `${D.domaines[p.domaine] || p.domaine} · ${p.vie}`,
        libelle: `${p.nom} → ${noms.join(' / ')}`, infos: p.infos, pays: p.pays,
        distracteurs: paysDuTheme.map(x => x.nom)
      };
    });
  }
  if (t.groupe === 'villes') {
    const villes = t.carte.pays ? D.villes.filter(v => v.pays === t.carte.pays) : D.villes;
    return villes.map(v => {
      const p = D.parCode[v.pays];
      const el = {
        id: `${v.pays}-${v.rang}`, court: v.nom, reponse: v.nom, formes: [v.nom, ...(v.alias || [])], drapeau: drapeau(v.pays), petitDrapeau: drapeau(v.pays, 80),
        titre: t.carte.pays ? `${ordinal(v.rang)} ville ${de(p.nom, p.code)}` : v.nom,
        libelle: t.carte.pays ? `${ordinal(v.rang)} ville : ${v.nom}` : `${v.nom} → ${p.nom}`,
        info: `${v.nom} : environ ${v.pop >= 10 ? Math.round(v.pop) : v.pop.toLocaleString('fr-FR')} million${v.pop >= 2 ? 's' : ''} d’habitants (${ordinal(v.rang)} ville ${de(p.nom, p.code)}).`,
        latlng: v.latlng, pays: v.pays
      };
      // Thème « monde » : les modes texte demandent le pays de la ville, la carte demande la ville.
      if (!t.carte.pays) el.texte = { court: p.nom, reponse: p.nom, formes: [p.nom, ...(p.alias || [])] };
      return el;
    });
  }
  return [];
}

// « ville de France », « du Brésil », « des États-Unis », « d'Italie »…
const AVEC_ARTICLE = { JP: 'du Japon', BR: 'du Brésil', CA: 'du Canada', US: 'des États-Unis', GB: 'du Royaume-Uni', MX: 'du Mexique', PT: 'du Portugal', DK: 'du Danemark', NL: 'des Pays-Bas', MA: 'du Maroc', PE: 'du Pérou', CL: 'du Chili', VN: 'du Vietnam', PK: 'du Pakistan', IR: 'd’Iran', IQ: 'd’Irak', IL: 'd’Israël' };
export function de(nomPays, code) {
  if (code && AVEC_ARTICLE[code]) return AVEC_ARTICLE[code];
  if (/^[AEIOUYÉÈÊÎÔÛ]/.test(nomPays)) return `d’${nomPays}`;
  return `de ${nomPays}`;
}

/** Réponse attendue par les modes texte (QCM, saisie, liste). */
export function repTexte(el) { return el.texte || el; }

/** Génère l'ordre des questions et, pour le QCM, les propositions. */
export function genererPartie(theme, mode, D, options = {}) {
  const elements = elementsTheme(theme, D);
  const ordre = melanger(elements.map(e => e.id));
  const partie = { theme, mode, ordre, index: 0, reponses: {}, debut: Date.now(), ecoule: 0 };
  if (mode === 'qcm') {
    // Les propositions sont des libellés : la bonne réponse et trois autres, distincts
    // (plusieurs villes d'un même pays donnent la même réponse « pays » ; une double nationalité en exclut deux).
    partie.choix = {};
    for (const e of elements) {
      const bons = courts(e);
      const vivier = e.distracteurs || elements.map(x => repTexte(x).court);
      const vus = new Set(bons); const labels = [bons[0]];
      for (const c of melanger(vivier)) { if (vus.has(c)) continue; vus.add(c); labels.push(c); if (labels.length === 4) break; }
      partie.choix[e.id] = melanger(labels);
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
