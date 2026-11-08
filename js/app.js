// Quiz géo : écrans et logique de jeu.
import { VERSION } from './config.js';
import { CONTINENTS, TYPES, MODES, MODES_CHRONO, CHRONOS, chargerPays, themeId, decouperTheme, nomTheme, nomMode, drapeau, elementsTheme, genererPartie, paysDuContinent } from './data.js';
import { trouver, normaliser, formaterDuree, formaterDate, echapper as e } from './texte.js';
import * as store from './store.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
let PAYS = [];
let dernierResultat = null;
let minuterie = null;

// ---------- Utilitaires ----------
function aller(hash) { location.hash = hash; }
function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms);
}
function params() { return new URLSearchParams(location.hash.split('?')[1] || ''); }
function route() { return location.hash.split('?')[0].replace(/^#\/?/, '') || 'themes'; }
function paysParCode(code) { return PAYS.find(p => p.code === code); }
function imgDrapeau(code, cls = '', largeur = 320) {
  return `<img class="${cls}" src="${drapeau(code, largeur)}" srcset="${drapeau(code, largeur)} 1x, ${drapeau(code, largeur * 2)} 2x" alt="" loading="eager" decoding="async">`;
}
function precharger(code) { if (code) { const i = new Image(); i.src = drapeau(code); i.srcset = `${drapeau(code)} 1x, ${drapeau(code, 640)} 2x`; } }
function arreterMinuterie() { if (minuterie) { clearInterval(minuterie); minuterie = null; } }
function majNav(r) {
  const enPartie = r === 'partie';
  nav.hidden = enPartie || !store.session();
  app.classList.toggle('plein', nav.hidden);
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('actif', a.dataset.nav === r || (a.dataset.nav === 'themes' && ['modes', 'resultats'].includes(r))));
}

// ---------- Connexion ----------
function ecranConnexion() {
  const code = store.codeFamille();
  app.innerHTML = `
    <div class="entete"><div><p class="sur">Quiz géo</p><h1>Qui joue ?</h1></div></div>
    <form class="carte pile" id="f-connexion" autocomplete="off">
      <div class="champ ${code ? 'replie' : ''}" id="champ-code" ${code ? 'hidden' : ''}>
        <label for="code">Code famille</label>
        <input type="password" id="code" value="${e(code)}" autocapitalize="off" autocomplete="off" placeholder="Demande-le à papa">
      </div>
      ${code ? `<p class="petit muted">Code famille enregistré sur cet appareil. <a href="#" id="changer-code">Changer</a></p>` : ''}
      <div class="champ"><label for="pseudo">Pseudo</label>
        <input type="text" id="pseudo" autocapitalize="words" autocomplete="username" maxlength="20" placeholder="Ton prénom ou ton surnom"></div>
      <div class="champ"><label for="pin">Code secret (4 chiffres)</label>
        <input type="password" id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="••••"></div>
      <p class="erreur" id="erreur"></p>
      <div class="btn-ligne">
        <button class="btn primaire" type="submit" data-action="connexion">Se connecter</button>
        <button class="btn" type="button" data-action="inscription">Créer un joueur</button>
      </div>
      <p class="petit muted centre">${store.enLigne() ? 'Scores partagés dans la famille' : 'Mode hors ligne : scores gardés sur cet appareil'}</p>
    </form>`;
  const f = document.getElementById('f-connexion');
  const err = document.getElementById('erreur');
  document.getElementById('changer-code')?.addEventListener('click', ev => {
    ev.preventDefault(); const c = document.getElementById('champ-code'); c.hidden = false; document.getElementById('code').value = ''; ev.target.closest('p').remove();
  });
  async function soumettre(action) {
    const codeF = document.getElementById('code').value.trim();
    const pseudo = document.getElementById('pseudo').value.trim();
    const pin = document.getElementById('pin').value.trim();
    err.textContent = '';
    if (!codeF) return err.textContent = 'Le code famille est obligatoire.';
    if (pseudo.length < 2) return err.textContent = 'Choisis un pseudo d’au moins 2 lettres.';
    if (!/^\d{4}$/.test(pin)) return err.textContent = 'Le code secret fait 4 chiffres.';
    f.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      const j = action === 'inscription' ? await store.inscription(codeF, pseudo, pin) : await store.connexion(codeF, pseudo, pin);
      store.retenirCode(codeF);
      store.ouvrirSession({ id: j.id, pseudo: j.pseudo, pin });
      toast(action === 'inscription' ? `Bienvenue, ${j.pseudo} !` : `Salut ${j.pseudo} !`);
      store.synchroniser().then(n => { if (n) toast(`${n} partie(s) envoyée(s)`); });
      aller('#/themes');
    } catch (ex) {
      err.textContent = ex.message || 'Impossible de se connecter.';
      f.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }
  f.addEventListener('submit', ev => { ev.preventDefault(); soumettre('connexion'); });
  f.querySelector('[data-action="inscription"]').addEventListener('click', () => soumettre('inscription'));
}

// ---------- Thèmes ----------
function ecranThemes() {
  const s = store.session();
  const enCours = store.partieEnCours();
  const tuiles = type => CONTINENTS.map(c => {
    const n = paysDuContinent(PAYS, c.id).length;
    return `<button class="tuile ${c.id === 'monde' ? 'monde' : ''}" data-theme="${themeId(type.id, c.id)}">
      <span class="titre">${e(c.nom)}</span><span class="compte">${n} ${type.id === 'pays' ? 'pays' : 'capitales'}</span></button>`;
  }).join('');
  app.innerHTML = `
    <div class="entete"><div><p class="sur">Salut ${e(s.pseudo)}</p><h1>À quoi on joue ?</h1></div></div>
    ${enCours ? `<div class="carte ligne espace mb">
        <div><strong>Partie en cours</strong><br><span class="petit muted">${e(nomTheme(enCours.theme))} · ${e(nomMode(enCours.mode))} · ${enCours.mode === 'liste' ? enCours.trouves.length : enCours.index}/${enCours.ordre.length}</span></div>
        <div class="ligne"><button class="btn discret" id="abandonner">Abandonner</button><button class="btn primaire" id="reprendre">Reprendre</button></div>
      </div>` : ''}
    ${TYPES.map(t => `<section class="mb"><h2>${e(t.nom)}</h2><p class="petit muted mb">${e(t.description)}</p>
      <div class="grille">${tuiles(t)}</div></section>`).join('')}
    <p class="petit muted centre mt">Quiz géo v${VERSION}</p>`;
  app.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => aller(`#/modes?theme=${b.dataset.theme}`)));
  document.getElementById('reprendre')?.addEventListener('click', () => aller('#/partie'));
  document.getElementById('abandonner')?.addEventListener('click', () => { store.effacerPartie(); ecranThemes(); });
}

