// Quiz géo : écrans et logique de jeu.
import { VERSION } from './config.js';
import { GROUPES, MODES, MODES_CHRONO, CHRONOS, AVATARS, BONUS_PODIUM, emojiAvatar, classementGeneral, chargerDonnees, infoTheme, listeThemes, nomTheme, nomMode, drapeau, elementsTheme, repTexte, courts, genererPartie } from './data.js';
import { trouver, normaliser, formaterDuree, formaterDate, echapper as e } from './texte.js';
import * as store from './store.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
let D = null;            // données (pays, États, villes)
let THEMES = [];
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
function img(url, cls = '') {
  if (!url) return '';
  const x2 = url.replace(/w(\d+)\//, (m, w) => `w${w * 2}/`);
  return `<img class="${cls}" src="${url}" srcset="${url} 1x, ${x2} 2x" alt="" decoding="async">`;
}
function precharger(el) { if (el?.drapeau) { const i = new Image(); i.src = el.drapeau; } }
function arreterMinuterie() { if (minuterie) { clearInterval(minuterie); minuterie = null; } }
function majNav(r) {
  nav.hidden = r === 'partie' || !store.session();
  app.classList.toggle('plein', nav.hidden);
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('actif', a.dataset.nav === r || (a.dataset.nav === 'themes' && ['modes', 'resultats'].includes(r))));
}
const elementsCache = {};
function elements(theme) { return elementsCache[theme] ||= elementsTheme(theme, D); }
function trier(a, b) { return b.bonnes - a.bonnes || a.duree_ms - b.duree_ms || new Date(a.jouee_le) - new Date(b.jouee_le); }

// ---------- Connexion ----------
function ecranConnexion() {
  const code = store.codeFamille();
  app.innerHTML = `
    <div class="entete"><div><p class="sur">Quiz géo</p><h1>Qui joue ?</h1></div></div>
    <form class="carte pile" id="f-connexion" autocomplete="off">
      <div class="champ" id="champ-code" ${code ? 'hidden' : ''}>
        <label for="code">Code famille</label>
        <input type="password" id="code" value="${e(code)}" autocapitalize="off" autocomplete="off">
      </div>
      ${code ? `<p class="petit muted">Code famille enregistré sur cet appareil. <a href="#" id="changer-code">Changer</a></p>` : ''}
      <div class="champ"><label for="pseudo">Pseudo</label>
        <input type="text" id="pseudo" autocapitalize="words" autocomplete="username" maxlength="20" placeholder="Ton prénom ou ton surnom"></div>
      <div class="champ"><label for="pin">Code secret (4 chiffres)</label>
        <input type="password" id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="••••"></div>
      <p class="erreur" id="erreur"></p>
      <div class="btn-ligne">
        <button class="btn primaire" type="submit">Se connecter</button>
        <button class="btn" type="button" id="inscription">Créer un joueur</button>
      </div>
      <p class="petit muted centre">${store.enLigne() ? 'Scores partagés dans la famille' : 'Mode hors ligne : scores gardés sur cet appareil'}</p>
    </form>`;
  const f = document.getElementById('f-connexion');
  const err = document.getElementById('erreur');
  document.getElementById('changer-code')?.addEventListener('click', ev => {
    ev.preventDefault(); document.getElementById('champ-code').hidden = false; document.getElementById('code').value = ''; ev.target.closest('p').remove();
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
      store.ouvrirSession({ id: j.id, pseudo: j.pseudo, pin, avatar: j.avatar || null });
      toast(action === 'inscription' ? `Bienvenue, ${j.pseudo} !` : `Salut ${j.pseudo} !`);
      store.synchroniser().then(n => { if (n) toast(`${n} partie(s) envoyée(s)`); });
      aller('#/themes');
    } catch (ex) {
      err.textContent = ex.message || 'Impossible de se connecter.';
      f.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }
  f.addEventListener('submit', ev => { ev.preventDefault(); soumettre('connexion'); });
  document.getElementById('inscription').addEventListener('click', () => soumettre('inscription'));
}

// ---------- Thèmes ----------
function ecranThemes() {
  const s = store.session();
  const enCours = store.partieEnCours();
  const tuile = t => `<button class="tuile ${t.court === 'Monde entier' ? 'monde' : ''}" data-theme="${t.id}">
      <span class="titre ligne">${t.drapeau ? img(drapeau(t.drapeau, 40), 'mini-drapeau') : ''}${e(t.court)}</span><span class="compte">${t.compte} ${e(t.unite)}</span></button>`;
  app.innerHTML = `
    <div class="entete"><div><p class="sur">Salut ${e(s.pseudo)}</p><h1>À quoi on joue ?</h1></div>${s.avatar ? `<a href="#/profil" class="avatar moyen" aria-label="Profil">${emojiAvatar(s.avatar)}</a>` : ''}</div>
    ${enCours ? `<div class="carte ligne espace mb">
        <div><strong>Partie en cours</strong><br><span class="petit muted">${e(nomTheme(enCours.theme, D))} · ${e(nomMode(enCours.mode))} · ${MODES_CHRONO.includes(enCours.mode) ? enCours.trouves.length : enCours.index}/${enCours.ordre.length}</span></div>
        <div class="ligne"><button class="btn discret" id="abandonner">Abandonner</button><button class="btn primaire" id="reprendre">Reprendre</button></div>
      </div>` : ''}
    ${GROUPES.map(g => `<section class="mb"><h2>${e(g.nom)}</h2><p class="petit muted mb">${e(g.description)}</p>
      <div class="grille">${THEMES.filter(t => t.groupe === g.id).map(tuile).join('')}</div></section>`).join('')}
    <p class="petit muted centre mt">Quiz géo v${VERSION}</p>`;
  app.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => aller(`#/modes?theme=${b.dataset.theme}`)));
  document.getElementById('reprendre')?.addEventListener('click', () => aller('#/partie'));
  document.getElementById('abandonner')?.addEventListener('click', () => { store.effacerPartie(); ecranThemes(); });
  verifierDepassements();
}

