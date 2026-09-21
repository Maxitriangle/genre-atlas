# Reprise — état au 21/09/2026

Le site de Maxime tourne en **v0.2.3**, et la mise à jour automatique depuis les releases GitHub **est validée de bout en bout** : une version publiée apparaît dans Extensions et s'installe en un clic, sans zip.

## Ce qui a été fait
- Le dépôt a été remis à plat : le dépôt manuel depuis le Finder avait tout placé dans `genre-atlas-depot-complet_1/`, où la fabrication du zip ne trouvait pas `genre-atlas/`.
- `.github/workflows/release.yml` est en place. Le droit « workflows » ne manquait pas.
- Le workflow se lance aussi à la main (onglet Actions → Release → « Run workflow ») : depuis une session Claude, le push d'un tag est refusé par GitHub (403), seules les branches passent. Lancé à la main, le workflow lit la version du plugin, crée le tag et publie.
- v0.2.0 publiée, puis v0.2.1, v0.2.2 et v0.2.3.

## Deux pièges rencontrés, à ne pas réapprendre
1. **Installer le bon fichier.** Sur la page d'une release, `genre-atlas.zip` (section « Assets ») est le bon ; « Source code (zip) » ne s'installe pas. Surtout : un ancien `genre-atlas.zip` traînant dans le dossier Téléchargements se réinstalle sans erreur et sans rien changer — WordPress affiche un succès, la version ne bouge pas. Faire le ménage avant, ou donner à Maxime le lien de téléchargement direct.
2. **Bug corrigé en 0.2.2.** Le bouton « Vérifier à nouveau » restait sans effet : le cache de 6 h était vidé *après* que WordPress avait déjà lu la réponse. Core accroche `wp_update_plugins()` sur `load-update-core.php` en priorité 10 depuis `wp-includes/update.php`, chargé bien avant les extensions. La suppression du cache est passée en priorité 1.

## Point d'attention
Le test sur un WordPress local jetable prévu par `CLAUDE.md` n'a jamais pu être fait : le réseau des sessions Claude bloque `wordpress.org`. Les v0.2.0 à v0.2.3 n'ont été vérifiées que par le lint PHP, la cohérence des versions et le contenu du zip — pas dans un vrai WordPress. À refaire dès qu'une session a le réseau ouvert, **avant** toute version qui touche au code de l'atlas.

## Suite
Les versions 0.2.1 à 0.2.3 ne changent rien au plugin : elles ne servaient qu'à éprouver la chaîne. La prochaine version doit porter du vrai travail (voir `docs/cadrage-mvp.md`, section « Questions ouvertes »).