// ---------- Modes ----------
function ecranModes() {
  const theme = params().get('theme');
  const d = decouperTheme(theme);
  if (!d) return aller('#/themes');
  const n = elementsTheme(theme, PAYS).length;
  const prefs = store.prefs();
  let mode = prefs.mode, chrono = prefs.chrono;
  const rendu = () => {
    const c = CHRONOS.find(x => x.id === chrono) || CHRONOS[1];
    app.innerHTML = `
      <div class="entete"><div><button class="retour" id="retour">‹ Thèmes</button><h1>${e(nomTheme(theme))}</h1>
        <p class="muted">${n} questions · ${e(d.type.question)}</p></div></div>
      <div class="pile">
        ${MODES.map(m => `<button class="tuile ${m.id === mode ? 'active' : ''}" data-mode="${m.id}">
          <span class="titre">${e(m.nom)}</span><span class="compte">${e(m.description)}</span></button>`).join('')}
      </div>
      ${MODES_CHRONO.includes(mode) ? `<div class="carte mt ligne espace" style="flex-wrap:wrap">
        <div><strong>Chrono</strong><br><span class="petit muted">${formaterDuree(n * c.secondes * 1000)} au total (${c.secondes} s par élément)</span></div>
        <div class="segment">${CHRONOS.map(x => `<button data-chrono="${x.id}" class="${x.id === chrono ? 'actif' : ''}">${x.nom}</button>`).join('')}</div>
      </div>` : ''}
      <button class="btn primaire bloc mt" id="commencer">Commencer</button>`;
    document.getElementById('retour').addEventListener('click', () => aller('#/themes'));
    app.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; rendu(); }));
    app.querySelectorAll('[data-chrono]').forEach(b => b.addEventListener('click', () => { chrono = b.dataset.chrono; rendu(); }));
    document.getElementById('commencer').addEventListener('click', () => {
      store.sauverPrefs({ mode, chrono, dernierTheme: theme });
      const partie = genererPartie(theme, mode, PAYS, { chrono });
      store.sauverPartie(partie);
      aller('#/partie');
    });
  };
  rendu();
}

