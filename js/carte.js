// Carte cliquable : contours Natural Earth (world-atlas 50m), projection d3-geo, zoom au doigt ou à la molette.
// Les librairies (UMD) et le TopoJSON ne sont chargés que lorsqu'un mode carte démarre.

// Cadrage par continent : points (lon, lat) que la vue doit contenir, rotation et parallèles de la projection conique.
const VUES = {
  europe: { points: box(-25, 34, 45, 72), rotate: [-15, 0], paralleles: [40, 65] },
  asie: { points: box(25, -12, 150, 78), rotate: [-90, 0], paralleles: [15, 55] },
  afrique: { points: box(-20, -37, 55, 40), rotate: [-18, 0], paralleles: [-20, 20] },
  'amerique-nord': { points: box(-170, 7, -50, 84), rotate: [100, 0], paralleles: [25, 60] },
  'amerique-centrale': { points: box(-95, 6, -58, 28), rotate: [78, 0], paralleles: [10, 25] },
  'amerique-sud': { points: box(-85, -57, -33, 14), rotate: [60, 0], paralleles: [-35, -5] },
  oceanie: { points: [[110, 22], [150, 22], [180, 10], [-170, 5], [-170, -25], [180, -50], [150, -50], [110, -45], [110, -10]], rotate: [-170, 0], paralleles: [-30, -5] },
  monde: { points: null }
};
function box(l1, b1, l2, b2) {
  const pts = [];
  for (let lon = l1; lon <= l2; lon += (l2 - l1) / 8) { pts.push([lon, b1], [lon, b2]); }
  for (let lat = b1; lat <= b2; lat += (b2 - b1) / 8) { pts.push([l1, lat], [l2, lat]); }
  return pts;
}

// Territoires sans code ISO ou disputés, rattachés à un pays du quiz par leur nom Natural Earth.
const PAR_NOM = { Kosovo: 'XK', Somaliland: 'SO', 'N. Cyprus': 'CY' };

let chargement = null;
function script(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error(`Chargement impossible : ${src}`)); document.head.appendChild(s); });
}

/** Charge d3-geo, topojson et les contours ; renvoie { features, parCode } (parCode : code ISO2 → features). */
export function chargerMonde(pays) {
  if (!chargement) {
    chargement = (async () => {
      if (!window.d3?.geoPath) { await script('lib/d3-array.min.js'); await script('lib/d3-geo.min.js'); }
      if (!window.topojson) await script('lib/topojson-client.min.js');
      const r = await fetch('data/monde-50m.json');
      if (!r.ok) throw new Error('Impossible de charger la carte');
      const topo = await r.json();
      const features = window.topojson.feature(topo, topo.objects.countries).features;
      const parCcn3 = Object.fromEntries(pays.filter(p => p.ccn3).map(p => [p.ccn3, p.code]));
      const parCode = {};
      for (const f of features) {
        f.code = parCcn3[f.id] || PAR_NOM[f.properties.name] || null;
        if (f.code) (parCode[f.code] ||= []).push(f);
      }
      return { features, parCode };
    })();
    chargement.catch(() => { chargement = null; });
  }
  return chargement;
}

/**
 * Dessine la carte dans `conteneur`.
 * elements : les éléments du thème ({ id, pays, court }) ; actifs : codes cliquables.
 * onClic(code) est appelé quand un pays actif est touché.
 */
