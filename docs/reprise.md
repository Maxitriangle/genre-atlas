# Reprise — état au 21/09/2026

## Où on s'est arrêté
La **v0.4.0** (les 13 familles, les territoires Metal et Punk) est **commitée et poussée sur la branche `claude/funny-johnson-he2qd2`**. Elle n'est ni fusionnée dans `main`, ni publiée en release, ni importée sur le site de Maxime. Le banc de test passe ses 15 vérifications sur cette branche.

Les quatre étapes qui restent, dans l'ordre, et qui sont toutes du ressort de Maxime :
1. Fusionner la branche dans `main` sur GitHub.
2. Onglet Actions → Release → « Run workflow » (depuis une session Claude le push d'un tag est refusé, 403).
3. Sur le site, Extensions : installer la mise à jour 0.4.0.
4. Genres → Import CSV : déposer `data/genre-import.csv`. **Surtout pas** `genre-electronic-import.csv`, qui remettrait la répartition de la v0.3.0.

La décision suivante, non tranchée : que faire des 481 genres reconnus qui restent hors de l'atlas (funk, ska, gospel, K-pop, Afrobeat…). Les déclarer familles, ou leur écrire une table de rattachement dans `data/wikidata-build.py`. Recommandation : la table de rattachement, une vingtaine de lignes, mais ce sont des choix musicaux.

## Le socle
Avant cette session le site tournait en **v0.2.3**, et la mise à jour automatique depuis les releases GitHub **est validée de bout en bout** : une version publiée apparaît dans Extensions et s'installe en un clic, sans zip.

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

Les deux blocages qui tenaient les autres familles sont levés : la chaîne Wikidata est rejouable, et la question Metal / Punk est tranchée. Les 13 familles sont en place en v0.4.0 (voir ci-dessous).

## Chaîne Wikidata rejouable (21/09/2026)
Les cinq extraits SPARQL que lit `wikidata-build-electronic.py` sont maintenant dans `data/` (`a_labels`, `b_parents`, `c_inception`, `d_country`, `e_mb`, 1,4 Mo), avec `data/wikidata-fetch.sh` qui les régénère. Rejouée de bout en bout, la chaîne ressort un `genre-electronic-import.csv` **identique octet pour octet** au fichier versionné : 406 lignes, 368 parents uniques, 35 arbitrages automatiques, 2 corrigés.

L'accès réseau : `query.wikidata.org` n'est pas dans la politique par défaut des sessions Claude. Maxime l'ouvre dans les réglages de l'environnement → Network access « Custom » → `query.wikidata.org` dans « Allowed domains », **en cochant « Also include default list of common package managers »** sans quoi npm tombe et le banc de test ne s'installe plus.

Trois pièges de l'endpoint Wikidata, tous traités par le script :
1. **Une requête qui dépasse le délai renvoie quand même 200.** Le serveur streame les lignes déjà calculées, puis colle une trace Java Blazegraph à la fin du même corps. Le fichier a l'air valide et la construction casse plus loin sur une ligne à un seul champ. Le script n'accepte donc une réponse qu'après l'avoir relue en CSV avec le bon nombre de colonnes.
2. **502 et 429 sont fréquents** aux heures chargées, `a_labels` en particulier. Cinq tentatives avec des pauses qui doublent.
3. **`wikipedia_links` compte tous les liens Wikimedia**, pas seulement Wikipédia (`wikibase:sitelinks`, pas un `COUNT` sur `wikiGroup "wikipedia"`). Compter Wikipédia seul donne des valeurs plus basses sur 44 genres et ne reproduit plus le fichier d'origine. Cette colonne ne sert que d'ultime critère entre deux parents candidats.

Le script de construction a aussi été rendu déterministe : ses arbitrages passaient par l'itération d'ensembles Python, dont l'ordre change à chaque exécution, donc deux exécutions pouvaient se départager différemment. Départage final sur l'identifiant Wikidata ; vérifié sur trois graines de hachage. Il lit ses extraits à côté de lui et non dans le dossier courant, et écrit son résultat dans `data/` (il visait `/mnt/user-data/outputs/`, un reliquat de l'ancienne session).

## Les 13 familles et les territoires (v0.4.0, 21/09/2026)
L'atlas est passé d'une famille à treize, et de 406 à **1 630 genres**. Fichier d'import : `data/genre-import.csv`, construit par `data/wikidata-build.py`. Le banc de test passe ses 15 vérifications, sans erreur PHP.

**La décision de fond.** Metal et Punk restent des enfants de Rock dans l'arbre et ont quand même leur tuile sur l'accueil. Le code confondait les deux : une famille, c'était un genre sans parent, un point c'est tout. C'est pour ça que la question paraissait insoluble. Elle est désormais séparée en deux, comme l'avaient été le parent réel et le parent d'affichage pour les groupes éditoriaux.

Concrètement : un champ `ga_featured` porte le rang de la tuile, et la forme comme la couleur d'une branche remontent jusqu'à la tuile plutôt que jusqu'à la racine. Metal porte donc ses propres couleurs sans cesser d'être sous Rock, et sa tuile affiche « IN ROCK MUSIC » plutôt que de se déclarer famille. Le banc de test tient ce point : il trouve un territoire dans les données, vérifie que ses sous-genres affichent toujours la famille dont ils descendent, et que sa couleur diffère de celle de sa racine.

**La construction est globale, et c'est ce qui change le plus.** L'ancien script partait d'une racine et ramassait tout autour ; il ne connaissait qu'une famille, donc des genres limites étaient aspirés dans Electronic faute de mieux. Le nouveau construit l'arbre entier d'un coup puis le découpe, donc chaque genre n'a qu'une seule maison. Conséquence : **Electronic passe de 405 à 363 genres**, 42 partent ailleurs (Italo disco et Hi-NRG vers Pop, brega funk et digital cumbia vers Latin). Ce n'est pas un progrès garanti genre par genre, c'est la même heuristique appliquée à un choix plus large. Le moment était le bon : rien n'était encore curé, donc aucun travail éditorial n'a été perdu.

**Deux pièges rencontrés, à ne pas réapprendre.**
1. `art music` est l'ombrelle (classique occidental, indien, japonais, d'Asie du Sud-Est) et `classical music` est sa branche occidentale, avec 46 sous-genres. Renommer l'ombrelle « Classical music » crée deux genres du même nom, l'un dans l'autre, et WordPress fabrique une adresse en `classical-music-2`. Le libellé Wikidata est gardé.
2. La tuile affichait le nombre de groupes au lieu du nombre de sous-genres pour les familles larges (Rock annonçait 7 au lieu de 50). `parent.grouped` garde le vrai compte avant regroupement.

**Ce qui reste dehors : 481 genres reconnus (23 %)**, faute d'un parent que Wikidata leur donne — 248 isolés, 233 sous 54 racines. Parmi eux funk, ska, gospel, reggaeton, ambient, K-pop, J-pop, Afrobeat, klezmer, raï. `wikidata-build.py` les liste à chaque exécution. C'est la prochaine décision : les déclarer familles, ou leur écrire une table de rattachement sur le modèle de la table des inversions connues.