// ---------- Partie ----------
function ecranPartie() {
  const partie = store.partieEnCours();
  if (!partie) return aller('#/themes');
  const elements = elementsTheme(partie.theme, PAYS);
  const parId = Object.fromEntries(elements.map(x => [x.id, x]));
  const d = decouperTheme(partie.theme);
  partie.reprise = Date.now();
  const ecoule = () => partie.ecoule + (Date.now() - partie.reprise);
  const sauver = () => { partie.ecoule = ecoule(); partie.reprise = Date.now(); store.sauverPartie(partie); };

  function barre(compteur, chronoHtml = '') {
    return `<div class="barre-partie">
      <button class="quitter" id="quitter" aria-label="Quitter">✕</button>
      <div class="infos"><div class="theme">${e(nomTheme(partie.theme))}</div><div class="petit muted">${e(nomMode(partie.mode))}${chronoHtml}</div></div>
      <div class="compteur">${compteur}</div></div>`;
  }
  function brancherQuitter() {
    document.getElementById('quitter').addEventListener('click', () => {
      if (MODES_CHRONO.includes(partie.mode)) { if (confirm('Arrêter ici ? La partie sera comptée telle quelle.')) terminer(); return; }
      sauver(); aller('#/themes');
    });
  }
  function statutHtml(p) { return p.statut ? `<div class="statut">${e(p.statut)}</div>` : ''; }

  function terminer() {
    arreterMinuterie();
    const duree = Math.min(ecoule(), partie.dureeMax || Infinity);
    const rates = MODES_CHRONO.includes(partie.mode)
      ? partie.ordre.filter(id => !partie.trouves.includes(id))
      : partie.ordre.filter(id => !partie.reponses[id]?.ok);
    const bonnes = partie.ordre.length - rates.length;
    dernierResultat = {
      theme: partie.theme, mode: partie.mode, total: partie.ordre.length, bonnes, duree_ms: Math.round(duree),
      details: { rates, chrono: partie.chrono, erreurs: partie.erreurs, reponses: MODES_CHRONO.includes(partie.mode) ? undefined : Object.fromEntries(rates.map(id => [id, partie.reponses[id]?.saisie || ''])) },
      enregistrement: 'en cours'
    };
    try { sessionStorage.setItem('qg.resultat', JSON.stringify(dernierResultat)); } catch { /* rien */ }
    store.effacerPartie();
    const r = dernierResultat;
    store.enregistrerPartie({ theme: r.theme, mode: r.mode, total: r.total, bonnes: r.bonnes, duree_ms: r.duree_ms, details: r.details })
      .then(() => { r.enregistrement = 'ok'; })
      .catch(ex => { r.enregistrement = ex.message; })
      .finally(() => { if (route() === 'resultats') ecranResultats(); });
    aller('#/resultats');
  }

  // ----- QCM et saisie -----
  function question() {
    if (partie.index >= partie.ordre.length) return terminer();
    const id = partie.ordre[partie.index];
    const el = parId[id];
    precharger(partie.ordre[partie.index + 1]);
    const prompt = d.type.id === 'pays'
      ? `<p class="consigne">${e(d.type.question)}</p>${imgDrapeau(id, 'drapeau')}`
      : `<p class="consigne">${e(d.type.question)}</p>${imgDrapeau(id, 'mini', 80)}<div class="nom">${e(el.pays.nom)}</div>`;
    const corps = partie.mode === 'qcm'
      ? `<div class="choix" id="choix">${partie.choix[id].map(c => `<button class="btn" data-choix="${c}">${e(parId[c].court)}</button>`).join('')}</div>`
      : `<form class="saisie-ligne" id="f-saisie"><input type="text" id="saisie" autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Ta réponse">
          <button class="btn primaire" type="submit">OK</button></form>
         <button class="btn discret bloc mt-s" id="passer">Je ne sais pas</button>`;
    app.innerHTML = `${barre(`${partie.index + 1}/${partie.ordre.length}`)}
      <div class="progression"><div style="width:${(partie.index / partie.ordre.length) * 100}%"></div></div>
      <div class="carte question">${prompt}</div>${corps}<div id="retour-reponse"></div>`;
    brancherQuitter();
    if (partie.mode === 'qcm') {
      app.querySelectorAll('[data-choix]').forEach(b => b.addEventListener('click', () => repondre(id, b.dataset.choix === id, parId[b.dataset.choix].court, b)));
    } else {
      const input = document.getElementById('saisie');
      input.focus();
      document.getElementById('f-saisie').addEventListener('submit', ev => {
        ev.preventDefault();
        const v = input.value.trim(); if (!v) return;
        const m = trouver(v, [{ id, formes: el.formes }]);
        repondre(id, Boolean(m), v);
      });
      document.getElementById('passer').addEventListener('click', () => repondre(id, false, ''));
    }
  }

  function repondre(id, ok, saisie, bouton) {
    const el = parId[id];
    partie.reponses[id] = { ok, saisie };
    partie.index++;
    sauver();
    if (partie.mode === 'qcm') {
      app.querySelectorAll('[data-choix]').forEach(b => { b.disabled = true; if (b.dataset.choix === id) b.classList.add('ok'); });
      if (!ok && bouton) bouton.classList.add('ko');
    } else {
      document.getElementById('saisie').disabled = true;
      document.getElementById('passer')?.remove();
    }
    const zone = document.getElementById('retour-reponse');
    zone.innerHTML = `<div class="retour-reponse ${ok ? 'ok' : 'ko'}">
      <div><strong>${ok ? 'Exact !' : (saisie ? 'Raté.' : 'Passé.')}</strong></div>
      ${ok ? '' : `<div class="bonne">${e(el.reponse)}</div>`}
      ${ok && el.reponse !== el.court ? `<div class="bonne">${e(el.reponse)}</div>` : ''}
      ${statutHtml(el.pays)}
      ${ok && !el.pays.statut ? '' : `<button class="btn primaire mt-s" id="suivant">${partie.index >= partie.ordre.length ? 'Voir le résultat' : 'Suivant'}</button>`}
    </div>`;
    const suivant = document.getElementById('suivant');
    if (suivant) { suivant.focus(); suivant.addEventListener('click', question); }
    else setTimeout(question, 700);
  }

  // ----- Nomme-les tous -----
  function liste() {
    const total = partie.ordre.length;
    app.innerHTML = `${barre(`${partie.trouves.length}/${total}`, '')}
      <div class="progression chrono" id="chrono"><div style="width:100%"></div></div>
      <div class="liste-tete"><div class="trouves" id="trouves">${partie.trouves.length} <span class="petit muted">/ ${total}</span></div><div class="temps" id="temps"></div></div>
      <form class="saisie-ligne" id="f-liste" style="margin-top:4px"><input type="text" id="saisie" autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="${d.type.id === 'pays' ? 'Un pays…' : 'Une capitale…'}">
        <button class="btn primaire" type="submit">OK</button></form>
      <div class="pastilles" id="pastilles">${partie.trouves.map(pastille).join('')}</div>
      <button class="btn discret bloc mt" id="fin">J’ai fini</button>`;
    brancherQuitter();
    const input = document.getElementById('saisie');
    input.focus();
    document.getElementById('fin').addEventListener('click', () => { if (confirm('Terminer maintenant ?')) terminer(); });

    const restants = () => partie.ordre.filter(id => !partie.trouves.includes(id)).map(id => ({ id, formes: parId[id].formes }));
    const accepter = id => {
      partie.trouves.push(id); sauver();
      document.getElementById('pastilles').insertAdjacentHTML('afterbegin', pastille(id, true));
      document.getElementById('trouves').innerHTML = `${partie.trouves.length} <span class="petit muted">/ ${total}</span>`;
      app.querySelector('.compteur').textContent = `${partie.trouves.length}/${total}`;
      input.value = '';
      if (partie.trouves.length === total) terminer();
    };
    // Acceptation automatique dès que la saisie est exactement un élément, sauf si c'est le début d'un autre (Niger / Nigeria).
    input.addEventListener('input', () => {
      const n = normaliser(input.value); if (!n) return;
      const cands = restants();
      const exact = cands.find(c => c.formes.some(f => normaliser(f) === n));
      if (!exact) return;
      const prefixe = cands.some(c => c !== exact && c.formes.some(f => { const nf = normaliser(f); return nf !== n && nf.startsWith(n); }));
      if (!prefixe) accepter(exact.id);
    });
    document.getElementById('f-liste').addEventListener('submit', ev => {
      ev.preventDefault();
      const v = input.value.trim(); if (!v) return;
      const m = trouver(v, restants());
      if (m) accepter(m.id);
      else {
        const deja = trouver(v, partie.trouves.map(id => ({ id, formes: parId[id].formes })));
        toast(deja ? 'Déjà trouvé !' : 'Non…', 1200);
        input.classList.remove('secoue'); void input.offsetWidth; input.classList.add('secoue');
        input.select();
      }
    });
    const barreChrono = document.getElementById('chrono');
    const temps = document.getElementById('temps');
    const tic = () => {
      const reste = Math.max(0, partie.dureeMax - ecoule());
      temps.textContent = formaterDuree(reste);
      barreChrono.firstElementChild.style.width = `${(reste / partie.dureeMax) * 100}%`;
      barreChrono.classList.toggle('alerte', reste < partie.dureeMax * 0.15);
      if (reste <= 0) { toast('Temps écoulé !'); terminer(); }
    };
    arreterMinuterie(); tic(); minuterie = setInterval(tic, 250);
  }
  function pastille(id, neuf = false) {
    const el = parId[id];
    return `<span class="pastille ${neuf ? 'neuf' : ''}">${imgDrapeau(id, '', 40)}${e(el.court)}</span>`;
  }

  // ----- Carte : nomme-les tous -----
  function chronoCarte() {
    const barreChrono = document.getElementById('chrono'); const temps = document.getElementById('temps');
    const tic = () => {
      const reste = Math.max(0, partie.dureeMax - ecoule());
      temps.textContent = formaterDuree(reste);
      barreChrono.firstElementChild.style.width = `${(reste / partie.dureeMax) * 100}%`;
      barreChrono.classList.toggle('alerte', reste < partie.dureeMax * 0.15);
      if (reste <= 0) { toast('Temps écoulé !'); terminer(); }
    };
    arreterMinuterie(); tic(); minuterie = setInterval(tic, 250);
  }
  async function chargerCarte(zone, onClic) {
    const { chargerMonde, creerCarte } = await import('./carte.js');
    const monde = await chargerMonde(PAYS);
    return creerCarte(zone, monde, { continent: d.continent.id, elements, onClic });
  }
  async function carteNommer() {
    const total = partie.ordre.length;
    const consigne = d.type.id === 'pays' ? 'Quel est ce pays ?' : 'Quelle est sa capitale ?';
    app.innerHTML = `${barre(`${partie.trouves.length}/${total}`)}
      <div class="progression chrono" id="chrono"><div style="width:100%"></div></div>
      <div class="liste-tete" style="margin-top:-8px"><div class="petit muted" id="consigne">Touche un pays sur la carte</div><div class="temps" id="temps"></div></div>
      <form class="saisie-ligne" id="f-carte" style="margin:4px 0 10px"><input type="text" id="saisie" disabled autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Touche un pays…">
        <button class="btn primaire" type="submit">OK</button></form>
      <div class="carte-zone" id="carte"><div class="chargement">Chargement de la carte…</div></div>
      <button class="btn discret bloc mt-s" id="fin">J’ai fini</button>`;
    brancherQuitter();
    document.getElementById('fin').addEventListener('click', () => { if (confirm('Terminer maintenant ?')) terminer(); });
    const input = document.getElementById('saisie');
    let sel = null, carte;
    try { carte = await chargerCarte(document.getElementById('carte'), clic); }
    catch (ex) { document.getElementById('carte').innerHTML = `<p class="erreur centre" style="padding:24px">${e(ex.message)}</p>`; return; }
    if (route() !== 'partie') return;
    for (const id of partie.trouves) { carte.marquer(id, 'trouve'); carte.etiqueter(id, parId[id].court); }
    chronoCarte();
    function clic(code) {
      if (partie.trouves.includes(code)) { toast(`Déjà trouvé : ${parId[code].court}`, 1200); return; }
      sel = code; carte.selectionner(code);
      input.disabled = false; input.placeholder = consigne; input.focus();
      document.getElementById('consigne').textContent = consigne;
    }
    document.getElementById('f-carte').addEventListener('submit', ev => {
      ev.preventDefault();
      if (!sel) { toast('Touche d’abord un pays', 1200); return; }
      const v = input.value.trim(); if (!v) return;
      if (trouver(v, [{ id: sel, formes: parId[sel].formes }])) {
        partie.trouves.push(sel); sauver();
        carte.marquer(sel, 'trouve'); carte.etiqueter(sel, parId[sel].court); carte.selectionner(null);
        sel = null; input.value = ''; input.placeholder = 'Touche un pays…'; input.disabled = true;
        document.getElementById('consigne').textContent = 'Touche un pays sur la carte';
        app.querySelector('.compteur').textContent = `${partie.trouves.length}/${total}`;
        if (partie.trouves.length === total) terminer();
      } else {
        partie.erreurs++; sauver();
        carte.clignoter(sel, 'erreur');
        const autre = trouver(v, partie.ordre.filter(id => id !== sel).map(id => ({ id, formes: parId[id].formes })));
        toast(autre ? (d.type.id === 'pays' ? 'C’est un autre pays…' : 'C’est la capitale d’un autre pays…') : 'Non…', 1200);
        input.classList.remove('secoue'); void input.offsetWidth; input.classList.add('secoue'); input.select();
      }
    });
  }

  // ----- Carte : trouve-le -----
  async function carteTrouver() {
    const total = partie.ordre.length;
    app.innerHTML = `${barre(`${Math.min(partie.index + 1, total)}/${total}`)}
      <div class="progression"><div style="width:${(partie.index / total) * 100}%"></div></div>
      <div class="carte cible" id="cible">…</div>
      <div class="carte-zone" id="carte"><div class="chargement">Chargement de la carte…</div></div>`;
    brancherQuitter();
    let attente = false, carte;
    try { carte = await chargerCarte(document.getElementById('carte'), clic); }
    catch (ex) { document.getElementById('carte').innerHTML = `<p class="erreur centre" style="padding:24px">${e(ex.message)}</p>`; return; }
    if (route() !== 'partie') return;
    for (const [id, r] of Object.entries(partie.reponses)) { carte.marquer(id, r.ok ? 'trouve' : 'manque'); carte.etiqueter(id, parId[id].court); }
    poser();
    function poser() {
      if (partie.index >= total) return terminer();
      const el = parId[partie.ordre[partie.index]];
      document.getElementById('cible').innerHTML = d.type.id === 'pays'
        ? `Où est <strong>${e(el.pays.nom)}</strong> ?`
        : `Quel pays a pour capitale <strong>${e(el.court)}</strong> ?`;
      app.querySelector('.compteur').textContent = `${partie.index + 1}/${total}`;
      app.querySelector('.progression > div').style.width = `${(partie.index / total) * 100}%`;
      attente = true;
    }
    function clic(code) {
      if (!attente) return;
      if (partie.reponses[code]) { toast(`Déjà joué : ${parId[code].court}`, 1000); return; }
      const id = partie.ordre[partie.index]; const ok = code === id;
      attente = false;
      partie.reponses[id] = { ok, saisie: ok ? '' : parId[code].pays.nom };
      partie.index++; sauver();
      if (ok) {
        carte.marquer(id, 'trouve'); carte.etiqueter(id, parId[id].court);
        document.getElementById('cible').innerHTML = `<span class="ok-texte">Exact !</span>`;
        setTimeout(poser, 500);
      } else {
        carte.clignoter(code, 'erreur', 1400); carte.marquer(id, 'manque'); carte.etiqueter(id, parId[id].court);
        document.getElementById('cible').innerHTML = `<span class="ko-texte">Non, c’était ${e(parId[code].pays.nom)}.</span> ${e(parId[id].pays.nom)} est en rouge sur la carte.`;
        setTimeout(poser, 1600);
      }
    }
  }

  if (partie.mode === 'liste') liste();
  else if (partie.mode === 'carte') carteNommer();
  else if (partie.mode === 'carte-trouve') carteTrouver();
  else question();
}

