# Genre City — prototype jouable

Mini-jeu de l'atlas : on marche dans une ville où chaque genre est un bâtiment. Ce dossier n'est **pas** dans l'extension : la release ne zippe que `genre-atlas/`.

- `page.tpl.html` : la page (écran, croix, boutons A et B, boîte de dialogue).
- `art.js` : le dessin, en pixel art produit par le code (moteur de rendu, personnages, bâtiments, mobilier). Aucune image, aucun son.
- `game.js` : les données et le regroupement éditorial repris de `atlas.js`, le monde (cases, collisions, déclencheurs), le héros, la gare.
- `places.js` : les lieux (quartiers en étoile, maisons, tours à ascenseur, kiosques), la caméra, les commandes.
- `electronic.json` : la famille Electronic (392 genres), extraite de `/wp-json/genre-atlas/v1/tree`.
- `sketch.html` : le croquis validé avant le prototype (gare, rue, intérieur).
- `build.py` : assemble `genre-city-prototype.html`, une page autonome. `--data tree.json` refait d'abord `electronic.json`.

Hiérarchie (version 2, 26/10/2026) : la gare (une ligne par tuile) → une ville par famille. La ville est une place au centre (métro, monument, juke-box, borne ABOUT, panneau des directions), avec ses quartiers tout autour sur une grille de 3 × 3, dans le sens des aiguilles d'une montre depuis le nord : 8 au plus, comme l'anneau de la carte. Un quartier = un groupe éditorial, ses genres en bâtiments. Ce que devient un genre dépend de sa profondeur :
- sans sous-genre : un kiosque, on lit sa fiche au comptoir ;
- jusqu'à 8 sous-genres : une maison, une seule salle. Les sous-genres qui en ont d'autres sont des portes, les autres des studios vitrés qu'on lit ;
- des groupes, moins de 50 descendants : une tour, un ascenseur, un étage par groupe ;
- des groupes, 50 et plus : une arche qui ouvre un quartier en plein air, construit comme la ville.
