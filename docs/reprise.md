# Reprise — état au 22/09/2026 au soir

**La v0.7.3 est publiée.** Maxime a le CSV courant importé ; il lui restait à passer l'extension en 0.7.3 quand la session s'est arrêtée. **Première chose à vérifier avec lui** : la version affichée dans Extensions, et si l'avertissement jaune des écrans Genres a disparu. S'il est encore là, il nomme les genres en cause — c'est le point de départ du diagnostic.

La mise à jour automatique depuis les releases GitHub est validée de bout en bout : une version publiée apparaît dans Extensions et s'installe en un clic, sans zip.

## Lire d'abord
Ce fichier est chronologique : les sections les plus récentes sont **en bas**, et elles annulent parfois une décision plus haut. Les six dernières (v0.5.0 à v0.7.3) sont celles qui décrivent le site actuel.

## Où on en est
- **1 630 genres, 15 tuiles, 13 familles.** Metal et Punk ont leur tuile sans cesser d'être sous Rock.
- **Plus aucun cadran, plus aucune date.** Au-delà de 8 sous-genres la carte montre des groupes éditoriaux, jamais des flèches ni des décennies. 1 020 genres portent un groupe, sous forme de chemin (« EUROPE > IBERIA > SPAIN »).
- **`tools/check-widths.py` est le garde-fou.** Il rejoue l'algorithme de la carte sur l'arbre entier, sort en erreur si un nœud dépasse l'anneau ou si un chemin manque, et le banc de test l'exécute avant le navigateur. Attention : il lit le **CSV du dépôt**, pas le site de Maxime. Un site qui a connu plusieurs versions du fichier peut donc être dans un état que ce script déclare sain — c'est exactement ce qui est arrivé en 0.7.3.
- **L'avertissement de l'admin, lui, lit le site.** Écrans Genres, en jaune : il nomme les genres sans groupe sous une branche large, avec un lien vers chacun. C'est le seul outil qui voit l'état réel de son installation.

## Ce qui attend, par ordre de maturité
1. **Contester les regroupements.** Les deux premiers sont traités (voir « Rock et Latin » en bas). Les autres restent ouverts à la contestation : modifier `data/build-groups.py`, rejouer `build-groups.py` puis `wikidata-build.py`, renvoyer le CSV. Aucune republication de l'extension nécessaire.
2. **Les 481 genres restés dehors (23 %)**, faute de parent chez Wikidata — funk, ska, gospel, reggaeton, ambient, K-pop, J-pop, Afrobeat, klezmer, raï. **Décidé le 23/09 : les rattacher** à un genre existant par une table, les 13 familles restent 13. Fait : `data/genre-attach.csv` (voir la dernière section). **En attente de la relecture de Maxime** avant qu'il importe.
3. **BPM et descriptions**, jamais commencés : `bpm_min`/`bpm_max` sont vides sur les 1 630 lignes. **Décidé le 23/09 : après les points 1 et 2**, pour ne rien écrire sur des genres qui vont changer de place.
4. **Six genres résiduels sur le site de Maxime**, hérités de la v0.3.0 et absents du fichier actuel : `space ambient`, `tribal ambient`, `maloya électronique` (sous Electronic Music), `mega funk`, `J-euro`, `dungeon chip`. **Décidé le 23/09 : Maxime les supprime** à la main (corbeille). Les deux ambient reviendront proprement si ambient est rattaché (point 2).
5. **Un défaut cosmétique connu** : le titre du panneau coupe au milieu d'un mot sur les noms longs (« ALTERNATIV / E ROCK »). Défaut CSS antérieur à ces sessions, jamais corrigé.

