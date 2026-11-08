// Carte cliquable : contours Natural Earth (world-atlas 50m) et États américains (us-atlas), projection d3-geo,
// zoom au doigt ou à la molette. Les librairies (UMD) et les contours ne sont chargés qu'au premier mode carte.
//
// Trois vues : { type: 'monde', continent } (pays cliquables), { type: 'usa' } (États cliquables),
// { type: 'points', pays } (villes : points cliquables sur le fond du pays, ou du monde si pays = null).

const VUES = {
  europe: { points: box(-25, 34, 45, 72), rotate: [-15, 0], paralleles: [40, 65] },
  asie: { points: box(25, -12, 150, 78), rotate: [-90, 0], paralleles: [15, 55] },
  afrique: { points: box(-20, -37, 55, 40), rotate: [-18, 0], paralleles: [-20, 20] },
  'amerique-nord': { points: box(-170, 7, -50, 84), rotate: [100, 0], paralleles: [25, 60] },
  'amerique-centrale': { points: box(-95, 6, -58, 28), rotate: [78, 0], paralleles: [10, 25] },
  'amerique-sud': { points: box(-85, -57, -33, 14), rotate: [60, 0], paralleles: [-35, -5] },
  oceanie: { points: [[110, 22], [150, 22], [180, 10], [-170, 5], [-170, -25], [180, -50], [150, -50], [110, -45], [110, -10]], rotate: [-170, 0], paralleles: [-30, -5] }
};
function box(l1, b1, l2, b2) {
  const pts = [];
  for (let lon = l1; lon <= l2; lon += (l2 - l1) / 8) { pts.push([lon, b1], [lon, b2]); }
  for (let lat = b1; lat <= b2; lat += (b2 - b1) / 8) { pts.push([l1, lat], [l2, lat]); }
  return pts;
}

// Territoires sans code ISO ou disputés, rattachés à un pays du quiz par leur nom Natural Earth.
const PAR_NOM = { Kosovo: 'XK', Somaliland: 'SO', 'N. Cyprus': 'CY' };

const chargements = {};
function script(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error(`Chargement impossible : ${src}`)); document.head.appendChild(s); });
}
async function librairies() {
  if (!window.d3?.geoPath) { await script('lib/d3-array.min.js'); await script('lib/d3-geo.min.js'); }
  if (!window.topojson) await script('lib/topojson-client.min.js');
}
async function topo(fichier, objet) {
  const r = await fetch(`data/${fichier}`);
  if (!r.ok) throw new Error('Impossible de charger la carte');
  const t = await r.json();
  return window.topojson.feature(t, t.objects[objet]).features;
}

/** Contours du monde : { features, parCode } (code ISO2 → features). */
export function chargerMonde(D) {
  return chargements.monde ||= (async () => {
    await librairies();
    const features = await topo('monde-50m.json', 'countries');
    const parCcn3 = Object.fromEntries(D.pays.filter(p => p.ccn3).map(p => [p.ccn3, p.code]));
    const parCode = {};
    for (const f of features) {
      f.code = parCcn3[f.id] || PAR_NOM[f.properties.name] || null;
      if (f.code) (parCode[f.code] ||= []).push(f);
    }
    return { features, parCode };
  })().catch(e => { chargements.monde = null; throw e; });
}

/** Contours des États américains : { features, parCode } (code postal → features). */
export function chargerUsa(D) {
  return chargements.usa ||= (async () => {
    await librairies();
    const features = await topo('usa-10m.json', 'states');
    const parFips = Object.fromEntries(D.etats.map(s => [s.fips, s.code]));
    const parCode = {};
    for (const f of features) { f.code = parFips[f.id] || null; if (f.code) (parCode[f.code] ||= []).push(f); }
    return { features, parCode };
  })().catch(e => { chargements.usa = null; throw e; });
}

export async function chargerFond(vue, D) {
  return vue.type === 'usa' ? chargerUsa(D) : chargerMonde(D);
}

const aire = (d3, g) => d3.geoArea(g);
function polygones(d3, feature) {
  const g = feature.geometry;
  return g.type === 'MultiPolygon' ? g.coordinates.map(c => ({ type: 'Polygon', coordinates: c })) : [g];
}
function plusGrandPolygone(d3, features) {
  return features.flatMap(f => polygones(d3, f)).reduce((a, b) => (aire(d3, a) > aire(d3, b) ? a : b));
}

/**
 * Dessine la carte dans `conteneur`. elements : { id, court, latlng? } ; onClic(id) à chaque toucher d'un élément.
 */
