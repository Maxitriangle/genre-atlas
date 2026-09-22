# `data/` — d'où viennent les genres

Tout part de Wikidata. La chaîne se rejoue de bout en bout, et elle tient en deux commandes :

```bash
cd data
./wikidata-fetch.sh          # récupère les cinq extraits SPARQL
python3 wikidata-build.py    # en construit genre-import.csv
```

`wikidata-build.py` reprend au passage `genre-groups.csv`, le découpage éditorial des branches larges. Pour le régénérer (après avoir modifié les tables de `build-groups.py`) :

```bash
python3 build-groups.py      # relit genre-import.csv, réécrit genre-groups.csv
python3 wikidata-build.py    # reporte la colonne group dans genre-import.csv
```

Le fichier à importer dans WordPress est **`genre-import.csv`** : Genres → Import CSV.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `wikidata-fetch.sh` | Interroge `query.wikidata.org` et écrit les cinq extraits. |
| `a_labels.csv` | Nom anglais et nombre de liens Wikimédia de chaque genre. |
| `b_parents.csv` | Les liens « sous-classe de » (P279), bruts : un genre peut y avoir plusieurs parents. |
| `c_inception.csv` | Année de création (P571). |
| `d_country.csv` | Pays d'origine (P495). |
| `e_mb.csv` | Identifiant MusicBrainz (P8052). |
| `wikidata-build.py` | Construit l'arbre strict et écrit `genre-import.csv`. |
| `build-groups.py` | Découpe les 36 branches de plus de 8 sous-genres et écrit `genre-groups.csv`. |
| `genre-groups.csv` | Le groupe de chacun des 1 020 genres concernés. Colonne `group` du fichier d'import. Un groupe est un chemin : « EUROPE > IBERIA ». |
| `genre-import.csv` | **Le fichier d'import.** 13 familles, 15 tuiles, 1 630 genres. |
| `wikidata-build-electronic.py` | L'ancien script, une famille à la fois. |
| `genre-electronic-import.csv` | Son résultat, les 406 genres de la v0.3.0. |

Les deux derniers ne servent plus à alimenter le site : ils sont gardés parce qu'ils documentent d'où viennent les données publiées jusqu'à la v0.3.0. N'importe pas `genre-electronic-import.csv` sur un site déjà à jour, tu y remettrais l'ancienne répartition.

## Ce que fait le script de construction

Wikidata autorise plusieurs parents par genre ; l'atlas n'en veut qu'un. Le script tranche, dans cet ordre : il écarte l'axe géographique (« music of X ») et les parents qui sont déjà l'ancêtre d'un autre candidat, puis préfère celui dont le nom recoupe celui de l'enfant (acid house → house music), puis le plus profond, puis le mieux documenté. À égalité parfaite, il départage sur l'identifiant, pour que deux exécutions donnent toujours le même arbre.

Il construit **toutes les familles en une seule passe**, et c'est important : un genre atteignable depuis deux familles est arbitré une fois, donc il n'apparaît que sous une seule. Construites une par une, les familles se marcheraient dessus et le dernier import déplacerait silencieusement des genres.

Deux tables en haut du script portent les décisions éditoriales : `FAMILIES` (qui a une tuile et sa propre racine), `TERRITORIES` (qui a une tuile tout en gardant son parent — Metal et Punk sous Rock). `OVERRIDE` corrige les inversions connues de Wikidata, comme jungle classé sous drum and bass alors que c'est l'inverse.

## Ce qui reste dehors

481 genres reconnus (23 %) n'entrent dans aucune famille, faute d'un parent exploitable dans Wikidata : 248 sont isolés, 233 se répartissent sous 54 racines. Parmi eux des genres bien réels — funk, ska, gospel, reggaeton, ambient, K-pop, J-pop, Afrobeat, klezmer, raï. Le script les liste à chaque exécution. Pour les faire entrer, il faudra soit les déclarer familles, soit leur écrire une table de rattachement sur le modèle d'`OVERRIDE`.

## Si Wikidata bouge

Le script s'arrête avec un message clair plutôt que de produire un arbre faux : si un libellé de `FAMILIES` a disparu, si une famille se retrouve avec un parent, ou si Metal cesse d'être sous Rock. Le script de récupération, lui, refuse une réponse tronquée : quand une requête dépasse le délai du serveur, Wikidata répond quand même 200 et colle une trace Java à la fin des données.