## Ce qu'il ne faut pas réapprendre
- Le dépôt est **privé** : les liens de téléchargement direct vers un fichier du dépôt ne fonctionnent pas pour Maxime. Lui envoyer le fichier directement.
- Après une modification des groupes, **deux étapes chez lui** : mettre à jour l'extension *et* réimporter le CSV. La première seule ne change rien, les libellés vivent dans les données.
- Le dossier de captures du banc de test est **reconstruit à chaque exécution** : une capture ad hoc est perdue au passage suivant.
- Un serveur PHP lancé dans un appel Bash **ne survit pas** à la fin de cet appel, et un serveur lancé en tâche de fond n'est pas joignable par le navigateur Playwright (contexte réseau séparé). Serveur et navigateur doivent tourner dans le même appel, comme le fait `test-local.sh`.
- `pkill -f "php -S …"` **tue le shell appelant**, dont la ligne de commande contient le motif.
- **Un import ne touche qu'aux lignes présentes dans le fichier.** Un genre supprimé d'une version du CSV reste sur le site avec son ancien parent et ses anciennes métadonnées, et aucun réimport ne le rattrape. En cas de comportement inexplicable, comparer les identifiants Wikidata du site avec ceux du CSV courant.
- **Un compteur sans les noms ne sert à rien.** Le premier avertissement disait « 3 genres have no group » sans les nommer : un aller-retour perdu. Tout diagnostic destiné à Maxime doit nommer les objets en cause et donner un lien vers chacun.

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

**Le second niveau a été envisagé puis écarté, au profit d'un premier niveau plus fin.** Les plus gros groupes comptaient 17 genres (Hispanic America sous folk) et 18 (Brazil, Cuba sous Latin). Mesure faite, le signal régional est épuisé à ce stade : « music of Cuba » est l'unique libellé des 18 genres cubains, et « music of Brazil » couvre 17 des 18 brésiliens. Rien ne peut donc être déduit en dessous.

En revanche ces groupes se coupent très bien par famille musicale — Cuba en son / rumba / danzón, Brazil en samba-bossa / Nordeste / pop moderne — et cette coupe tient **au même niveau**. Même lisibilité, un clic de moins, et aucun code nouveau. Folk passe à 24 groupes (le plus gros : 13, contre 17), Latin à 14 (le plus gros : 10, contre 18). Table `OVERRIDES` dans `build-groups.py`, appliquée après la remontée régionale.

Deux corrections au passage : `Philippine rondalla` était rangé dans Hispanic America par la remontée et part en Asie du Sud-Est ; `murga` et `New Mexico music` formaient chacun un groupe d'un seul membre et rejoignent Dance & Carnival et Mexico & Central America.

Le regroupement imbriqué reste possible si le besoin revient. Il demanderait de faire récurser `regroup()` dans `atlas.js` — par exemple sur un séparateur dans `ga_group` (« CUBA > SON ») — et du travail éditorial pour inventer le niveau que les données ne donnent pas.

## Le cadran supprimé (v0.7.0, 22/09/2026)
Maxime signalait encore « la navigation par décennie avec des flèches » sur Rock et sur Electronic Music. Deux causes différentes :
- **Rock** : ses 9 groupes dépassaient les 8 places de l'anneau, donc le cadran revenait par-dessus le regroupement.
- **Electronic Music** : 23 enfants, sous l'ancien seuil de 40, donc aucun groupe — la carte paginait les genres triés par époque, et la légende du cadran affichait les années. D'où la lecture « par décennie ».

**La solution tient en deux changements.** Le seuil de regroupement passe de 40 à **8**, et le libellé de groupe devient un **chemin** (`EUROPE > IBERIA`) que `cut()` coupe segment par segment, récursivement. Une branche aussi large que folk se réduit donc à 6 continents, puis à des régions, sans jamais dépasser 8 nœuds.

**Le périmètre.** 36 nœuds dépassent 8 enfants. 8 étaient déjà traités en 0.6.0 ; les 28 autres représentaient 395 genres. Total : **1 020 genres portent un groupe**, contre 593 en 0.6.0.

