# Quiz géo

Quiz de géographie pour la famille : pays et capitales par continent, États américains et leurs capitales, grandes villes des 10 premières économies ; cinq modes de jeu (QCM, saisie, « Nomme-les tous » contre la montre, et deux modes sur carte cliquable), comptes joueurs et classement familial. Site statique, pensé pour l'iPhone (ajout à l'écran d'accueil).

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html`, `css/`, `js/` | L'application (sans framework, modules JS natifs) |
| `data/pays.json` | 197 pays : noms et variantes acceptées, capitales, continent, statut particulier |
| `supabase-quiz.sql` | Tables et fonctions Supabase (à coller une fois dans l'éditeur SQL) |
| `js/config.js` | Adresse et clé publique du projet Supabase |
| `outils/serveur-local.ps1` | Serveur web local pour tester sur l'ordinateur |
| `manifest.webmanifest`, `icons/` | Icône et réglages pour l'écran d'accueil iPhone |

## Mise en ligne (même méthode que le Démineur Sauvage)

### 1. Supabase : créer les tables

1. Ouvrir le projet Supabase (celui du Démineur), menu **SQL Editor**, **New query**.
2. Ouvrir `supabase-quiz.sql`, remplacer `CHANGEZ-MOI` (dernières lignes) par le **code famille** de votre choix, coller le tout, cliquer **Run**.
3. Pour changer le code famille plus tard : relancer uniquement le dernier bloc `insert into public.qg_famille…` avec le nouveau code.
4. Coller et lancer ensuite `supabase-avatars.sql` (avatar des joueurs dans la connexion et les classements).

Les tables sont préfixées `qg_` et n'ont aucun accès direct : tout passe par des fonctions qui vérifient le code famille, puis le pseudo et le code secret du joueur. Les codes secrets sont stockés hachés.

### 2. GitHub Pages : publier le site

1. Sur github.com, créer un dépôt **public** nommé `quiz-geo` (sans README ni fichier initial).
2. Dans ce dossier, en PowerShell :

```powershell
git remote add origin https://github.com/mchadro/quiz-geo.git
git push -u origin main
```

3. Sur GitHub : **Settings › Pages › Source : Deploy from a branch**, branche `main`, dossier `/ (root)`, **Save**.
4. Une à deux minutes plus tard, le site est à l'adresse `https://mchadro.github.io/quiz-geo/`.

Chaque mise à jour se publie ensuite par un simple `git push`.

### 3. Sur l'iPhone

Ouvrir l'adresse dans Safari, bouton Partager, **Sur l'écran d'accueil**. Au premier lancement : taper le code famille (gardé en mémoire sur l'appareil), puis créer son joueur (pseudo et code secret à 4 chiffres).

## Tester sur l'ordinateur

```powershell
powershell -ExecutionPolicy Bypass -File outils/serveur-local.ps1
```

Puis ouvrir <http://localhost:8765/>. Ajouter `?local` à l'adresse (`http://localhost:8765/?local`) pour jouer sans toucher à Supabase : les scores restent alors dans le navigateur.

## Données

- Liste des pays, noms français, continents : [mledoze/countries](https://github.com/mledoze/countries) (licence ODbL), relu à la main.
- Noms français des capitales : Wikidata, relu à la main (capitales multiples, cas particuliers).
- Drapeaux : [flagcdn.com](https://flagcdn.com) (domaine public).
- 193 membres de l'ONU + Kosovo, Taïwan, Palestine, Vatican, chacun avec une note sur son statut.
- Découpage : Europe (46, dont Russie et Chypre), Asie (48, dont Turquie, Caucase, Kazakhstan), Afrique (54), Amérique du Nord (3), Amérique centrale et Caraïbes (20), Amérique du Sud (12), Océanie (14).

- Contours des pays : Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas) (`data/monde-50m.json`, domaine public), projetés avec d3-geo (`lib/`). Les pays trop petits pour être touchés (Vatican, Malte, îles du Pacifique…) ont un repère rond qui disparaît quand on zoome assez.

- États américains : `data/etats-usa.json` (noms français, capitales, codes FIPS), contours us-atlas 1:10m (`data/usa-10m.json`), projection Albers USA avec Alaska et Hawaï en médaillon.
- Grandes villes : `data/villes.json`. Les 10 premières économies (PIB nominal, FMI 2025) : États-Unis, Chine, Allemagne, Japon, Inde, Royaume-Uni, France, Italie, Canada, Brésil. Pour chacune, les 5 villes les plus peuplées au sens de la **ville proprement dite** (commune ou municipalité), ce qui donne par exemple Chongqing devant Shanghai en Chine, et Leeds ou Sheffield au Royaume-Uni. Le thème « Monde » interroge le pays de chaque ville en mode texte, et la ville elle-même sur la carte.

- Personnalités : `data/personnalites.json`, rédigé et relu à la main (dates et faits vérifiables sur Wikipédia). Chaque fiche : nationalités acceptées (codes ISO, la première est la principale et sert pour la carte), domaine, dates, 3 lignes d'information affichées après la réponse. Les gentilés (« française », « allemand »…) sont dans `pays.json` et acceptés en saisie. Livré par lots : lot 1 = France, Allemagne, Royaume-Uni, Italie, Espagne, Russie (15 chacun).

## Règles du classement et célébrations

- Classement par thème et par mode : meilleure partie de chaque joueur, triée par score décroissant puis **temps croissant** (à score égal, le plus rapide est devant).
- Première place de la famille : un bonhomme traverse l'écran en moonwalk. Record personnel : bandeau « Record personnel ! » et confettis. Les deux peuvent se cumuler.
- Chaque joueur choisit un avatar parmi 36 (animaux, personnages, objets) dans son profil.
- **Classement général** par points (calculé à l'affichage, sans table supplémentaire) : pour chaque jeu (thème × mode), la meilleure partie compte 1 point par bonne réponse en QCM, ×2 en saisie, « Nomme-les tous » et carte « Trouve-le », ×3 sur la carte « Nomme-les tous » ; bonus +10 / +5 / +2 pour les trois premiers de chaque jeu. Barème dans `POINTS_MODE` et `BONUS_PODIUM` (`js/data.js`).
- À l'ouverture de l'app, si un membre de la famille est passé devant toi sur un jeu depuis ta dernière visite, une carte « X t'a battu sur Y » s'affiche, avec un bouton vers ce classement ou « Pas maintenant ».
- Onglet **Infos** dans l'app : barème détaillé et sources des données. Le profil liste les jeux (thème × mode) pas encore joués, avec lancement direct.

## À venir

1. Personnalités : Afrique et Océanie ; objectif 15 / 8 / 3 fiches selon la taille du pays. L'Europe (290), les Amériques (159) et l'Asie (230) sont couvertes, plus les 100 footballeurs les plus connus (77 fiches ajoutées, les autres étant déjà présents ; sources dans l'onglet Infos de l'app).