// Au retour dans l'app : qui m'a dépassé depuis la dernière fois ?
let depassementsVerifies = false;
async function verifierDepassements() {
  if (depassementsVerifies) return;
  depassementsVerifies = true;
  const s = store.session(); if (!s) return;
  let cl; try { cl = await store.classement(); } catch { return; }
  const parJeu = new Map();
  for (const l of cl) { const k = `${l.theme}|${l.mode}`; (parJeu.get(k) || parJeu.set(k, []).get(k)).push(l); }
  const maintenant = {};
  for (const [k, lignes] of parJeu) {
    lignes.sort(trier);
    const moi = lignes.findIndex(l => l.pseudo === s.pseudo);
    if (moi < 0) continue;
    maintenant[k] = lignes.slice(0, moi).map(l => l.pseudo);
  }
  const avant = store.dessusMemo(s.pseudo);
  store.sauverDessus(s.pseudo, maintenant);
  if (!avant) return;
  const nouveaux = [];
  for (const [k, dessus] of Object.entries(maintenant)) {
    for (const p of dessus) if (!(avant[k] || []).includes(p)) nouveaux.push({ pseudo: p, k });
  }
  if (nouveaux.length) afficherBattu(nouveaux, cl);
}

function afficherBattu(nouveaux, cl) {
  const zone = document.createElement('div'); zone.className = 'battu';
  zone.innerHTML = `<div class="battu-carte">
    <div class="battu-gant">🥊</div>
    ${nouveaux.slice(0, 4).map(n => {
      const [theme, mode] = n.k.split('|');
      const av = cl.find(l => l.pseudo === n.pseudo)?.avatar;
      return `<p><span class="avatar petit-avatar">${emojiAvatar(av)}</span><strong>${e(n.pseudo)}</strong> t’a battu sur <strong>${e(nomTheme(theme, D))}</strong> <span class="badge">${e(nomMode(mode))}</span></p>`;
    }).join('')}
    ${nouveaux.length > 4 ? `<p class="petit muted">… et ${nouveaux.length - 4} autre${nouveaux.length > 5 ? 's' : ''}</p>` : ''}
    <div class="btn-ligne mt-s"><button class="btn primaire" id="revanche">Prendre ma revanche</button><button class="btn" id="pas-maintenant">Pas maintenant</button></div>
  </div>`;
  document.body.appendChild(zone);
  const fermer = () => zone.remove();
  zone.addEventListener('click', ev => { if (ev.target === zone) fermer(); });
  zone.querySelector('#pas-maintenant').addEventListener('click', fermer);
  zone.querySelector('#revanche').addEventListener('click', () => {
    const [theme, mode] = nouveaux[0].k.split('|');
    fermer(); aller(`#/classement?theme=${theme}&mode=${mode}`);
  });
}

// ---------- Modes ----------
function ecranModes() {
  const theme = params().get('theme');
  const t = infoTheme(theme, D);
  if (!t) return aller('#/themes');
  const n = elements(theme).length;
  const prefs = store.prefs();
  const modes = t.modes ? MODES.filter(m => t.modes.includes(m.id)) : MODES;
  let mode = modes.some(m => m.id === prefs.mode) ? prefs.mode : modes[0].id, chrono = prefs.chrono;
  const rendu = () => {
    const c = CHRONOS.find(x => x.id === chrono) || CHRONOS[1];
    app.innerHTML = `
      <div class="entete"><div><button class="retour" id="retour">‹ Thèmes</button><h1>${e(t.nom)}</h1>
        <p class="muted">${n} questions · ${e(t.consigne)}</p></div></div>
      <div class="pile">
        ${modes.map(m => `<button class="tuile ${m.id === mode ? 'active' : ''}" data-mode="${m.id}">
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
      store.sauverPartie(genererPartie(theme, mode, D, { chrono }));
      aller('#/partie');
    });
  };
  rendu();
}