**Le signal automatique n'existait pas pour ces 28.** Contrairement à folk et Latin (99 % de seconds parents Wikidata exploitables), leur valeur dominante est « aucun second parent ». Ces découpages — metal, jazz, blues, techno, punk, soul… — sont donc entièrement éditoriaux. Ce sont des familles qu'un connaisseur reconnaîtra, mais aucune source ne les valide.

**La capacité en profondeur passe de 7 à 8.** Elle avait été fixée à 7 par prudence en 0.5.0. Quatre nœuds ont exactement 8 enfants (metalcore, Hindustani classical music, maqāmic music, Gamelan Bali) : sous le seuil de regroupement, mais un de trop pour 7 places. Le code répartit déjà les nœuds sur deux arcs de 130° et les décale en rayon au-delà de six, donc 8 tient sans chevauchement.

**`tools/check-widths.py` est la vraie preuve.** Il rejoue l'algorithme de `cut()` sur l'arbre entier et liste tout nœud que la carte devrait encore mettre au cadran. Le banc de test l'exécute avant d'ouvrir le navigateur, qui ne parcourt qu'une poignée d'écrans. Il sort aujourd'hui « aucun nœud au-dessus de la capacité de l'anneau ».

**Réserve assumée.** Regrouper un nœud de 9 enfants en 2 groupes de 4 ou 5 ajoute un clic et un libellé inventé pour peu de gain. C'était le prix à payer pour supprimer les flèches partout, ce que Maxime a demandé deux fois. Le seuil `GROUP_LIMIT` dans `atlas.js` se remonte en une ligne si l'usage donne tort.

## Plus aucune date, nulle part (v0.7.1, 22/09/2026)
Maxime tombe sur « THE ISLANDS » découpé en « 1850S » et « UNDATED ». Le repli par décennie était toujours là, et il se déclenchait partout où un groupe dépassait 8 membres sans troisième segment de chemin.

**Trois corrections, dans cet ordre d'importance.**

1. **Le repli n'est plus la décennie mais l'ordre alphabétique** (`alphaBuckets` dans `atlas.js`). C'est le garde-fou : même si un chemin éditorial manque à l'avenir, une date ne peut plus réapparaître. `decade()` est supprimée du code.
2. **18 groupes ont reçu un troisième segment** (table `DEEP` dans `build-groups.py`), pour que le repli ne serve jamais. `THE ISLANDS` se coupe en Haïti / Porto Rico et Hispaniola, `KEYBOARD FORMS` en contrepoint / pièces de caractère, etc.
3. **Le tri par époque est remplacé par l'ordre alphabétique** (`byName`), et le libellé « SUBGENRES — BY EPOCH » devient « SUBGENRES — A TO Z ». C'était une demande de la première conversation, restée non traitée : trier par année est encore une classification par date. L'année reste affichée comme métadonnée sous un nœud, ce qui est autre chose.

**Un trou dans la vérification, corrigé.** `tools/check-widths.py` annonçait « aucun cadran » alors que trois groupes (SOUTH ASIA, SOUTHEAST ASIA, KEYBOARD FORMS) montraient bien 10 nœuds. Il ne contrôlait que la largeur, ignorait la valeur de retour de ses appels récursifs, et ne disait rien quand le repli ne produisait qu'un seul groupe. Il signale désormais les deux choses : un nœud trop large, et un nœud que le chemin éditorial ne sait pas couper. Il sort en erreur, donc le banc de test s'arrête.

## L'extension à jour avec un CSV périmé (v0.7.2, 22/09/2026)
Maxime voit des groupes nommés « S–W » sous Electronic Music. Diagnostic : **extension en 0.7.1, fichier de données en 0.6.0**. Les libellés de groupe vivent dans les données ; sans eux le front retombe sur le repli alphabétique ajouté la veille. Rejoué sur le CSV de la 0.6.0, l'algorithme produit 46 nœuds coupés alphabétiquement, dont Electronic Music en `A–E | E–M | M–W`.

Le vrai défaut n'est pas là : **rien ne signalait cet état**. L'atlas se dégradait silencieusement.

