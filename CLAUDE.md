# Genre Atlas — instructions pour Claude

Projet personnel et non commercial de Maxime : un atlas des genres musicaux (site en anglais), sur WordPress, design inspiré du pack « Micrographics » (fond quasi noir, monospace capitales, glyphes géométriques générés à partir des données). Toutes les décisions sont dans `docs/cadrage-mvp.md` : le lire avant toute évolution.

## Comment travailler avec Maxime
- Il est novice sur GitHub et n'écrit pas de code : étapes courtes, une chose à la fois.
- Quand il y a un choix à faire, poser des questions simples avec une recommandation.
- Ne jamais lui demander de mot de passe ni de jeton dans la conversation.
- Répondre en français. Le site, le code et les libellés de l'interface restent en anglais.

## Le dépôt
- `genre-atlas/` : l'extension WordPress. PHP sans dépendance, JavaScript sans dépendance (`assets/atlas.js`), police embarquée.
- `data/` : script Wikidata et fichier d'import de la famille Electronic (406 genres).
- `docs/` : cadrage, note de reprise.

## Publier une version
1. Tester sur un WordPress local jetable avant de publier (WP-CLI + extension « SQLite Database Integration » + serveur PHP intégré ; piloter le navigateur avec Playwright pour vérifier l'index, la carte, le cadran, la liste, la vue mobile et l'écran d'import).
2. Monter `Version` et `GENRE_ATLAS_VERSION` dans `genre-atlas/genre-atlas.php`, et `Stable tag` dans `readme.txt`.
3. Commit sur `main`, puis tag `vX.Y.Z`. Le workflow `.github/workflows/release.yml` fabrique `genre-atlas.zip` et publie la release. Le workflow se lance aussi à la main depuis l'onglet Actions (« Run workflow ») : il reprend alors la version écrite dans le plugin et crée le tag lui-même — c'est la voie à suivre quand le tag ne peut pas être poussé.
4. Le site de Maxime (o2switch) lit la dernière release via `includes/updater.php` et propose la mise à jour dans Extensions. L'updater attend un fichier joint nommé exactement `genre-atlas.zip` contenant le dossier `genre-atlas/`.

## Règles de design à respecter
Arbre strict (un parent par genre), influences non affichées. Carte : recentrage au clic, deux niveaux visibles au plus, lignée à gauche. Largeur : anneau fixe jusqu'à 12 enfants (9 à 10 sous une famille), cadran rotatif trié par époque jusqu'à 40, regroupement éditorial au-delà. Mobile (< 900 px) : un seul arbre vertical. Le nom du genre est toujours lisible ; les micro-textes portent de vraies métadonnées.