// ---------- Partie ----------
function ecranPartie() {
  const partie = store.partieEnCours();
  if (!partie) return aller('#/themes');
  const t = infoTheme(partie.theme, D);
  if (!t) { store.effacerPartie(); return aller('#/themes'); }
  const els = elements(partie.theme);
  const parId = Object.fromEntries(els.map(x => [x.id, x]));
  partie.reprise = Date.now();
  const ecoule = () => partie.ecoule + (Date.now() - partie.reprise);
  const sauver = () => { partie.ecoule = ecoule(); partie.reprise = Date.now(); store.sauverPartie(partie); };

  function barre(compteur) {
    return `<div class="barre-partie">
      <button class="quitter" id="quitter" aria-label="Quitter">✕</button>
      <div class="infos"><div class="theme">${e(t.nom)}</div><div class="petit muted">${e(nomMode(partie.mode))}</div></div>
      <div class="compteur">${compteur}</div></div>`;
  }
  function brancherQuitter() {
    document.getElementById('quitter').addEventListener('click', () => {
      if (MODES_CHRONO.includes(partie.mode)) { if (confirm('Arrêter ici ? La partie sera comptée telle quelle.')) terminer(); return; }
      sauver(); aller('#/themes');
    });
  }
  const infoHtml = el => (el.infos ? `<ul class="infos">${el.infos.map(i => `<li>${e(i)}</li>`).join('')}</ul>` : el.info ? `<div class="statut">${e(el.info)}</div>` : '');
  const aInfo = el => Boolean(el.info || el.infos);

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
    precharger(parId[partie.ordre[partie.index + 1]]);
    const prompt = t.prompt === 'drapeau'
      ? `<p class="consigne">${e(t.consigne)}</p>${img(el.drapeau, 'drapeau')}`
      : `<p class="consigne">${e(t.consigne)}</p>${el.sousTitre ? '' : img(el.petitDrapeau, 'mini')}<div class="nom">${e(el.titre)}</div>${el.sousTitre ? `<div class="petit muted">${e(el.sousTitre)}</div>` : ''}`;
    // Anciennes parties sauvegardées : les propositions étaient des identifiants, pas des libellés.
    const label = c => (parId[c] ? repTexte(parId[c]).court : c);
    const corps = partie.mode === 'qcm'
      ? `<div class="choix" id="choix">${partie.choix[id].map(c => `<button class="btn" data-choix="${e(label(c))}">${e(label(c))}</button>`).join('')}</div>`
      : `<form class="saisie-ligne" id="f-saisie"><input type="text" id="saisie" autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Ta réponse">
          <button class="btn primaire" type="submit">OK</button></form>
         <button class="btn discret bloc mt-s" id="passer">Je ne sais pas</button>`;
    app.innerHTML = `${barre(`${partie.index + 1}/${partie.ordre.length}`)}
      <div class="progression"><div style="width:${(partie.index / partie.ordre.length) * 100}%"></div></div>
      <div class="carte question">${prompt}</div>${corps}<div id="retour-reponse"></div>`;
    brancherQuitter();
    if (partie.mode === 'qcm') {
      app.querySelectorAll('[data-choix]').forEach(b => b.addEventListener('click', () => repondre(id, courts(el).includes(b.dataset.choix), b.dataset.choix, b)));
    } else {
      const input = document.getElementById('saisie');
      input.focus();
      document.getElementById('f-saisie').addEventListener('submit', ev => {
        ev.preventDefault();
        const v = input.value.trim(); if (!v) return;
        repondre(id, Boolean(trouver(v, [{ id, formes: repTexte(el).formes }])), v);
      });
      document.getElementById('passer').addEventListener('click', () => repondre(id, false, ''));
    }
  }

  function repondre(id, ok, saisie, bouton) {
    const el = parId[id]; const rep = repTexte(el);
    partie.reponses[id] = { ok, saisie };
    partie.index++;
    sauver();
    if (partie.mode === 'qcm') {
      app.querySelectorAll('[data-choix]').forEach(b => { b.disabled = true; if (courts(el).includes(b.dataset.choix)) b.classList.add('ok'); });
      if (!ok && bouton) bouton.classList.add('ko');
    } else {
      document.getElementById('saisie').disabled = true;
      document.getElementById('passer')?.remove();
    }
    const zone = document.getElementById('retour-reponse');
    zone.innerHTML = `<div class="retour-reponse ${ok ? 'ok' : 'ko'}">
      <div><strong>${ok ? 'Exact !' : (saisie ? 'Raté.' : 'Passé.')}</strong></div>
      ${!ok || rep.reponse !== rep.court ? `<div class="bonne">${e(rep.reponse)}</div>` : ''}
      ${infoHtml(el)}
      ${ok && !aInfo(el) ? '' : `<button class="btn primaire mt-s" id="suivant">${partie.index >= partie.ordre.length ? 'Voir le résultat' : 'Suivant'}</button>`}
    </div>`;
    const suivant = document.getElementById('suivant');
    if (suivant) { suivant.focus(); suivant.addEventListener('click', question); }
    else setTimeout(question, 700);
  }

  // ----- Chrono (liste et carte) -----
  function lancerChrono() {
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
  const majCompteur = () => { app.querySelector('.compteur').textContent = `${partie.trouves.length}/${partie.ordre.length}`; };

  // ----- Nomme-les tous (texte) -----
  function liste() {
    const total = partie.ordre.length;
    const placeholder = { pays: 'Un pays…', capitales: 'Une capitale…', usa: t.id === 'etats-usa' ? 'Un État…' : 'Une capitale…', villes: t.carte.pays ? 'Une ville…' : 'Un pays…' }[t.groupe];
    app.innerHTML = `${barre(`${partie.trouves.length}/${total}`)}
      <div class="progression chrono" id="chrono"><div style="width:100%"></div></div>
      <div class="liste-tete"><div class="trouves" id="trouves">${partie.trouves.length} <span class="petit muted">/ ${total}</span></div><div class="temps" id="temps"></div></div>
      ${t.id === 'villes-monde' ? '<p class="petit muted" style="margin:-6px 0 8px">Cite les pays : chaque pays compte pour ses 5 villes.</p>' : ''}
      <form class="saisie-ligne" id="f-liste" style="margin-top:4px"><input type="text" id="saisie" autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="${placeholder}">
        <button class="btn primaire" type="submit">OK</button></form>
      <div class="pastilles" id="pastilles">${partie.trouves.map(id => pastille(id)).join('')}</div>
      <button class="btn discret bloc mt" id="fin">J’ai fini</button>`;
    brancherQuitter();
    const input = document.getElementById('saisie');
    input.focus();
    document.getElementById('fin').addEventListener('click', () => { if (confirm('Terminer maintenant ?')) terminer(); });

    const restants = () => partie.ordre.filter(id => !partie.trouves.includes(id)).map(id => ({ id, formes: repTexte(parId[id]).formes }));
    const accepter = id => {
      // Une réponse texte peut valoir pour plusieurs éléments (le pays de plusieurs villes) : on les valide tous.
      const rep = repTexte(parId[id]).court;
      const gagnes = partie.ordre.filter(x => !partie.trouves.includes(x) && repTexte(parId[x]).court === rep);
      partie.trouves.push(...gagnes); sauver();
      document.getElementById('pastilles').insertAdjacentHTML('afterbegin', gagnes.map(x => pastille(x, true)).join(''));
      document.getElementById('trouves').innerHTML = `${partie.trouves.length} <span class="petit muted">/ ${total}</span>`;
      majCompteur();
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
        const deja = trouver(v, partie.trouves.map(id => ({ id, formes: repTexte(parId[id]).formes })));
        toast(deja ? 'Déjà trouvé !' : 'Non…', 1200);
        input.classList.remove('secoue'); void input.offsetWidth; input.classList.add('secoue');
        input.select();
      }
    });
    lancerChrono();
  }
  function pastille(id, neuf = false) {
    const el = parId[id];
    return `<span class="pastille ${neuf ? 'neuf' : ''}">${img(el.petitDrapeau?.replace('w80', 'w40'))}${e(t.id === 'villes-monde' ? el.court : repTexte(el).court)}</span>`;
  }

  // ----- Carte -----
  // Sur la carte, on touche des « cibles » : les éléments eux-mêmes, ou les pays quand le thème porte sur des personnes.
  const cibles = t.cibles ? elements(t.cibles) : els;
  const cibleParId = Object.fromEntries(cibles.map(x => [x.id, x]));
  async function chargerCarte(zone, onClic) {
    const { chargerFond, creerCarte } = await import('./carte.js');
    const fond = await chargerFond(t.carte, D);
    return creerCarte(zone, fond, { vue: t.carte, elements: cibles, onClic });
  }
  const unite = { pays: 'un pays', capitales: 'un pays', usa: 'un État', villes: 'une ville' }[t.groupe];

  async function carteNommer() {
    const total = partie.ordre.length;
    app.innerHTML = `${barre(`${partie.trouves.length}/${total}`)}
      <div class="progression chrono" id="chrono"><div style="width:100%"></div></div>
      <div class="liste-tete" style="margin-top:-8px"><div class="petit muted" id="consigne">Touche ${unite} sur la carte</div><div class="temps" id="temps"></div></div>
      <form class="saisie-ligne" id="f-carte" style="margin:4px 0 10px"><input type="text" id="saisie" disabled autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Touche ${unite}…">
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
    lancerChrono();
    function clic(id) {
      if (partie.trouves.includes(id)) { toast(`Déjà trouvé : ${parId[id].court}`, 1200); return; }
      sel = id; carte.selectionner(id);
      input.disabled = false; input.placeholder = t.consigneCarte; input.focus();
      document.getElementById('consigne').textContent = t.consigneCarte;
    }
    document.getElementById('f-carte').addEventListener('submit', ev => {
      ev.preventDefault();
      if (!sel) { toast(`Touche d’abord ${unite}`, 1200); return; }
      const v = input.value.trim(); if (!v) return;
      if (trouver(v, [{ id: sel, formes: parId[sel].formes }])) {
        partie.trouves.push(sel); sauver();
        carte.marquer(sel, 'trouve'); carte.etiqueter(sel, parId[sel].court); carte.selectionner(null);
        sel = null; input.value = ''; input.placeholder = `Touche ${unite}…`; input.disabled = true;
        document.getElementById('consigne').textContent = `Touche ${unite} sur la carte`;
        majCompteur();
        if (partie.trouves.length === total) terminer();
      } else {
        partie.erreurs++; sauver();
        carte.clignoter(sel, 'erreur');
        const autre = trouver(v, partie.ordre.filter(id => id !== sel).map(id => ({ id, formes: parId[id].formes })));
        toast(autre ? 'C’est la réponse d’un autre endroit…' : 'Non…', 1200);
        input.classList.remove('secoue'); void input.offsetWidth; input.classList.add('secoue'); input.select();
      }
    });
  }

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
    // Pays (ou État, ou ville) attendu pour un élément : lui-même, ou sa nationalité principale.
    const cibleDe = el => (el.pays && t.cibles ? el.pays[0] : el.id);
    const estBon = (el, code) => (el.pays && t.cibles ? el.pays.includes(code) : code === el.id);
    for (const [id, r] of Object.entries(partie.reponses)) { const c = cibleDe(parId[id]); carte.marquer(c, r.ok ? 'trouve' : 'manque'); carte.etiqueter(c, cibleParId[c].court); }
    poser();
    function invite(el) {
      if (t.groupe === 'perso') return `De quel pays est <strong>${e(el.titre)}</strong> ?<br><span class="petit muted">${e(el.sousTitre)}</span>`;
      if (t.groupe === 'capitales' || t.id === 'capitales-usa') return `${t.id === 'capitales-usa' ? 'Quel État' : 'Quel pays'} a pour capitale <strong>${e(el.court)}</strong> ?`;
      return `Où est <strong>${e(el.court)}</strong> ?`;
    }
    function poser() {
      if (partie.index >= total) return terminer();
      document.getElementById('cible').innerHTML = invite(parId[partie.ordre[partie.index]]);
      app.querySelector('.compteur').textContent = `${partie.index + 1}/${total}`;
      app.querySelector('.progression > div').style.width = `${(partie.index / total) * 100}%`;
      attente = true;
    }
    function clic(code) {
      if (!attente) return;
      if (!t.cibles && partie.reponses[code]) { toast(`Déjà joué : ${parId[code].court}`, 1000); return; }
      const id = partie.ordre[partie.index]; const el = parId[id]; const ok = estBon(el, code);
      const bonne = ok ? code : cibleDe(el);
      attente = false;
      partie.reponses[id] = { ok, saisie: ok ? '' : cibleParId[code].titre };
      partie.index++; sauver();
      const suite = el.infos ? `${infoHtml(el)}<button class="btn primaire mt-s" id="suivant">${partie.index >= total ? 'Voir le résultat' : 'Suivant'}</button>` : '';
      if (ok) {
        carte.marquer(bonne, 'trouve'); carte.etiqueter(bonne, cibleParId[bonne].court);
        document.getElementById('cible').innerHTML = `<span class="ok-texte">Exact !</span>${suite}`;
        if (!el.infos) setTimeout(poser, 500);
      } else {
        carte.clignoter(code, 'erreur', 1400); carte.marquer(bonne, 'manque'); carte.etiqueter(bonne, cibleParId[bonne].court);
        document.getElementById('cible').innerHTML = `<span class="ko-texte">Non, c’était ${e(cibleParId[code].titre)}.</span> La bonne réponse${t.cibles ? ` (${e(el.reponse)})` : ''} est en rouge sur la carte.${suite}`;
        if (!el.infos) setTimeout(poser, 1600);
      }
      document.getElementById('suivant')?.addEventListener('click', poser);
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
  const t = infoTheme(r.theme, D);
  const pct = Math.round((r.bonnes / r.total) * 100);
  const s = store.session();
  const parId = Object.fromEntries(elements(r.theme).map(x => [x.id, x]));
  const rates = r.details.rates.map(id => parId[id]).filter(Boolean);
  app.innerHTML = `
    <div class="entete"><div><p class="sur">${e(t?.nom || r.theme)} · ${e(nomMode(r.mode))}</p><h1>${pct === 100 ? 'Sans faute !' : pct >= 80 ? 'Bien joué' : pct >= 50 ? 'Pas mal' : 'À retravailler'}</h1></div></div>
    <div class="carte score">
      <div class="gros">${r.bonnes}<small> / ${r.total}</small></div>
      <div class="sous">${pct} % · ${formaterDuree(r.duree_ms)}${r.details.erreurs ? ` · ${r.details.erreurs} essai${r.details.erreurs > 1 ? 's' : ''} raté${r.details.erreurs > 1 ? 's' : ''}` : ''}</div>
      <div class="sous petit" id="enregistrement">${r.enregistrement === 'ok' ? 'Partie enregistrée' : r.enregistrement === 'en cours' ? 'Enregistrement…' : e(r.enregistrement)}</div>
      <div class="sous" id="rang"></div>
    </div>
    <div class="btn-ligne mt">
      <button class="btn primaire" id="rejouer">Rejouer</button>
      <button class="btn" id="autre">Autre thème</button>
      <button class="btn" id="voir-classement">Classement</button>
    </div>
    ${rates.length ? `<h2 class="mt">${rates.length === 1 ? 'La réponse ratée' : `Les ${rates.length} réponses ratées`}</h2>
      <div class="rates">${rates.map(el => `<div class="rate">${img(el.petitDrapeau)}<div class="texte">
        <div class="bonne">${e(el.libelle)}</div>
        ${r.details.reponses?.[el.id] ? `<div class="toi">Toi : ${e(r.details.reponses[el.id])}</div>` : ''}
        ${el.infos ? `<ul class="infos statut">${el.infos.map(i => `<li>${e(i)}</li>`).join('')}</ul>` : el.info ? `<div class="statut">${e(el.info)}</div>` : ''}
      </div></div>`).join('')}</div>` : ''}`;
  document.getElementById('rejouer').addEventListener('click', () => {
    store.sauverPartie(genererPartie(r.theme, r.mode, D, { chrono: r.details.chrono })); aller('#/partie');
  });
  document.getElementById('autre').addEventListener('click', () => aller('#/themes'));
  document.getElementById('voir-classement').addEventListener('click', () => aller(`#/classement?theme=${r.theme}&mode=${r.mode}`));
  if (r.enregistrement === 'en cours') return; // le rang se calcule une fois la partie enregistrée
  try {
    const cl = (await store.classement()).filter(x => x.theme === r.theme && x.mode === r.mode).sort(trier);
    const moi = cl.find(x => x.pseudo === s.pseudo);
    const rang = moi ? cl.indexOf(moi) + 1 : null;
    const el = document.getElementById('rang');
    if (el && rang) {
      // Record perso : cette partie est la meilleure du joueur sur ce thème et ce mode (score, puis temps).
      const record = moi.bonnes === r.bonnes && moi.duree_ms === r.duree_ms;
      el.innerHTML = `${record ? '<span class="badge ok">Record perso</span> ' : ''}${rang === 1 ? 'Meilleur de la famille' : `${rang}e de la famille sur ${cl.length}`}`;
      if (!r.celebre) {
        r.celebre = true;
        try { sessionStorage.setItem('qg.resultat', JSON.stringify(r)); } catch { /* rien */ }
        if (record) confettis();
        if (rang === 1) moonwalk();
      }
    }
  } catch { /* classement indisponible */ }
}

