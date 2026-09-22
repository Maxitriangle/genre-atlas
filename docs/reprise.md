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

Concrètement : un champ `ga_featured` porte le rang de la tuile, et la forme comme la couleur d'une branche remontent jusqu'à la tuile plutôt que jusqu'à la racine. Metal porte donc ses propres couleurs sans cesser d'être sous Rock, et sa tuile affiche « IN ROCK MUSIC » plutôt que de se déclarer famille. *(Ce dernier point est revenu en v0.5.0 : la tuile affiche « FAMILY » — voir plus bas.)* Le banc de test tient ce point : il trouve un territoire dans les données, vérifie que ses sous-genres affichent toujours la famille dont ils descendent, et que sa couleur diffère de celle de sa racine.

**La construction est globale, et c'est ce qui change le plus.** L'ancien script partait d'une racine et ramassait tout autour ; il ne connaissait qu'une famille, donc des genres limites étaient aspirés dans Electronic faute de mieux. Le nouveau construit l'arbre entier d'un coup puis le découpe, donc chaque genre n'a qu'une seule maison. Conséquence : **Electronic passe de 405 à 363 genres**, 42 partent ailleurs (Italo disco et Hi-NRG vers Pop, brega funk et digital cumbia vers Latin). Ce n'est pas un progrès garanti genre par genre, c'est la même heuristique appliquée à un choix plus large. Le moment était le bon : rien n'était encore curé, donc aucun travail éditorial n'a été perdu.

**Deux pièges rencontrés, à ne pas réapprendre.**
1. `art music` est l'ombrelle (classique occidental, indien, japonais, d'Asie du Sud-Est) et `classical music` est sa branche occidentale, avec 46 sous-genres. Renommer l'ombrelle « Classical music » crée deux genres du même nom, l'un dans l'autre, et WordPress fabrique une adresse en `classical-music-2`. Le libellé Wikidata est gardé.
2. La tuile affichait le nombre de groupes au lieu du nombre de sous-genres pour les familles larges (Rock annonçait 7 au lieu de 50). `parent.grouped` garde le vrai compte avant regroupement.

**Ce qui reste dehors : 481 genres reconnus (23 %)**, faute d'un parent que Wikidata leur donne — 248 isolés, 233 sous 54 racines. Parmi eux funk, ska, gospel, reggaeton, ambient, K-pop, J-pop, Afrobeat, klezmer, raï. `wikidata-build.py` les liste à chaque exécution. C'est la prochaine décision : les déclarer familles, ou leur écrire une table de rattachement sur le modèle de la table des inversions connues.

## Lisibilité de l'anneau et tuiles autonomes (v0.5.0, 22/09/2026)
Deux réglages d'affichage demandés par Maxime, sans changement de données.

**L'anneau passe de 12 à 8 places** (6 à 7 aux niveaux inférieurs, où l'axe horizontal reste pris par la lignée). À 12, deux noms longs côte à côte se chevauchaient. Le cadran tourne donc plus souvent : c'est le prix assumé.

**Une tuile ferme la lignée affichée.** Metal et Punk se présentaient comme « IN ROCK MUSIC » ; ils affichent maintenant « FAMILY ». La décision de la v0.4.0 (tuile et racine sont deux choses distinctes) n'est pas défaite, elle est menée au bout : une tuile quitte aussi l'anneau de son parent. Sans ça on pouvait descendre de Rock vers Metal et voir le fil d'Ariane se réinitialiser à l'arrivée — plus déroutant que le point de départ.

Le parent réel n'est jamais touché : les adresses restent en `/genre/rock-music/metal-music/…`. Les permaliens sont hiérarchiques (`hierarchical => true`, et `url()` les construit sur `realPath`), donc un détachement réel aurait changé l'adresse de Metal, de Punk et de leurs 143 sous-genres. C'est la raison de faire la coupure à l'affichage seulement.

Effet de bord traité : les comptes des tuiles se recouvraient (Rock annonçait 291 genres dont les 61 de Metal et les 80 de Punk). Une tuile sortant de l'anneau de son parent, `count()` ne la compte plus deux fois : Rock affiche 148.

