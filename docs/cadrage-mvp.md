# Genre — cadrage MVP (mis à jour le 21/09/2026)

## Décisions validées par Maxime
- **Filiation** : arbre strict, un seul parent par genre, profondeur illimitée (sous-genres de sous-genres). Les influences sont **retirées de l'interface** (carte, liste, panneau, glyphe) car elles compliquent la lecture. Le champ reste stocké dans WordPress, non affiché.
- **Navigation mind map** : recentrage au clic. Une seule branche ouverte par niveau ; on ne voit jamais plus de deux niveaux à la fois (anneau des enfants + arc de l'enfant ouvert), plus la lignée des ancêtres à gauche et le fil d'Ariane. Un clic ouvre un nœud, un second clic (ou « CENTRE ON ») le place au centre.
- **Débordement de l'arc** (aperçu du niveau suivant) : plafonné à 8 nœuds triés par époque, puis nœud « +N ».
- **Largeur de l'anneau central — règle unique** : jusqu'à 8 enfants, anneau fixe ; **au-delà de 8, regroupement éditorial**, jamais de cadran. Le groupe est un chemin (« EUROPE > IBERIA ») et la carte le coupe segment par segment, donc une branche aussi large que folk (170 sous-genres) se réduit à des continents, puis à des régions. Mobile non concerné (colonne défilante).
  - Révisé en 0.7.0 : le cadran rotatif est supprimé. Il paginait des genres triés par époque, ce qui se lisait comme une navigation par décennie. `tools/check-widths.py` vérifie sur l'arbre entier qu'aucun nœud ne dépasse la capacité de l'anneau.
  - Révisé en 0.5.0 : la règle était de 12 positions. À 12, les libellés se chevauchaient dès que deux noms longs tombaient côte à côte. 8 est le nombre qui tient sans chevauchement à toutes les profondeurs.
- **Données** : import initial Wikidata / MusicBrainz, puis curation éditoriale dans WordPress. Les regroupements intermédiaires (par scène, par décennie) pour réduire la largeur sont un choix éditorial manuel.
- **Icônes** : glyphes générés à partir des données du genre (aucun dessin à la main), une couleur par grande famille.
- **MVP** : accueil avec toutes les familles + une seule famille creusée en profondeur (Electronic retenue pour les maquettes).
- Site et genres en anglais. Projet perso, non commercial. Back-office WordPress.

## Direction design
Référence : pack « Micrographics Vol.1 » (fond quasi noir, monospace capitales, formes géométriques au trait, micro-textes techniques). S'en inspirer, ne pas réutiliser les éléments du pack sans vérifier la licence.
- Fond #121016, texte #E4DFF5, secondaire #9A94B5, typo Azeret Mono.
- Couleurs de famille : OKLCH L=0.80 C=0.105, teintes réparties sur 16 familles (Electronic = lavande #C2B0FB).
- Règle de lisibilité : le nom du genre est toujours grand ; les micro-textes portent de vraies métadonnées (origin, epoch, BPM, sub) et restent secondaires.

## Grammaire des glyphes (rev. 02)
- A · Frame : forme + couleur = famille (cercle Electronic, hexagone Rock, hexagone double Metal, etc.).
- B · Spokes : tempo, un rayon par 20 BPM.
- C · Rings : profondeur, un anneau par niveau sous la famille.
- D · Orbit nodes : sous-genres directs (max 8).
- E · Outer arc : époque, balayage horaire 1850 → aujourd'hui (pointillé = traditionnel).
- (Les encoches d'influences de la rev. 01 sont supprimées.)

## Modèle de données WordPress (proposé)
Custom post type `genre`. Champs : `parent` (relation 1), `family`, `origin_place`, `epoch_year`, `bpm_min`, `bpm_max`, `description`, `wikidata_id`, `musicbrainz_id`, `status` (imported / curated), `influenced_by` (relation n, stocké mais non affiché). Avec un arbre strict, une taxonomie hiérarchique WP redevient techniquement possible, mais le CPT reste préférable pour les champs riches et les futurs liens (artistes). Front mind map + liste alimenté par l'API REST. Futur : CPT `artist`, favoris utilisateurs, playlists, connexion streaming.

## Maquettes
Canvas Design « Genre — MVP screens » : https://claude.ai/artifact/NXfTYZ3p7hXKSajPCqigJa
6 écrans : Index (16 familles) ; Map Electronic avec House ouvert (17 sous-genres → 8 + « +09 ») ; Map recentrée sur Breakbeat ; Map recentrée sur Jungle (Drum & Bass ouvert, niveau 04) ; List (arbre à 4 niveaux) ; Glyph legend. Données de démo : 64 genres électroniques saisis à la main, à remplacer par l'import.

## Mobile (proposition, maquettée le 21/09/2026)
La carte radiale est réservée aux tablettes et ordinateurs. Sur mobile, une seule vue (pas de bascule map/list) : arbre vertical avec glyphes. Lignée des ancêtres en haut, genre centré en bloc, enfants en colonne triés par époque, dépliage sur place, bouton « CENTRE ON », fiche détail en feuille montant du bas. Pas de plafond « +N » (défilement vertical). Une seule ligne de micro-texte par genre (origine · époque). Écrans 07 à 09 du canvas.

## Familles et territoires (tranché le 21/09/2026)
Metal et Punk sont **des enfants de Rock dans l'arbre, et des tuiles sur l'accueil**. C'étaient deux questions traitées comme une seule : de quoi un genre descend-il, et par où entre-t-on dans l'atlas ? La filiation Rock → Metal est un fait parmi les mieux documentés de l'histoire de la musique, et la couper pour arranger une page d'accueil renierait la promesse « Every genre, every lineage ». Un atlas du monde montre l'Europe et l'Asie séparément sans affirmer qu'il n'y a pas d'Eurasie.

Le code sépare donc les deux notions. Le parent reste `post_parent`, l'arbre est inchangé ; un nouveau champ `ga_featured` porte le rang de la tuile. La forme et la couleur d'une branche remontent jusqu'à la tuile et non jusqu'à la racine, donc Metal a ses propres couleurs tout en restant sous Rock. Sa tuile annonce « IN ROCK MUSIC » au lieu de se dire famille.

13 familles, 15 tuiles (Metal et Punk sont les deux territoires) : Electronic 363, Rock 291, Metal 61, Punk 80, Folk 221, Latin 201, Art music 167, Hip-hop 100, Pop 95, Jazz 43, Experimental 37, R&B 32, Country 27, Blues 25, Reggae 15. Metal et Punk sont comptés dans Rock.

`art music` garde son libellé Wikidata : c'est l'ombrelle qui contient le classique occidental, indien, japonais et d'Asie du Sud-Est. La renommer « Classical music » entrerait en collision avec son propre enfant `classical music` (46 sous-genres), qui est la branche occidentale.

## Questions ouvertes
- ~~481 genres reconnus restent hors de l'atlas.~~ Tranché le 23/09/2026 : ils sont rattachés à des genres existants par `data/genre-attach.csv`, les familles restent 13. 13 genres restent dehors, raison à l'appui.

## Test d'import Wikidata (21/09/2026)
Requêtes SPARQL sur query.wikidata.org, éléments `instance of (P31) = music genre (Q188451)`. À découper en requêtes légères (libellés, P279, P571, P495, P8052 séparément) : la requête unique avec le service de libellés est tronquée par le délai du serveur.

Chiffres bruts : 6 352 genres ; 11 sans libellé anglais ; 1 293 sans aucun lien Wikipédia (bruit). Parent de type genre (P279) : 810 sans parent, 3 334 avec un seul, 2 208 avec deux ou plus (35 %). Année de création (P571) : 1 361 (21 %). Pays d'origine (P495) : 2 149 (34 %). Identifiant MusicBrainz (P8052) : 2 113. Influences (P737) : 366 liens seulement. BPM : absent de Wikidata. Aucun cycle détecté.

Sous-ensemble « fiable » proposé pour l'import = genres ayant un identifiant MusicBrainz : 2 113 genres, dont 1 155 à parent unique, 296 multi-parents à arbitrer, 662 sans parent dans le sous-ensemble (dont les vraies racines : jazz, rock, blues, pop, hip-hop… mais aussi des formes comme symphony, concerto, lullaby à exclure ou ranger). Année renseignée pour 47 %, pays pour 46 %. Profondeur maximale 6, la majorité entre 1 et 3.

Largeur : dans ce sous-ensemble, 27 parents dépassent 12 enfants (cadran rotatif) et 5 dépassent 40 (regroupement forcé) : electronic dance music 61, pop 56, rock 55, hip-hop 52, house 49. Sur l'ensemble brut : rock 215, pop 150, hip-hop 111, jazz 109.

Problèmes de qualité constatés : (1) deux axes mélangés, stylistique et géographique (302 entrées « music of X », « French electronic music »), à exclure de l'arbre ; (2) parents non musicaux (dance, song, poem) ; (3) erreurs de filiation, par exemple jungle classé enfant de drum and bass alors que c'est l'inverse, dubstep sous « bass music (EDM) » ; (4) niveau intermédiaire « electronic dance music » entre electronic et house/techno, à garder ou aplatir ; (5) micro-genres internet sous electronic (sigma music, aliencore, HexD).

Conclusion : Wikidata fournit le squelette (noms, identifiants, environ 55 % des filiations directement utilisables) mais ni le BPM ni des dates fiables. La curation dans WordPress reste indispensable : arbitrer les multi-parents, corriger les inversions, compléter époque/origine/BPM. Prévoir dans le CPT un champ `status` (imported / reviewed) et conserver `wikidata_parents` brut pour l'arbitrage.

## Décisions d'import (21/09/2026)
- Périmètre : uniquement les genres Wikidata ayant un identifiant MusicBrainz (environ 2 100).
- Multi-parents : choix **automatique, sans relecture** par Maxime. Règle : on remonte au plus proche ancêtre reconnu, on écarte les parents géographiques et les parents déjà ancêtres d'un autre candidat, puis on préfère le parent dont le nom recoupe celui de l'enfant (acid house → house music), puis le plus profond, puis le plus documenté. Petite table de corrections pour les inversions connues (jungle → breakbeat hardcore, drum and bass → jungle).
- Données manquantes : les genres sans année ou sans tempo sont publiés quand même ; le glyphe se dessine sans arc d'époque ni rayons et s'enrichit au fil de la curation.

## Fichier d'import Electronic
`claude/genre-electronic-import.csv` (script : `claude/wikidata-build-electronic.py`). 406 lignes (racine « electronic music » + 405 genres), arbre strict sans orphelin ni cycle, 7 niveaux. 368 parents uniques, 35 choisis automatiquement, 2 corrigés. Année renseignée pour 337 genres (83 %), origine pour 150 (37 %), BPM vide partout. Largeur : cadran pour electronic music (39), hardcore (19), drum and bass (17), trance (15), techno (13) ; regroupement forcé pour electronic dance music (76) et house music (48). Colonnes : wikidata_id, musicbrainz_id, name, parent_wikidata_id, parent_name, level, children_direct, descendants_total, display_rule (ring / dial / group), epoch_year, origin, bpm_min, bpm_max, parent_choice (single / auto / override), wikidata_parents_raw, wikipedia_links.

## Extension WordPress « Genre Atlas » v0.1 (21/09/2026)
Sources dans `claude/plugin/` (plus `templates/atlas.php`, `includes/cli.php`, la police Azeret Mono embarquée, non copiés ici). Testée sur un WordPress réel (6.x, PHP 8.4) : import, ré-import, écran d'import, fiche genre, front.
- Type de contenu `genre` **hiérarchique** : le parent unique est le `post_parent` natif (boîte « Attributs de page »). Pas d'ACF ni d'autre dépendance.
- Champs : `ga_epoch_year`, `ga_origin`, `ga_bpm_min`, `ga_bpm_max`, `ga_family_shape`, `ga_family_hue` (familles seulement), `ga_status` (imported / reviewed), `ga_wikidata_id`, `ga_musicbrainz_id`, `ga_parent_choice`, `ga_wikidata_parents_raw`.
- Import : Genres → Import CSV (ou `wp genre-atlas import fichier.csv`). Appariement sur l'identifiant Wikidata, donc ré-importable sans doublon ; un genre « reviewed » n'est jamais modifié ; une valeur saisie à la main n'est jamais écrasée par du vide.
- Données : `/wp-json/genre-atlas/v1/tree`, arbre complet compact mis en cache (environ 31 Ko pour 406 genres), vidé à chaque modification.
- Front (JavaScript sans dépendance) : chaque URL de genre (`/genre/electronic-music/.../house-music/`) et l'archive `/genre/` affichent l'atlas centré sur ce genre, avec un contenu HTML simple pour les moteurs de recherche. Index des familles, carte avec recentrage, cadran rotatif, arc « +N », panneau, vue liste, recherche, légende, vue mobile verticale sous 900 px. Modèle de page « Genre Atlas (full screen) » et shortcode `[genre_atlas]`.
- Ajustement de la règle de largeur constaté à l'usage : 8 positions partout, réduites à 6 quand un enfant est ouvert, l'axe horizontal servant alors à la lignée. Les nœuds sont répartis sur deux arcs et décalés en rayon au-delà de six, ce qui empêche les libellés de se chevaucher. La liste des genres dans l'admin signale ceux à plus de 8 sous-genres.
- Reste à faire : saisie des BPM, descriptions, regroupements des branches larges (electronic dance music 76, house 48), autres familles, réglages de forme/couleur par famille.

## Mise en ligne
Hébergeur retenu : o2switch. Guide pas à pas (commande du domaine, certificat HTTPS, installation de WordPress par Softaculous, réglages, installation de Genre Atlas, import, page d'accueil, vérifications, dépannage) : https://claude.ai/code/artifact/c12fc11e-e343-4204-915b-17bc494abc80. Offre recommandée : Grow (84 € HT par an, prix stable) plutôt que Cloud (22,32 € HT la première année, puis 192 € HT).

## Fiche genre (« dossier ») — décisions du 23/09/2026
Maquette : https://claude.ai/artifact/3dzMxxCMFJxLS3zxYeVxAX (Alternative Rock, données réelles sauf l'écoute).
- **Ouverture** : plein écran par-dessus la carte, avec sa propre adresse (partageable, indexée) ; le bouton retour du navigateur la referme et rend la carte dans son état. Une fiche par genre ; les groupes éditoriaux n'en ont pas.
- **Glyphe** : petit cartouche à côté du titre (112 px), sans repères de lecture ; les informations de la fiche passent avant.
- **Bouton** : dans le panneau, **au-dessus** de « CENTRE ON », en plein, parce qu'il existe sur tous les genres (feuilles comprises) et garde donc toujours la même place ; « CENTRE ON » passe en contour. Libellé proposé : OPEN DOSSIER.
- **Description** : premier paragraphe de l'article Wikipédia anglais, source et licence (CC BY-SA) citées, remplaçable par un texte de Maxime dans WordPress.
- **Key artists** : 8 au plus (la règle de l'anneau), triés A→Z, proposés depuis Wikidata (P136) et corrigeables. Constat : trier sur la seule notoriété (nombre de liens Wikimédia) donne de mauvais résultats (Milla Jovovich, Yoko Ono, membres en doublon de leur groupe ; Maroon 5 et Tokio Hotel remontent, Radiohead et Pixies manquent). Il faudra un meilleur signal, à trancher. La sélection de la maquette, validée par Maxime, a été faite à la main par Claude dans la liste Wikidata des groupes classés « alternative rock » : elle ne sort pas d'un calcul et ne se reproduira pas toute seule.
- **Photos** : Wikimedia Commons uniquement (licence libre), tramées en 1 bit et colorées dans la teinte de la famille (masque PNG d'environ 2 Ko), photographe et licence toujours crédités. Les photos de Spotify et Deezer sont écartées (droits, retouche interdite). Commons limite fortement les requêtes (429, « robot policy ») : récupérer les vignettes à la taille standard 330 px, lentement, avec un User-Agent identifié.
- **Écoute** : service non choisi (Deezer, Spotify ou YouTube). Principe retenu dans la maquette : un seul lecteur par fiche, un morceau par artiste ; un clic sur un artiste lance son morceau.
- **Données** : préparées par la chaîne `data/` et importées, jamais chargées en direct chez le visiteur. L'artiste deviendra un contenu à part entière (CPT `artist`), une photo stockée une fois pour plusieurs genres.