// ---------- Résultats ----------
async function ecranResultats() {
  if (!dernierResultat) { try { dernierResultat = JSON.parse(sessionStorage.getItem('qg.resultat')); } catch { /* rien */ } }
  const r = dernierResultat;
  if (!r) return aller('#/themes');
  const d = decouperTheme(r.theme);
  const pct = Math.round((r.bonnes / r.total) * 100);
  const s = store.session();
  const rates = r.details.rates.map(code => paysParCode(code)).filter(Boolean);
  const reponseDe = p => d.type.id === 'pays' ? p.nom : p.capitale;
  app.innerHTML = `
    <div class="entete"><div><p class="sur">${e(nomTheme(r.theme))} · ${e(nomMode(r.mode))}</p><h1>${pct === 100 ? 'Sans faute !' : pct >= 80 ? 'Bien joué' : pct >= 50 ? 'Pas mal' : 'À retravailler'}</h1></div></div>
    <div class="carte score">
      <div class="gros">${r.bonnes}<small> / ${r.total}</small></div>
      <div class="sous">${pct} % · ${formaterDuree(r.duree_ms)}</div>
      <div class="sous petit" id="enregistrement">${r.enregistrement === 'ok' ? 'Partie enregistrée' : r.enregistrement === 'en cours' ? 'Enregistrement…' : e(r.enregistrement)}</div>
      <div class="sous" id="rang"></div>
    </div>
    <div class="btn-ligne mt">
      <button class="btn primaire" id="rejouer">Rejouer</button>
      <button class="btn" id="autre">Autre thème</button>
      <button class="btn" id="voir-classement">Classement</button>
    </div>
    ${rates.length ? `<h2 class="mt">${rates.length === 1 ? 'La réponse ratée' : `Les ${rates.length} réponses ratées`}</h2>
      <div class="rates">${rates.map(p => `<div class="rate">${imgDrapeau(p.code, '', 80)}<div class="texte">
        <div class="bonne">${d.type.id === 'pays' ? e(p.nom) : `${e(p.nom)} → ${e(p.capitale)}`}</div>
        ${r.details.reponses?.[p.code] ? `<div class="toi">Toi : ${e(r.details.reponses[p.code])}</div>` : ''}
        ${p.statut ? `<div class="statut">${e(p.statut)}</div>` : ''}
      </div></div>`).join('')}</div>` : ''}`;
  document.getElementById('rejouer').addEventListener('click', () => {
    store.sauverPartie(genererPartie(r.theme, r.mode, PAYS, { chrono: r.details.chrono })); aller('#/partie');
  });
  document.getElementById('autre').addEventListener('click', () => aller('#/themes'));
  document.getElementById('voir-classement').addEventListener('click', () => aller(`#/classement?theme=${r.theme}&mode=${r.mode}`));
  try {
    const cl = (await store.classement()).filter(x => x.theme === r.theme && x.mode === r.mode).sort(trier);
    const moi = cl.find(x => x.pseudo === s.pseudo);
    const rang = moi ? cl.indexOf(moi) + 1 : null;
    const el = document.getElementById('rang');
    if (el && rang) {
      const record = moi.bonnes === r.bonnes && moi.duree_ms === r.duree_ms;
      el.innerHTML = `${record ? '<span class="badge ok">Record perso</span> ' : ''}${rang === 1 ? 'Meilleur de la famille' : `${rang}${rang === 1 ? 'er' : 'e'} de la famille sur ${cl.length}`}`;
    }
  } catch { /* classement indisponible */ }
}

