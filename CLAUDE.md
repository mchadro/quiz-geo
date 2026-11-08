# Quiz géo : notes pour Claude

Quiz de géographie familial pour les enfants de Mathieu (14 et 18 ans, très calés). Site statique en français, pensé pour l'iPhone, publié sur GitHub Pages à <https://mchadro.github.io/quiz-geo/>. Le README décrit l'installation et les sources ; ce fichier dit comment travailler dans le projet.

## Architecture

- Aucun framework, aucun build : HTML + CSS + modules ES natifs. Pas de Node ni Python sur ce PC : les scripts utilitaires sont en PowerShell 5.1 (`outils/`), à enregistrer en UTF-8 **avec BOM** sinon les accents sont corrompus.
- `js/app.js` : routeur par hash (`#/themes`, `#/partie`, `#/resultats`, `#/classement`, `#/profil`, `#/infos`) et tous les écrans. `js/data.js` : thèmes, modes, barème, construction des parties. `js/carte.js` : cartes SVG (d3-geo + topojson, chargés à la demande depuis `lib/`). `js/store.js` : Supabase via `fetch` sur `/rest/v1/rpc/*`, ou `localStorage` en mode hors ligne. `js/texte.js` : normalisation et comparaison tolérante des réponses.
- Données dans `data/` : `pays.json` (197 pays, gentilés, statuts), `etats-usa.json`, `villes.json`, `personnalites.json` (index des lots) et `perso-*.json`.
- Un **thème** (`infoTheme`) × un **mode** = un **jeu**. Les éléments d'un thème (`elementsTheme`) ont une forme commune : `id, court, reponse, formes, drapeau, titre, libelle, info/infos`. Pour ajouter un type de contenu, étendre `infoTheme`, `elementsTheme`, `listeThemes` ; les écrans n'ont en principe pas à changer.
- Modes : `qcm`, `saisie`, `liste` (texte, chrono), `carte` (toucher puis taper, chrono), `carte-trouve`. Un thème peut restreindre ses modes (`modes: [...]`).

## Backend Supabase

- Même projet que le Démineur Sauvage (`nrdjeneudsfabcvsmzsz`), tables préfixées `qg_`, **aucun accès direct** : tout passe par des fonctions `security definer` qui vérifient le code famille puis pseudo + PIN. Schéma dans `supabase-quiz.sql`, migration avatars dans `supabase-avatars.sql`.
- Le code famille n'est jamais dans le dépôt (haché en base). Les modifications de schéma se font en collant le SQL dans l'éditeur Supabase ; Mathieu clique lui-même sur Run quand le classificateur bloque l'action.
- Pour tester sans toucher à la base : `http://localhost:8765/?local` (`outils/serveur-local.ps1`, configuré dans `.claude/launch.json`).

## Règles décidées par Mathieu (ne pas rediscuter)

- Le nombre de questions d'une session est celui du thème, jamais plafonné.
- Classement par jeu : score décroissant puis temps croissant. Classement général : `POINTS_MODE` et `BONUS_PODIUM` dans `data.js`, calculé à l'affichage.
- Célébrations : moonwalk à la première place, confettis au record perso, les deux si cumul ; carte « X t'a battu sur Y » à l'ouverture ; elles doivent rester visibles même avec « Réduire les animations ».
- Continents : Russie en Europe, Turquie et Caucase en Asie, Amériques en trois blocs. Villes : ville proprement dite. Personnalités : 15 / 8 / 3 fiches selon la taille du pays, nationalités multiples acceptées, la première du tableau `pays` sert pour la carte et le continent.

## Façons de faire

- Toujours tester dans le navigateur intégré avant de pousser (mode `?local`, et viewport mobile pour les écrans de jeu). Chaque livraison : bumper `VERSION` dans `js/config.js` **et** le `?v=` du script dans `index.html`, mettre à jour le README si le périmètre change, puis `git push` : GitHub Pages publie en une minute environ.
- Textes des fiches : français, factuel, trois lignes, dates vérifiables ; relecture par la famille, corrections au fil de l'eau.
- Répondre à Mathieu en français ; commits en français.