Trois points d'accroche qui se testaient sur « avoir un parent réel » et devaient passer à « être une tuile » : le centrage (`select()`, sinon le permalien d'une tuile ouvrait l'index au lieu de sa carte), le libellé FAMILY du mobile, et la capacité de l'anneau.

Une vérification du banc a dû être assouplie : regrouper et faire tourner le cadran ne s'excluent plus. Classical Music se coupe en 9 groupes alors que l'anneau en tient 7, donc la branche est regroupée *et* au cadran. Ce que le banc tient désormais, c'est que l'anneau ne dépasse jamais 8.

## Suite immédiate
Étape 3 demandée par Maxime : remplacer le tri par époque par un regroupement par genre, avec un maximum de 8 sous-genres à chaque niveau. Mesuré sur les données : **36 nœuds sur 327 dépassent 8 enfants**, et les ramener à 8 demande **149 groupes intermédiaires à nommer**. Le travail est éditorial plus que technique. Le repli quand un groupe n'est pas encore nommé reste à trancher (les décennies sont écartées). `data/wikidata-build.py:199` porte encore les anciens seuils dans sa colonne `display_rule`, non lue par l'extension : à reprendre à ce moment-là, avec une reconstruction du CSV.

## Les décennies remplacées par des groupes éditoriaux (v0.6.0, 22/09/2026)
Les branches larges ne se coupent plus par décennie mais par scène, style ou région. 593 genres répartis sur les **huit** nœuds concernés.

**Le périmètre est plus petit qu'il n'y paraît.** Le regroupement ne se déclenche qu'au-delà de 40 enfants directs : seuls folk (170), Latin (91), electronic dance music (74), pop (62), hip-hop (54), rock (48), house (48) et classical (46) affichaient des décennies. Les 28 autres nœuds larges montrent déjà leurs genres avec le cadran.

**Une hypothèse testée puis abandonnée.** On a d'abord cherché si Wikidata offrait un parent plus précis que « rock music » pour ses 48 enfants, ce qui aurait approfondi l'arbre sans rien inventer. Non : 32 des 48 n'ont qu'un seul parent, et aucun n'a d'alternative située plus bas dans Rock. La platitude vient de Wikidata.

**Aucune source ne donne de taxonomie stylistique.** La « List of rock genres » de Wikipédia est alphabétique, et son propre bandeau de navigation retombe sur les décennies — exactement notre problème. Le découpage stylistique de `build-groups.py` est donc éditorial, et assumé comme tel.

**Ce qui vient des données, en revanche.** 99 à 100 % des enfants de folk et de Latin portent un second parent Wikidata qui nomme une culture ou un lieu (« Polish folk music », « music of Cuba »). Ces deux branches, les plus grosses, sont donc regroupées automatiquement par remontée de ces libellés vers des régions, pas à la main. C'est ce qui rend les 170 genres de folk traitables.

**Trois manières de revenir en arrière**, par ordre de portée :
1. Genres → Settings, décocher « Use the editorial group names » : toute branche large repasse aux décennies, sans rien réimporter et sans perdre les libellés stockés.
2. Genres → Groups : renommer ou vider un groupe à la main, genre par genre.
3. `data/genre-groups.csv` et `build-groups.py` sont versionnés à part ; la chaîne entière tourne sans eux et retombe alors sur les décennies.

**Un défaut latent corrigé au passage.** La reconstruction du CSV n'était pas reproductible : deux genres distincts s'appellent « bolero » sous Latin music et n'ont pas d'année, donc la clé de tri `(année, libellé)` les laissait à égalité et leur ordre retombait sur l'itération d'un ensemble Python. Quatre lignes bougeaient d'une exécution à l'autre. Départage final ajouté sur l'identifiant Wikidata, vérifié identique sur trois graines de hachage.

**Ce qui reste à décider.** Le regroupement n'a qu'un niveau. Les plus gros groupes restants comptent 17 genres (Hispanic America sous folk) et 18 (Brazil et Cuba sous Latin) : lisibles au cadran, mais un second niveau les rendrait meilleurs. C'est la prochaine évolution possible, et elle demande du code, pas des données.