function trier(a, b) { return b.bonnes - a.bonnes || a.duree_ms - b.duree_ms || new Date(a.jouee_le) - new Date(b.jouee_le); }

// ---------- Classement ----------
async function ecranClassement() {
  const s = store.session();
  const p = params();
  const prefs = store.prefs();
  let theme = p.get('theme') || prefs.dernierTheme || 'pays-europe';
  let mode = p.get('mode') || prefs.mode || 'saisie';
  let d = decouperTheme(theme) || decouperTheme('pays-europe');
  app.innerHTML = `<div class="entete"><div><p class="sur">Famille</p><h1>Classement</h1></div></div><div class="chargement">Chargement…</div>`;
  let tout = [], fil = [];
  try { [tout, fil] = await Promise.all([store.classement(), store.dernieresParties()]); }
  catch (ex) { app.innerHTML += `<p class="erreur">${e(ex.message)}</p>`; return; }
  const rendu = () => {
    theme = themeId(d.type.id, d.continent.id);
    const lignes = tout.filter(x => x.theme === theme && x.mode === mode).sort(trier);
    app.innerHTML = `
      <div class="entete"><div><p class="sur">Famille</p><h1>Classement</h1></div></div>
      <div class="pile">
        <div class="segment" style="align-self:start">${TYPES.map(t => `<button data-type="${t.id}" class="${t.id === d.type.id ? 'actif' : ''}">${t.nom}</button>`).join('')}</div>
        <select id="continent">${CONTINENTS.map(c => `<option value="${c.id}" ${c.id === d.continent.id ? 'selected' : ''}>${e(c.nom)}</option>`).join('')}</select>
        <div class="segment" style="align-self:start">${MODES.map(m => `<button data-mode="${m.id}" class="${m.id === mode ? 'actif' : ''}">${m.nom}</button>`).join('')}</div>
      </div>
      <div class="carte mt" style="padding:4px 12px">
        ${lignes.length ? `<table><thead><tr><th></th><th>Joueur</th><th class="num">Score</th><th class="num">Temps</th><th class="num">Parties</th></tr></thead><tbody>
          ${lignes.map((l, i) => `<tr class="${l.pseudo === s.pseudo ? 'moi' : ''}"><td class="rang">${i + 1}</td><td><strong>${e(l.pseudo)}</strong><br><span class="petit muted">${formaterDate(l.jouee_le)}</span></td>
            <td class="num"><strong>${l.bonnes}</strong>/${l.total}</td><td class="num">${formaterDuree(l.duree_ms)}</td><td class="num muted">${l.parties}</td></tr>`).join('')}
        </tbody></table>` : `<p class="vide">Personne n’a encore joué ce thème dans ce mode.</p>`}
      </div>
      <button class="btn primaire bloc mt" id="jouer-ce-theme">Jouer ${e(nomTheme(theme))} en ${e(nomMode(mode))}</button>
      <h2 class="mt mb">Dernières parties</h2>
      <div class="fil">${fil.length ? fil.map(f => `<div class="item"><div><span class="qui">${e(f.pseudo)}</span> <span class="muted">·</span> ${e(nomTheme(f.theme))} <span class="badge">${e(nomMode(f.mode))}</span></div>
        <div class="centre" style="flex:none"><strong>${f.bonnes}/${f.total}</strong><br><span class="petit muted">${formaterDate(f.jouee_le)}</span></div></div>`).join('') : '<p class="vide">Rien pour l’instant.</p>'}</div>`;
    app.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { d = { ...d, type: TYPES.find(t => t.id === b.dataset.type) }; rendu(); }));
    app.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; rendu(); }));
    document.getElementById('continent').addEventListener('change', ev => { d = { ...d, continent: CONTINENTS.find(c => c.id === ev.target.value) }; rendu(); });
    document.getElementById('jouer-ce-theme').addEventListener('click', () => {
      store.sauverPrefs({ mode }); store.sauverPartie(genererPartie(theme, mode, PAYS, { chrono: prefs.chrono })); aller('#/partie');
    });
  };
  rendu();
}