export function creerCarte(conteneur, fond, { vue, elements, onClic }) {
  const d3 = window.d3;
  const ids = new Set(elements.map(e => e.id));
  const parId = Object.fromEntries(elements.map(e => [e.id, e]));
  const W = Math.max(300, conteneur.clientWidth), H = Math.max(240, conteneur.clientHeight);
  const marge = 10, cadre = [[marge, marge], [W - marge, H - marge]];
  const points = vue.type === 'points';
  const paysFond = points && vue.pays ? (fond.parCode[vue.pays] || []) : [];

  let projection;
  if (vue.type === 'usa') {
    projection = d3.geoAlbersUsa().fitExtent(cadre, { type: 'FeatureCollection', features: fond.features.filter(f => f.code) });
  } else if (points && vue.pays) {
    // Cadrer sur les polygones du pays qui contiennent au moins une ville (évite la Guyane pour la France, l'Alaska pour les États-Unis).
    const villes = elements.map(e => [e.latlng[1], e.latlng[0]]);
    let polys = paysFond.flatMap(f => polygones(d3, f)).filter(p => villes.some(v => d3.geoContains(p, v)));
    if (!polys.length) polys = [plusGrandPolygone(d3, paysFond)];
    const zone = { type: 'MultiPolygon', coordinates: polys.map(p => p.coordinates) };
    const [lon, lat] = d3.geoCentroid(zone);
    projection = d3.geoConicEqualArea().rotate([-lon, 0]).parallels([lat - 12, lat + 12]).fitExtent([[marge * 2, marge * 2], [W - marge * 2, H - marge * 2]], zone);
  } else if (vue.type === 'monde' && VUES[vue.continent]) {
    const v = VUES[vue.continent];
    projection = d3.geoConicEqualArea().rotate(v.rotate).parallels(v.paralleles).fitExtent(cadre, { type: 'MultiPoint', coordinates: v.points });
  } else {
    projection = d3.geoNaturalEarth1().fitExtent(cadre, { type: 'Sphere' });
  }
  const chemin = d3.geoPath(projection);

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'carte-svg', width: W, height: H });
  svg.appendChild(el('rect', { width: W, height: H, class: 'carte-mer' }));
  const gMonde = el('g'); const gSur = el('g', { class: 'carte-sur' });
  svg.appendChild(gMonde); svg.appendChild(gSur);
  conteneur.innerHTML = ''; conteneur.appendChild(svg);

  // Terres : contexte en gris, puis les surfaces du thème (cliquables sauf en vue points).
  const pathsParId = {};
  const estTheme = f => f.code && (points ? (vue.pays ? f.code === vue.pays : true) : ids.has(f.code));
  for (const f of fond.features) {
    if (estTheme(f)) continue;
    if (f.properties.name === 'Antarctica' && vue.continent !== 'monde') continue;
    const d = chemin(f); if (!d) continue;
    gMonde.appendChild(el('path', { d, class: 'carte-autre' }));
  }
  for (const f of fond.features.filter(estTheme)) {
    const d = chemin(f); if (!d) continue;
    const p = el('path', { d, class: points ? 'carte-fond-pays' : 'carte-pays' });
    if (!points) { p.dataset.code = f.code; (pathsParId[f.code] ||= []).push(p); }
    gMonde.appendChild(p);
  }

  // Repères (points, pays minuscules ou sans contour) et étiquettes : couche en coordonnées écran.
  const centres = {};
  for (const e of elements) {
    let centre = null, petit = true, taille = 0;
    const fs = points ? [] : (fond.parCode[e.id] || []);
    if (fs.length) {
      const poly = plusGrandPolygone(d3, fs);
      centre = chemin.centroid(poly);
      const [[x0, y0], [x1, y1]] = chemin.bounds(poly);
      taille = Math.min(x1 - x0, y1 - y0); petit = taille < 14;
    }
    if ((!centre || Number.isNaN(centre[0])) && e.latlng) centre = projection([e.latlng[1], e.latlng[0]]);
    centres[e.id] = { xy: centre, petit, taille };
  }
  const marqueurs = {}, etiquettes = {};
  for (const [id, c] of Object.entries(centres)) {
    if (!c.petit || !c.xy) continue;
    const m = el('circle', { cx: c.xy[0], cy: c.xy[1], r: points ? 8 : 7, class: points ? 'carte-marqueur point' : 'carte-marqueur' });
    m.dataset.code = id; gSur.appendChild(m); marqueurs[id] = m;
  }

  // Zoom et déplacement.
  let k = 1, tx = 0, ty = 0;
  const appliquer = () => {
    gMonde.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    for (const [id, m] of Object.entries(marqueurs)) {
      const c = centres[id]; m.setAttribute('cx', c.xy[0] * k + tx); m.setAttribute('cy', c.xy[1] * k + ty);
      // Le repère disparaît dès que le pays, zoomé, devient assez grand pour être touché directement.
      m.style.display = c.taille * k >= 14 ? 'none' : '';
    }
    for (const [id, t] of Object.entries(etiquettes)) { const c = centres[id]; t.setAttribute('x', c.xy[0] * k + tx); t.setAttribute('y', c.xy[1] * k + ty - (c.petit ? 12 : 0)); }
  };
  const zoomer = (facteur, px, py) => {
    const nk = Math.min(16, Math.max(1, k * facteur)); const f = nk / k;
    tx = px - (px - tx) * f; ty = py - (py - ty) * f; k = nk;
    if (k === 1) { tx = 0; ty = 0; }
    appliquer();
  };
  const pointeurs = new Map(); let depart = null, bouge = false, dist0 = 0, cible = null;
  const pos = ev => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) * W / r.width, (ev.clientY - r.top) * H / r.height]; };
  svg.addEventListener('pointerdown', ev => {
    try { svg.setPointerCapture(ev.pointerId); } catch { /* pointeur synthétique */ }
    pointeurs.set(ev.pointerId, pos(ev));
    if (pointeurs.size === 1) { depart = pos(ev); bouge = false; cible = ev.target.dataset?.code || null; }
    else if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; dist0 = Math.hypot(a[0] - b[0], a[1] - b[1]); cible = null; }
  });
  svg.addEventListener('pointermove', ev => {
    if (!pointeurs.has(ev.pointerId)) return;
    const avant = pointeurs.get(ev.pointerId); const p = pos(ev); pointeurs.set(ev.pointerId, p);
    if (pointeurs.size === 1) {
      if (depart && Math.hypot(p[0] - depart[0], p[1] - depart[1]) > 6) bouge = true;
      if (bouge) { tx += p[0] - avant[0]; ty += p[1] - avant[1]; appliquer(); }
    } else if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()]; const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (dist0 > 0) zoomer(dist / dist0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      dist0 = dist; bouge = true;
    }
  });
  const fin = ev => {
    if (!pointeurs.has(ev.pointerId)) return;
    pointeurs.delete(ev.pointerId);
    if (pointeurs.size === 0) {
      if (!bouge && cible && ids.has(cible)) onClic(cible);
      depart = null; cible = null;
    } else if (pointeurs.size === 1) { depart = [...pointeurs.values()][0]; bouge = true; }
  };
  svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
  svg.addEventListener('wheel', ev => { ev.preventDefault(); const [x, y] = pos(ev); zoomer(ev.deltaY < 0 ? 1.25 : 0.8, x, y); }, { passive: false });

  const boutons = document.createElement('div'); boutons.className = 'carte-zoom';
  boutons.innerHTML = '<button type="button" aria-label="Zoom avant">+</button><button type="button" aria-label="Zoom arrière">−</button><button type="button" aria-label="Recadrer">⌂</button>';
  const [bPlus, bMoins, bReset] = boutons.querySelectorAll('button');
  bPlus.addEventListener('click', () => zoomer(1.5, W / 2, H / 2));
  bMoins.addEventListener('click', () => zoomer(1 / 1.5, W / 2, H / 2));
  bReset.addEventListener('click', () => { k = 1; tx = 0; ty = 0; appliquer(); });
  conteneur.appendChild(boutons);

  function etat(id, classe, actif) {
    for (const p of pathsParId[id] || []) p.classList.toggle(classe, actif);
    marqueurs[id]?.classList.toggle(classe, actif);
  }
  return {
    svg,
    selectionner(id) { for (const i of ids) etat(i, 'selection', i === id); },
    marquer(id, classe) { etat(id, 'erreur', false); etat(id, 'selection', false); etat(id, classe, true); },
    demarquer(id, classe) { etat(id, classe, false); },
    clignoter(id, classe = 'erreur', ms = 700) { etat(id, classe, true); setTimeout(() => etat(id, classe, false), ms); },
    etiqueter(id, texte) {
      if (etiquettes[id]) return;
      const c = centres[id]; if (!c?.xy) return;
      const t = el('text', { class: 'carte-etiquette', 'text-anchor': 'middle' });
      t.textContent = texte; gSur.appendChild(t); etiquettes[id] = t; appliquer();
    },
    nom: id => parId[id]?.court || id
  };
}