// ---------- Célébrations ----------
function confettis() {
  const zone = document.createElement('div'); zone.className = 'confettis'; zone.setAttribute('aria-hidden', 'true');
  const couleurs = ['#1f6f8b', '#e2762a', '#f2c84b', '#2e7d32', '#c62828', '#6fa8dc', '#c06ad8'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = couleurs[i % couleurs.length];
    c.style.animationDelay = `${Math.random() * 1.2}s`;
    c.style.animationDuration = `${2.6 + Math.random() * 1.6}s`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.style.width = `${6 + Math.random() * 6}px`;
    zone.appendChild(c);
  }
  const titre = document.createElement('div'); titre.className = 'bandeau-record'; titre.textContent = 'Record personnel !';
  zone.appendChild(titre);
  document.body.appendChild(zone);
  setTimeout(() => zone.remove(), 5200);
}

function moonwalk() {
  const d = document.createElement('div'); d.className = 'moonwalk'; d.setAttribute('aria-hidden', 'true');
  // Chaussures noires, pantalon blanc, haut rouge, cheveux longs noirs, casquette jaune à l'envers.
  d.innerHTML = `<div class="danseur"><svg viewBox="0 0 80 130" width="96" height="156">
      <g class="corps">
        <path d="M18 24 Q18 44 24 56 L36 56 Q30 40 30 24 Z" fill="#141414"/>
        <path d="M62 24 Q62 44 56 56 L44 56 Q50 40 50 24 Z" fill="#141414"/>
        <circle cx="40" cy="24" r="11" fill="#e8b89a"/>
        <path d="M27 22 Q40 4 53 22 Q46 16 40 17 Q34 16 27 22 Z" fill="#141414"/>
        <path d="M26 20 Q40 6 54 20 L54 24 Q40 16 26 24 Z" fill="#f2c84b"/>
        <path d="M54 22 L70 26 L68 31 L54 26 Z" fill="#f2c84b"/>
        <rect x="26" y="19" width="28" height="4" rx="2" fill="#d9ad2f"/>
        <path d="M30 36 L50 36 L53 72 L27 72 Z" fill="#c62828"/>
        <path class="bras bras-g" d="M30 40 L16 64" stroke="#c62828" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path class="bras bras-d" d="M50 40 L64 62" stroke="#c62828" stroke-width="7" stroke-linecap="round" fill="none"/>
        <circle cx="15" cy="66" r="4" fill="#e8b89a"/><circle cx="65" cy="64" r="4" fill="#e8b89a"/>
      </g>
      <path class="jambe jambe-g" d="M33 72 L29 116" stroke="#f4f4f4" stroke-width="9" stroke-linecap="round" fill="none"/>
      <path class="jambe jambe-d" d="M47 72 L51 116" stroke="#f4f4f4" stroke-width="9" stroke-linecap="round" fill="none"/>
      <path class="pied pied-g" d="M20 120 L36 120 Q38 120 38 117 L38 113 L28 113 Q22 113 20 118 Z" fill="#141414"/>
      <path class="pied pied-d" d="M44 120 L60 120 Q62 120 62 117 L62 113 L52 113 Q46 113 44 118 Z" fill="#141414"/>
    </svg></div><div class="bandeau-premier">1<sup>re</sup> place !</div>`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 7000);
}