// ---------- Profil et progression ----------
async function ecranProfil() {
  const s = store.session();
  app.innerHTML = `<div class="entete"><div><p class="sur">Profil</p><h1>${e(s.pseudo)}</h1></div>
    <button class="btn discret" id="deconnexion">Se déconnecter</button></div><div class="chargement">Chargement…</div>`;
  document.getElementById('deconnexion').addEventListener('click', () => { store.fermerSession(); store.effacerPartie(); aller('#/connexion'); });
  let hist = [];
  try { hist = await store.historique(); } catch (ex) { app.querySelector('.chargement').outerHTML = `<p class="erreur">${e(ex.message)}</p>`; return; }
  const parTheme = new Map();
  for (const h of hist) {
    const t = parTheme.get(h.theme) || { theme: h.theme, parties: [], meilleure: null, derniere: null };
    t.parties.push(h);
    if (!t.derniere || new Date(h.jouee_le) > new Date(t.derniere.jouee_le)) t.derniere = h;
    if (!t.meilleure || trier(h, t.meilleure) < 0) t.meilleure = h;
    parTheme.set(h.theme, t);
  }
  const totalBonnes = hist.reduce((a, h) => a + h.bonnes, 0), totalQ = hist.reduce((a, h) => a + h.total, 0);
  const themes = [...parTheme.values()].sort((a, b) => new Date(b.derniere.jouee_le) - new Date(a.derniere.jouee_le));
  app.querySelector('.chargement').outerHTML = `
    <div class="stat">
      <div class="carte"><div class="n">${hist.length}</div><div class="l">parties</div></div>
      <div class="carte"><div class="n">${totalQ ? Math.round((totalBonnes / totalQ) * 100) : 0} %</div><div class="l">de réussite</div></div>
      <div class="carte"><div class="n">${themes.filter(t => t.meilleure.bonnes === t.meilleure.total).length}</div><div class="l">sans faute</div></div>
    </div>
    <h2 class="mt mb">Progression par thème</h2>
    <div class="carte" style="padding:4px 16px">${themes.length ? themes.map(t => {
      const d = decouperTheme(t.theme);
      const rates = (t.derniere.details?.rates || []).map(c => paysParCode(c)).filter(Boolean);
      return `<details class="theme-ligne"><summary><div><strong>${e(nomTheme(t.theme))}</strong><br><span class="petit muted">${t.parties.length} partie${t.parties.length > 1 ? 's' : ''} · record ${t.meilleure.bonnes}/${t.meilleure.total} (${e(nomMode(t.meilleure.mode))})</span></div>
        <div class="score-mini ${t.derniere.bonnes === t.derniere.total ? 'badge ok' : ''}">${t.derniere.bonnes}/${t.derniere.total}</div></summary>
        <div class="mt-s">${rates.length ? `<p class="petit muted">À revoir (dernière partie, ${e(nomMode(t.derniere.mode))}) :</p>
          <div class="pastilles">${rates.map(p => `<span class="pastille manque">${imgDrapeau(p.code, '', 40)}${d?.type.id === 'pays' ? e(p.nom) : `${e(p.nom)} → ${e(p.capitales[0])}`}</span>`).join('')}</div>`
          : '<p class="petit muted">Dernière partie sans faute.</p>'}</div></details>`;
    }).join('') : '<p class="vide">Joue une première partie pour voir ta progression.</p>'}</div>
    <p class="petit muted centre mt">${store.enLigne() ? 'Scores partagés dans la famille' : 'Mode hors ligne'} · v${VERSION}</p>`;
}

// ---------- Routeur ----------
async function rendre() {
  arreterMinuterie();
  const r = route();
  if (!store.session() && r !== 'connexion') return aller('#/connexion');
  if (store.session() && r === 'connexion') return aller('#/themes');
  majNav(r);
  window.scrollTo(0, 0);
  switch (r) {
    case 'connexion': return ecranConnexion();
    case 'themes': return ecranThemes();
    case 'modes': return ecranModes();
    case 'partie': return ecranPartie();
    case 'resultats': return ecranResultats();
    case 'classement': return ecranClassement();
    case 'profil': return ecranProfil();
    default: return aller('#/themes');
  }
}

async function demarrer() {
  try { PAYS = await chargerPays(); }
  catch (ex) { app.innerHTML = `<p class="erreur centre">${e(ex.message)}</p>`; return; }
  window.addEventListener('hashchange', rendre);
  window.addEventListener('online', () => store.synchroniser().then(n => { if (n) toast(`${n} partie(s) envoyée(s)`); }));
  store.synchroniser().catch(() => {});
  rendre();
}
demarrer();
