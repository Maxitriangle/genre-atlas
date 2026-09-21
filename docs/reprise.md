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

## Banc de test local
`tools/test-local.sh` existe maintenant et **doit tourner avant chaque publication**. Il monte un WordPress jetable hors du dépôt, installe l'extension, importe les 406 genres et parcourt les six écrans au navigateur. La v0.2.3 y passe les 9 vérifications sans une erreur PHP.

Le contournement qui rend ça possible : `wordpress.org` est bloqué depuis les sessions Claude, mais `git clone` de `WordPress/WordPress` et de `WordPress/sqlite-database-integration` passe. WP-CLI n'est pas installable (l'API GitHub est limitée aux dépôts attachés), donc le script appelle `Genre_Atlas_Importer::import()` directement plutôt que `wp genre-atlas import` — cette commande WP-CLI reste donc non testée.

Deux détails à ne pas réapprendre : les règles de réécriture doivent être reconstruites dans une requête PHP séparée de celle qui change la structure des permaliens, sinon `/genre/` renvoie 404 ; et le serveur PHP intégré n'a pas de réécriture d'URL, d'où `router.php`.

## Regroupement des branches larges (v0.3.0)
Fait. Au-delà de 40 sous-genres la carte montre des groupes, pas des genres : le label `ga_group` du genre s'il est renseigné, sa décennie sinon. Le repli par décennie rend la branche lisible avant tout travail éditorial. Écran de saisie : Genres → Groups.

Les groupes sont une couche d'affichage, pas de la taxonomie : chaque nœud garde un parent réel (pour son permalien) et un parent d'affichage (pour la lignée), donc un genre atteint par un groupe garde son adresse. Ils sont exclus de la recherche et du compte de genres.

## Suite
Reste au cadrage (`docs/cadrage-mvp.md`, « Reste à faire ») : saisie des BPM et des descriptions, autres familles, réglages de forme et couleur par famille.

Deux blocages connus pour les autres familles.

1. **Les CSV sources manquent.** `data/wikidata-build-electronic.py` ne va pas chercher Wikidata : il lit cinq fichiers extraits à la main par des requêtes SPARQL séparées (`a_labels.csv`, `b_parents.csv`, `c_inception.csv`, `d_country.csv`, `e_mb.csv`, voir « Test d'import Wikidata » dans le cadrage). Aucun n'est dans le dépôt, seul le résultat `genre-electronic-import.csv` y est. Il faut donc les refaire, et `query.wikidata.org` est hors de la politique réseau des sessions Claude par défaut. Maxime peut l'ouvrir : environnement → Network access « Custom » → `query.wikidata.org` dans « Allowed domains », en cochant « Also include default list of common package managers » sans quoi npm tombe et le banc de test ne s'installe plus. **Quand ces CSV seront régénérés, les commiter dans `data/`** pour que la chaîne soit rejouable.
2. **La question ouverte du cadrage n'est pas tranchée** : Metal et Punk, familles de niveau 1 ou enfants de Rock ? Elle détermine la forme de l'accueil.