**Ce que la 0.7.2 ajoute.** Un avertissement sur les écrans Genres dès qu'un genre situé sous une branche de plus de 8 sous-genres n'a pas de groupe, avec la marche à suivre. Vérifié dans les deux sens sur le site de test : 0 avec les données complètes, 23 après avoir vidé les groupes d'Electronic Music.

**Trois seuils restés à 40 côté admin, corrigés au passage.** L'écran Genres → Groups ne listait que les branches de plus de 40 sous-genres : Maxime ne pouvait donc éditer que 8 des 36 branches concernées. La colonne de la liste affichait encore « (dial) » de 9 à 40. Et le compteur de groupes suivait l'ancien repli par décennie plutôt que le premier segment du chemin.

**Un piège de comptage à ne pas réapprendre.** Une tuile quitte l'anneau de son parent, donc elle n'a pas besoin de groupe : Metal et Punk n'en ont pas. Le premier jet de l'avertissement les comptait et criait au loup sur des données parfaites. Les trois requêtes partagent désormais `genre_atlas_on_ring_sql()`, qui exclut les tuiles. La règle : **tout comptage d'enfants côté admin doit exclure les tuiles**, comme le fait la carte.

L'écran Groups triait encore par époque et listait les tuiles ; il est passé à l'ordre alphabétique, sur les seuls enfants de l'anneau.

## Trois résidus d'un ancien import cassaient toute une branche (v0.7.3, 22/09/2026)
Maxime réimporte le CSV et voit encore des libellés alphabétiques, avec l'avertissement « 3 genres have no group ».

**Les trois genres.** `space ambient`, `tribal ambient` et `maloya électronique`, enfants directs d'Electronic Music. Ils viennent du fichier `genre-electronic-import.csv` de la v0.3.0 et **ne sont plus dans le fichier actuel** : six genres de cet ancien fichier ont disparu quand la chaîne est passée en construction globale (v0.4.0), parce que leur parent choisi est sorti de l'atlas — `ambient music` fait partie des 481 laissés dehors. Un import ne peut donc pas les atteindre : l'importeur ne touche qu'aux lignes présentes dans le fichier.

Les trois autres (`mega funk`, `J-euro`, `dungeon chip`) sont sous des parents étroits et ne déclenchaient rien.

**Le vrai défaut était dans `cut()`.** Il exigeait que *tous* les enfants aient un segment de chemin, sinon toute la branche basculait en alphabétique. Trois résidus suffisaient donc à annuler le regroupement des 23 autres. Désormais un genre sans groupe **reste à côté des groupes** : Electronic Music affiche 4 groupes + 3 genres isolés = 7 nœuds. Le repli alphabétique ne sert que si le total dépasse encore l'anneau. Vérifié sur un CSV reconstituant exactement cette situation.

**L'avertissement nomme maintenant les genres**, avec un lien d'édition et leur parent. Un compteur seul ne permettait pas d'agir — c'est ce qui a fait perdre un aller-retour.

**À retenir.** Un site qui a connu plusieurs versions du fichier d'import peut contenir des genres qu'aucun import ne met plus à jour. Ils restent avec leur ancien parent et leurs anciennes métadonnées. Si un comportement inexplicable apparaît, comparer les identifiants Wikidata du site avec ceux du CSV courant.

## Rock et Latin regroupés autrement (23/09/2026, données seules)
Premières contestations de Maxime, toutes deux dans `build-groups.py`. Aucune nouvelle version de l'extension : il suffit de réimporter `genre-import.csv`.

**Rock.** « POP, NEW WAVE & ALTERNATIVE » est coupé en « POP ROCK » (pop rock, comedy rock, Christian rock) et « NEW WAVE & ALTERNATIVE » (new wave, alternative rock). Pour rester à 8 groupes, « PSYCHEDELIC & EXPERIMENTAL » (ex-« PSYCHEDELIC & ART ROCK ») et « PROGRESSIVE & THEATRICAL » passent sous un même premier niveau, « ART & PROGRESSIVE ROCK ».

