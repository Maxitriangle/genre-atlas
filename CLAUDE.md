# Genre Atlas — instructions pour Claude

Projet personnel et non commercial de Maxime : un atlas des genres musicaux (site en anglais), sur WordPress, design inspiré du pack « Micrographics » (fond quasi noir, monospace capitales, glyphes géométriques générés à partir des données). Toutes les décisions sont dans `docs/cadrage-mvp.md` : le lire avant toute évolution.

## Comment travailler avec Maxime
- Il est novice sur GitHub et n'écrit pas de code : étapes courtes, une chose à la fois.
- Quand il y a un choix à faire, poser des questions simples avec une recommandation.
- Ne jamais lui demander de mot de passe ni de jeton dans la conversation.
- Répondre en français. Le site, le code et les libellés de l'interface restent en anglais.

## Le dépôt
- `genre-atlas/` : l'extension WordPress. PHP sans dépendance, JavaScript sans dépendance (`assets/atlas.js`), police embarquée.
- `data/` : chaîne Wikidata rejouable — `wikidata-fetch.sh` récupère les cinq extraits SPARQL, `wikidata-build.py` en construit `genre-import.csv` (13 familles, 15 tuiles, 2 098 genres, dont 292 rattachés à la main par `genre-attach.csv`). `build-groups.py` écrit `genre-groups.csv`, le découpage éditorial des 40 branches de plus de 8 sous-genres (1 327 genres, colonne `group` du fichier d'import, sous forme de chemin « EUROPE > IBERIA > SPAIN »). Voir `data/README.md`.
- `docs/` : cadrage, note de reprise.
- `tools/` : banc de test local — `test-local.sh` monte le site, `check-widths.py` vérifie la largeur de l'arbre entier hors navigateur, `smoke.mjs` le parcourt au navigateur.

## Publier une version
1. Tester avant de publier : `tools/test-local.sh` monte un WordPress jetable, y installe l'extension, importe les 2 098 genres, vérifie la largeur de l'arbre entier avec `check-widths.py`, puis parcourt l'index, la carte, le regroupement, la fiche d'un genre (`/about/`), la liste, la vue mobile et l'écran d'import dans un vrai navigateur. Le script sort en erreur si une vérification échoue ou si l'extension écrit dans le journal PHP, et dépose une capture par écran dans son cache. `wordpress.org` n'est pas joignable depuis ces sessions : WordPress et le pilote SQLite sont récupérés par git depuis GitHub, et WP-CLI n'est pas disponible (le script appelle l'importeur directement).
2. Monter `Version` et `GENRE_ATLAS_VERSION` dans `genre-atlas/genre-atlas.php`, et `Stable tag` dans `readme.txt`.
3. Commit sur `main`, puis tag `vX.Y.Z`. Le workflow `.github/workflows/release.yml` fabrique `genre-atlas.zip` et publie la release. Le workflow se lance aussi à la main depuis l'onglet Actions (« Run workflow ») : il reprend alors la version écrite dans le plugin et crée le tag lui-même — c'est la voie à suivre quand le tag ne peut pas être poussé.
4. Le site de Maxime (o2switch) lit la dernière release via `includes/updater.php` et propose la mise à jour dans Extensions. L'updater attend un fichier joint nommé exactement `genre-atlas.zip` contenant le dossier `genre-atlas/`.

## Règles de design à respecter
Arbre strict (un parent par genre), influences non affichées. Avoir une tuile sur l'accueil et n'avoir pas de parent sont deux choses distinctes : Metal et Punk sont des enfants de Rock et ont leur tuile (champ `ga_featured`). Une tuile ferme la lignée affichée : forme, couleur, fil d'Ariane et lignée de la carte remontent jusqu'à la tuile et s'y arrêtent, donc Metal se présente comme une famille sans cesser d'être sous Rock dans les données et dans son adresse. Carte : recentrage au clic, deux niveaux visibles au plus, lignée à gauche. Sous-genres et groupes triés par ordre alphabétique — aucun tri ni aucun libellé par date nulle part ; l'année reste affichée comme métadonnée sous un nœud, ce qui est autre chose. Largeur : anneau fixe jusqu'à 8 enfants partout (6 seulement quand un enfant est ouvert, l'axe horizontal servant à la lignée), regroupement éditorial au-delà de 8 — par scène, style ou région, **jamais par date, nulle part**. Le groupe est un chemin (« EUROPE > IBERIA ») coupé segment par segment. Un genre sans groupe reste à côté des groupes plutôt que dedans, donc quelques résidus d'un ancien import n'empêchent pas une branche d'être regroupée ; le repli alphabétique ne sert que si le compte total dépasse encore l'anneau. `tools/check-widths.py` le vérifie sur l'arbre entier et le banc de test l'exécute. Jamais plus de 8 nœuds à la fois autour du centre : c'est ce qui empêche les libellés de se chevaucher. Mobile (< 900 px) : un seul arbre vertical. Le nom du genre est toujours lisible ; les micro-textes portent de vraies métadonnées.