// ---------- Classement ----------
async function ecranClassement() {
  const s = store.session();
  const p = params();
  const prefs = store.prefs();
  let theme = p.get('theme') || prefs.dernierTheme || 'pays-europe';
  let mode = p.get('mode') || prefs.mode || 'saisie';
  if (!infoTheme(theme, D)) theme = 'pays-europe';
  app.innerHTML = `<div class="entete"><div><p class="sur">Famille</p><h1>Classement</h1></div></div><div class="chargement">Chargement…</div>`;
  let tout = [], fil = [];
  try { [tout, fil] = await Promise.all([store.classement(), store.dernieresParties()]); }
  catch (ex) { app.innerHTML += `<p class="erreur">${e(ex.message)}</p>`; return; }
  const general = classementGeneral(tout, trier);
  const rendu = () => {
    const lignes = tout.filter(x => x.theme === theme && x.mode === mode).sort(trier);
    app.innerHTML = `
      <div class="entete"><div><p class="sur">Famille</p><h1>Classement général</h1></div></div>
      <div class="carte mb" style="padding:4px 12px">
        ${general.length ? `<table><thead><tr><th></th><th>Joueur</th><th class="num">Points</th><th class="num">Jeux</th><th class="num">🥇 🥈 🥉</th></tr></thead><tbody>
          ${general.map((g, i) => `<tr class="${g.pseudo === s.pseudo ? 'moi' : ''}"><td class="rang">${i + 1}</td><td><span class="avatar petit-avatar">${emojiAvatar(g.avatar)}</span><strong>${e(g.pseudo)}</strong></td>
            <td class="num"><strong>${g.points}</strong></td><td class="num muted">${g.jeux}</td><td class="num muted">${g.podiums.join(' · ')}</td></tr>`).join('')}
        </tbody></table>
        <details class="petit muted" style="padding:8px 0 10px"><summary>Comment sont comptés les points ?</summary>
          <p class="mt-s">Pour chaque jeu (un thème dans un mode), ta meilleure partie compte : 1 point par bonne réponse en QCM, ×2 en saisie, en « Nomme-les tous » et sur la carte « Trouve-le », ×3 sur la carte « Nomme-les tous ». Bonus par jeu : +${BONUS_PODIUM[0]} au premier, +${BONUS_PODIUM[1]} au deuxième, +${BONUS_PODIUM[2]} au troisième. À égalité de score sur un jeu, le plus rapide est devant.</p>
        </details>` : '<p class="vide">Aucune partie enregistrée pour l’instant.</p>'}
      </div>
      <h2 class="mb">Par jeu</h2>
      <div class="pile">
        <select id="theme">${GROUPES.map(g => `<optgroup label="${e(g.nom)}">${THEMES.filter(t => t.groupe === g.id).map(t => `<option value="${t.id}" ${t.id === theme ? 'selected' : ''}>${e(t.nom)}</option>`).join('')}</optgroup>`).join('')}</select>
        <div class="segment defile">${MODES.map(m => `<button data-mode="${m.id}" class="${m.id === mode ? 'actif' : ''}">${m.nom}</button>`).join('')}</div>
      </div>
      <div class="carte mt" style="padding:4px 12px">
        ${lignes.length ? `<table><thead><tr><th></th><th>Joueur</th><th class="num">Score</th><th class="num">Temps</th><th class="num">Parties</th></tr></thead><tbody>
          ${lignes.map((l, i) => `<tr class="${l.pseudo === s.pseudo ? 'moi' : ''}"><td class="rang">${i + 1}</td><td><span class="avatar petit-avatar">${emojiAvatar(l.avatar)}</span><strong>${e(l.pseudo)}</strong><br><span class="petit muted">${formaterDate(l.jouee_le)}</span></td>
            <td class="num"><strong>${l.bonnes}</strong>/${l.total}</td><td class="num">${formaterDuree(l.duree_ms)}</td><td class="num muted">${l.parties}</td></tr>`).join('')}
        </tbody></table>` : `<p class="vide">Personne n’a encore joué ce thème dans ce mode.</p>`}
      </div>
      <button class="btn primaire bloc mt" id="jouer-ce-theme">Jouer ${e(nomTheme(theme, D))} en ${e(nomMode(mode))}</button>
      <h2 class="mt mb">Dernières parties</h2>
      <div class="fil">${fil.length ? fil.map(f => `<div class="item"><div><span class="avatar petit-avatar">${emojiAvatar(f.avatar)}</span><span class="qui">${e(f.pseudo)}</span> <span class="muted">·</span> ${e(nomTheme(f.theme, D))} <span class="badge">${e(nomMode(f.mode))}</span></div>
        <div class="centre" style="flex:none"><strong>${f.bonnes}/${f.total}</strong><br><span class="petit muted">${formaterDate(f.jouee_le)}</span></div></div>`).join('') : '<p class="vide">Rien pour l’instant.</p>'}</div>`;
    document.getElementById('theme').addEventListener('change', ev => { theme = ev.target.value; rendu(); });
    app.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; rendu(); }));
    document.getElementById('jouer-ce-theme').addEventListener('click', () => {
      store.sauverPrefs({ mode, dernierTheme: theme }); store.sauverPartie(genererPartie(theme, mode, D, { chrono: prefs.chrono })); aller('#/partie');
    });
  };
  rendu();
}

