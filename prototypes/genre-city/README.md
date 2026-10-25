# Genre City — prototype jouable

Mini-jeu de l'atlas : on marche dans une ville où chaque genre est un bâtiment. Ce dossier n'est **pas** dans l'extension : la release ne zippe que `genre-atlas/`.

- `page.tpl.html` : la page (écran, croix, boutons A et B, boîte de dialogue).
- `art.js` : le dessin, en pixel art produit par le code (moteur de rendu, personnages, bâtiments, mobilier). Aucune image, aucun son.
- `game.js` : le jeu (données et regroupement éditorial repris de `atlas.js`, cartes, collisions, portes, caméra, commandes).
- `electronic.json` : la famille Electronic (392 genres), extraite de `/wp-json/genre-atlas/v1/tree`.
- `sketch.html` : le croquis validé avant le prototype (gare, rue, intérieur).
- `build.py` : assemble `genre-city-prototype.html`, une page autonome. `--data tree.json` refait d'abord `electronic.json`.

Hiérarchie : la gare (accueil, une ligne par tuile) → une ville par famille → une rue par groupe éditorial → un bâtiment par genre, dont la taille suit le nombre de descendants (kiosque 0, maison 1–9, bloc 10–49, tour 50+) → à l'intérieur, une porte par groupe ou sous-genre, 8 au plus, par ordre alphabétique. Le juke-box et la borne ABOUT ouvrent la fiche `/about/`.
