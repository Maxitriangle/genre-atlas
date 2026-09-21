# Reprise — état au 21/09/2026

Le site de Maxime tourne avec l'extension v0.1.1, installée par zip, sans mécanisme de mise à jour.
La v0.2.0, qui ajoute la mise à jour automatique depuis les releases GitHub, est **publiée** :
https://github.com/Maxitriangle/genre-atlas/releases/tag/v0.2.0

## Fait
- Le dépôt a été remis à plat : le dépôt manuel avait tout placé dans `genre-atlas-depot-complet_1/`, où la fabrication du zip ne trouvait pas `genre-atlas/`. Tout est de nouveau à la racine.
- `.github/workflows/release.yml` est en place (le fichier a bien été accepté, le droit « workflows » ne manquait pas).
- Le workflow accepte aussi un lancement à la main (onglet Actions → Release → « Run workflow ») : le push d'un tag a été refusé par GitHub (403) depuis la session Claude, qui ne peut pousser que des branches. Lancé à la main, le workflow reprend la version écrite dans le plugin, crée le tag et publie la release.
- Release v0.2.0 vérifiée : elle porte bien un fichier joint nommé `genre-atlas.zip`, qui contient le dossier `genre-atlas/` attendu par `includes/updater.php`.

Non fait, faute de réseau dans la session : le test sur un WordPress local jetable (`wordpress.org` est bloqué). Seuls le lint PHP, la correspondance version/tag et le contenu du zip ont été vérifiés.

## À faire, dans l'ordre
1. Faire installer à Maxime la v0.2.0 une dernière fois par zip : Extensions → Ajouter une extension → Téléverser → « Remplacer l'actuelle par la version téléversée ». Le zip est le fichier joint de la release ci-dessus.
2. Valider la chaîne : publier une v0.2.1 minime (monter `Version` et `GENRE_ATLAS_VERSION` dans `genre-atlas/genre-atlas.php` et `Stable tag` dans `readme.txt`, commit, puis lancer le workflow) et vérifier avec lui qu'elle apparaît dans Extensions. Lui proposer d'activer les mises à jour automatiques de l'extension.
3. Avant cette v0.2.1, refaire le test sur WordPress local prévu par `CLAUDE.md` s'il est possible (réseau ouvert vers `wordpress.org`).