// ---------- Profil et progression ----------
async function ecranProfil() {
  const s = store.session();
  app.innerHTML = `<div class="entete"><div class="ligne"><button class="avatar grand" id="ouvrir-avatars" aria-label="Changer d’avatar">${emojiAvatar(s.avatar) || '🙂'}</button><div><p class="sur">Profil</p><h1>${e(s.pseudo)}</h1></div></div>
    <button class="btn discret" id="deconnexion">Se déconnecter</button></div>
    <details class="carte mb" id="avatars"><summary class="ligne espace"><strong>Mon avatar</strong><span class="petit muted">${s.avatar ? 'Changer' : 'Choisis-en un'}</span></summary>
      <div class="grille-avatars">${AVATARS.map(a => `<button class="avatar choix-avatar ${a.id === s.avatar ? 'actif' : ''}" data-avatar="${a.id}" title="${e(a.nom)}" aria-label="${e(a.nom)}">${a.e}</button>`).join('')}</div>
    </details>
    <div class="chargement">Chargement…</div>`;
  document.getElementById('deconnexion').addEventListener('click', () => { store.fermerSession(); store.effacerPartie(); aller('#/connexion'); });
  document.getElementById('ouvrir-avatars').addEventListener('click', () => { document.getElementById('avatars').open = true; });
  if (!s.avatar) document.getElementById('avatars').open = true;
  app.querySelectorAll('[data-avatar]').forEach(b => b.addEventListener('click', async () => {
    try {
      await store.definirAvatar(b.dataset.avatar);
      app.querySelectorAll('[data-avatar]').forEach(x => x.classList.toggle('actif', x === b));
      document.getElementById('ouvrir-avatars').textContent = b.textContent;
      toast('Avatar enregistré');
    } catch (ex) { toast(ex.message); }
  }));
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
  // Jeux (thème × mode) jamais joués par ce joueur.
  const joues = new Set(hist.map(h => `${h.theme}|${h.mode}`));
  const restants = THEMES.map(t => ({ t, modes: (t.modes ? MODES.filter(m => t.modes.includes(m.id)) : MODES).filter(m => !joues.has(`${t.id}|${m.id}`)) })).filter(x => x.modes.length);
  const nbRestants = restants.reduce((a, x) => a + x.modes.length, 0);
  app.querySelector('.chargement').outerHTML = `
    <div class="stat">
      <div class="carte"><div class="n">${hist.length}</div><div class="l">parties</div></div>
      <div class="carte"><div class="n">${totalQ ? Math.round((totalBonnes / totalQ) * 100) : 0} %</div><div class="l">de réussite</div></div>
      <div class="carte"><div class="n">${themes.filter(t => t.meilleure.bonnes === t.meilleure.total).length}</div><div class="l">sans faute</div></div>
    </div>
    <h2 class="mt mb">Progression par thème</h2>
    <div class="carte" style="padding:4px 16px">${themes.length ? themes.map(t => {
      const parId = infoTheme(t.theme, D) ? Object.fromEntries(elements(t.theme).map(x => [x.id, x])) : {};
      const rates = (t.derniere.details?.rates || []).map(id => parId[id]).filter(Boolean);
      return `<details class="theme-ligne"><summary><div><strong>${e(nomTheme(t.theme, D))}</strong><br><span class="petit muted">${t.parties.length} partie${t.parties.length > 1 ? 's' : ''} · record ${t.meilleure.bonnes}/${t.meilleure.total} (${e(nomMode(t.meilleure.mode))})</span></div>
        <div class="score-mini ${t.derniere.bonnes === t.derniere.total ? 'badge ok' : ''}">${t.derniere.bonnes}/${t.derniere.total}</div></summary>
        <div class="mt-s">${rates.length ? `<p class="petit muted">À revoir (dernière partie, ${e(nomMode(t.derniere.mode))}) :</p>
          <div class="pastilles">${rates.map(el => `<span class="pastille manque">${img(el.petitDrapeau?.replace('w80', 'w40'))}${e(el.libelle)}</span>`).join('')}</div>`
          : '<p class="petit muted">Dernière partie sans faute.</p>'}</div></details>`;
    }).join('') : '<p class="vide">Joue une première partie pour voir ta progression.</p>'}</div>
    <details class="carte mt" id="restants"><summary class="ligne espace"><strong>Jeux pas encore joués</strong><span class="badge accent">${nbRestants}</span></summary>
      ${restants.length ? `<div class="pile mt-s" style="gap:8px">${restants.map(x => `<div class="ligne" style="flex-wrap:wrap;gap:6px"><span class="petit" style="min-width:140px"><strong>${e(x.t.nom)}</strong></span>${x.modes.map(m => `<button class="pastille jouer" data-theme="${x.t.id}" data-mode="${m.id}">${e(m.nom)}</button>`).join('')}</div>`).join('')}</div>`
        : '<p class="petit muted mt-s">Tu as tout essayé, bravo !</p>'}
    </details>
    <p class="petit muted centre mt">${store.enLigne() ? 'Scores partagés dans la famille' : 'Mode hors ligne'} · v${VERSION}</p>`;
  app.querySelectorAll('.jouer[data-theme]').forEach(b => b.addEventListener('click', () => {
    store.sauverPrefs({ mode: b.dataset.mode, dernierTheme: b.dataset.theme });
    store.sauverPartie(genererPartie(b.dataset.theme, b.dataset.mode, D, { chrono: store.prefs().chrono }));
    aller('#/partie');
  }));
}