**Latin.** « ACROSS LATIN AMERICA » disparaît : chacun de ses 7 genres rejoint son pays. Dembow → Puerto Rico, Hispaniola & the Coast ; bolero (cubain) → Danzón & Ballroom ; guarania et avanzada → Southern Cone (Paraguay) ; onda nueva → « COLOMBIA & VENEZUELA » (ex-« COLOMBIA ») ; tamborera (Panama) et tropicanibalismo (Mexique, pays de rattachement à confirmer) → Mexico & Central America. Ce dernier montant à 9, il reçoit un troisième segment : MEXICO / CENTRAL AMERICA.

**Piège : deux genres s'appellent « bolero » sous Latin** (cubain Q15830404, espagnol Q489913). Les listes d'`OVERRIDES` acceptent désormais un identifiant Wikidata à la place d'un nom, pour viser l'un sans l'autre.

**Tranché ensuite.** « ROCK AND ROLL ERA » portait un libellé d'époque : renommé « ROCK AND ROLL & GARAGE » avec l'accord de Maxime.

Le banc de test passe ses 16 vérifications, `check-widths.py` ne signale rien.

## Les 481 genres dehors rattachés à la main (23/09/2026, données seules)
Décision de Maxime : pas de nouvelle famille, un parent existant pour chacun. L'atlas passe de **1 630 à 2 098 genres**, et 1 327 portent un groupe (40 branches larges).

**Le tableau.** `data/genre-attach.csv`, une ligne par genre, 330 lignes : 292 `attach`, 25 `regroup` (des genres déjà présents qui changent de groupe pour faire de la place), 13 `leave out`. La colonne `reason` est en français, pour la relecture. Rattacher une racine fait entrer sa descendance, donc 302 racines suffisent pour 468 genres. `wikidata-build.py` lit le parent, `build-groups.py` lit le groupe, et le groupe du tableau l'emporte sur tout le reste. Chaîne : `wikidata-build.py`, `build-groups.py`, puis `wikidata-build.py` à nouveau.

**Où c'est allé, en gros.**
- Pop : un 8ᵉ groupe « AFRICAN POP » (Afrique de l'Ouest, centrale, de l'Est, australe, océan Indien, découpés par pays). « POP AROUND THE WORLD » est refait : Moyen-Orient et Maghreb, Asie du Sud, Asie du Sud-Est, Russie et Asie centrale. « EAST ASIAN POP » se coupe en Japon, Corée, pop sinophone.
- Folk : genres traditionnels ; nouveaux sous-groupes NORDIC COUNTRIES, CENTRAL ASIA & THE CAUCASUS, THE MALAY WORLD, LOUISIANA, EAST AFRICA & THE HORN, et Océanie en trois.
- Art music : trois nouveaux groupes, SACRED TRADITIONS (chrétienne, juive, islamique et soufie, hindoue-bouddhiste-taoïste), STAGE & CABARET, BANDS & MARCHES.
- Latin : les Caraïbes non hispaniques (zouk, soca, calypso, Suriname…) sous « THE WIDER CARIBBEAN » (ex-« THE ISLANDS »), reggaeton avec Porto Rico, funk brésilien sous Brazil.
- Reggae (ska, rocksteady, mento, dub), R&B (funk, gospel), électronique (ambient, vaporwave), jazz (ragtime, easy listening, acid jazz).

**Choix discutables, signalés à Maxime.** Les Caraïbes anglophones et francophones rangées sous Latin ; le théâtre musical et les fanfares sous Art music ; les regroupements du funk brésilien (connaissance limitée) ; `puxa` sans pays chez Wikidata.

**Un piège de script.** `wikidata-build.py` écrit dans `sys.argv[1]` s'il existe. Exécuté par `runpy` depuis un autre script, il écrase le premier argument de ce script. Remettre `sys.argv = ['x']` avant.

Le banc de test passe ses 16 vérifications, `check-widths.py` ne signale rien.