export function creerCarte(conteneur, monde, { continent, elements, onClic }) {
  const d3 = window.d3;
  const codes = new Set(elements.map(e => e.id));
  const parId = Object.fromEntries(elements.map(e => [e.id, e]));
  const W = Math.max(300, conteneur.clientWidth), H = Math.max(240, conteneur.clientHeight);
  const vue = VUES[continent] || VUES.monde;
  const marge = 10;
  let projection;
  if (vue.points) {
    projection = d3.geoConicEqualArea().rotate(vue.rotate).parallels(vue.paralleles)
      .fitExtent([[marge, marge], [W - marge, H - marge]], { type: 'MultiPoint', coordinates: vue.points });
  } else {
    projection = d3.geoNaturalEarth1().fitExtent([[marge, marge], [W - marge, H - marge]], { type: 'Sphere' });
  }
  const chemin = d3.geoPath(projection);

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'carte-svg', width: W, height: H });
  svg.appendChild(el('rect', { width: W, height: H, class: 'carte-mer' }));
  const gMonde = el('g'); const gSur = el('g', { class: 'carte-sur' });
  svg.appendChild(gMonde); svg.appendChild(gSur);
  conteneur.innerHTML = ''; conteneur.appendChild(svg);

  // Terres : d'abord le contexte (gris), puis les pays du thème par-dessus.
  const pathsParCode = {};
  const actifs = monde.features.filter(f => f.code && codes.has(f.code));
  for (const f of monde.features) {
    if (f.code && codes.has(f.code)) continue;
    if (f.properties.name === 'Antarctica' && continent !== 'monde') continue;
    const d = chemin(f); if (!d) continue;
    gMonde.appendChild(el('path', { d, class: 'carte-autre' }));
  }
  for (const f of actifs) {
    const d = chemin(f); if (!d) continue;
    const p = el('path', { d, class: 'carte-pays', 'data-code': f.code });
    gMonde.appendChild(p);
    (pathsParCode[f.code] ||= []).push(p);
  }

  // Points de repère (pays minuscules ou sans contour) et étiquettes : couche en coordonnées écran.
  const centres = {};
  for (const e of elements) {
    const fs = monde.parCode[e.id] || [];
    let centre = null, petit = true, taille = 0;
    if (fs.length) {
      const principal = fs.reduce((a, b) => (d3.geoArea(a) > d3.geoArea(b) ? a : b));
      const geoms = principal.geometry.type === 'MultiPolygon'
        ? principal.geometry.coordinates.map(c => ({ type: 'Polygon', coordinates: c }))
        : [principal.geometry];
      const plusGrand = geoms.reduce((a, b) => (d3.geoArea(a) > d3.geoArea(b) ? a : b));
      centre = chemin.centroid(plusGrand);
      const [[x0, y0], [x1, y1]] = chemin.bounds(plusGrand);
      taille = Math.min(x1 - x0, y1 - y0);
      petit = taille < 14;
    }
    if (!centre || Number.isNaN(centre[0])) centre = projection([e.pays.latlng[1], e.pays.latlng[0]]);
    centres[e.id] = { xy: centre, petit, taille };
  }
  const marqueurs = {}, etiquettes = {};
  for (const [code, c] of Object.entries(centres)) {
    if (!c.petit || !c.xy) continue;
    const m = el('circle', { cx: c.xy[0], cy: c.xy[1], r: 7, class: 'carte-marqueur', 'data-code': code });
    gSur.appendChild(m); marqueurs[code] = m;
  }

  // Zoom et déplacement.
  let k = 1, tx = 0, ty = 0;
  const appliquer = () => {
    gMonde.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    // Le repère disparaît dès que le pays, zoomé, devient assez grand pour être touché directement.
    for (const [code, m] of Object.entries(marqueurs)) {
      const c = centres[code]; m.setAttribute('cx', c.xy[0] * k + tx); m.setAttribute('cy', c.xy[1] * k + ty);
      m.style.display = c.taille * k >= 14 ? 'none' : '';
    }
    for (const [code, t] of Object.entries(etiquettes)) { const c = centres[code].xy; t.setAttribute('x', c[0] * k + tx); t.setAttribute('y', c[1] * k + ty - (centres[code].petit ? 11 : 0)); }
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
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      if (dist0 > 0) zoomer(dist / dist0, cx, cy);
      dist0 = dist; bouge = true;
    }
  });
  const fin = ev => {
    if (!pointeurs.has(ev.pointerId)) return;
    pointeurs.delete(ev.pointerId);
    if (pointeurs.size === 0) {
      if (!bouge && cible && codes.has(cible)) onClic(cible);
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

  function etat(code, classe, actif) {
    for (const p of pathsParCode[code] || []) p.classList.toggle(classe, actif);
    marqueurs[code]?.classList.toggle(classe, actif);
  }
  function etiqueter(code, texte) {
    if (etiquettes[code]) return;
    const c = centres[code]; if (!c?.xy) return;
    const t = el('text', { class: 'carte-etiquette', 'text-anchor': 'middle' });
    t.textContent = texte; gSur.appendChild(t); etiquettes[code] = t; appliquer();
  }
  return {
    svg,
    selectionner(code) { for (const c of codes) etat(c, 'selection', c === code); },
    marquer(code, classe) { etat(code, 'erreur', false); etat(code, 'selection', false); etat(code, classe, true); },
    demarquer(code, classe) { etat(code, classe, false); },
    etiqueter,
    clignoter(code, classe = 'erreur', ms = 700) { etat(code, classe, true); setTimeout(() => etat(code, classe, false), ms); },
    centrerSur(code) {
      const c = centres[code]; if (!c?.xy) return;
      k = Math.max(k, 3); tx = W / 2 - c.xy[0] * k; ty = H / 2 - c.xy[1] * k; appliquer();
    },
    nom: code => parId[code]?.court || code
  };
}