// ---------- Infos ----------
function ecranInfos() {
  const nb = D.personnes.length;
  app.innerHTML = `
    <div class="entete"><div><p class="sur">Quiz géo v${VERSION}</p><h1>Infos</h1></div></div>
    <section class="carte mb pile">
      <h2>Le classement général</h2>
      <p>Pour chaque <strong>jeu</strong> (un thème joué dans un mode), seule ta <strong>meilleure partie</strong> compte. Elle rapporte un nombre de points égal au nombre de bonnes réponses, multiplié selon le mode :</p>
      <table><tbody>
        <tr><td>QCM</td><td class="num"><strong>× 1</strong></td></tr>
        <tr><td>Saisie</td><td class="num"><strong>× 2</strong></td></tr>
        <tr><td>Nomme-les tous</td><td class="num"><strong>× 2</strong></td></tr>
        <tr><td>Carte : trouve-le</td><td class="num"><strong>× 2</strong></td></tr>
        <tr><td>Carte : nomme-les tous</td><td class="num"><strong>× 3</strong></td></tr>
      </tbody></table>
      <p>Puis un <strong>bonus de podium</strong> par jeu : +${BONUS_PODIUM[0]} au premier de la famille, +${BONUS_PODIUM[1]} au deuxième, +${BONUS_PODIUM[2]} au troisième. À score égal sur un jeu, le plus rapide est devant. Le total de tous les jeux donne le classement général ; plus tu explores de jeux, plus tu marques.</p>
    </section>
    <section class="carte mb pile">
      <h2>D’où viennent les réponses ?</h2>
      <p><strong>Pays, capitales, continents</strong> : base libre <em>mledoze/countries</em> et Wikidata pour les noms français, relues à la main (capitales multiples, variantes acceptées). Les 193 membres de l’ONU plus le Kosovo, Taïwan, la Palestine et le Vatican, dont le statut est précisé.</p>
      <p><strong>Drapeaux</strong> : images de <em>flagcdn.com</em>. <strong>Contours des pays</strong> : Natural Earth (via <em>world-atlas</em>, 1:50m). <strong>États américains</strong> : US Census Bureau (via <em>us-atlas</em>) et Wikidata pour les capitales.</p>
      <p><strong>Grandes villes</strong> : les 10 premières économies selon le PIB nominal du FMI (2025) ; pour chacune, les 5 villes les plus peuplées au sens de la <em>ville proprement dite</em> (commune ou municipalité), d’après le dernier recensement national. Populations arrondies.</p>
      <p><strong>Personnalités</strong> (${nb} fiches) : textes rédigés pour ce quiz à partir d’informations publiques (Wikipédia, encyclopédies, sites officiels), avec les dates et faits vérifiables ; nationalités multiples acceptées quand elles existent. Les « gentilés » (française, allemand…) sont acceptés en réponse.</p>
      <p><strong>Les 100 footballeurs les plus connus</strong> : liste établie en croisant trois classements publiés, l’équipe de rêve du Ballon d’or (<em>France Football</em>, 2020), la liste <em>FIFA 100</em> dressée par Pelé pour le centenaire de la FIFA (2004) et les 100 meilleurs joueurs du XXe siècle du magazine <em>World Soccer</em> (1999), complétés par les Ballons d’or et les stars des années 2010-2020, ainsi que quelques joueuses majeures. La sélection finale est celle du quiz, pas un classement officiel.</p>
      <p class="petit muted">Une erreur ? Un oubli ? Dis-le à papa, qui corrigera la fiche.</p>
    </section>
    <section class="carte pile">
      <h2>Ce que fait l’app</h2>
      <p>Pseudo et code secret à 4 chiffres, code famille sur chaque appareil. Scores partagés dans la famille uniquement. Moonwalk quand tu prends la première place d’un jeu, confettis quand tu bats ton record. Si quelqu’un te dépasse pendant ton absence, tu le sauras en revenant.</p>
    </section>`;
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
    case 'infos': return ecranInfos();
    default: return aller('#/themes');
  }
}

async function demarrer() {
  try { D = await chargerDonnees(); THEMES = listeThemes(D); }
  catch (ex) { app.innerHTML = `<p class="erreur centre">${e(ex.message)}</p>`; return; }
  window.addEventListener('hashchange', rendre);
  window.addEventListener('online', () => store.synchroniser().then(n => { if (n) toast(`${n} partie(s) envoyée(s)`); }));
  store.synchroniser().catch(() => {});
  rendre();
}
demarrer();
