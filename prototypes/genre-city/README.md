# Genre City — prototype jouable

Mini-jeu de l'atlas : on marche dans une ville où chaque genre est un bâtiment. Ce dossier n'est **pas** dans l'extension : la release ne zippe que `genre-atlas/`.

- `page.tpl.html` : la page (écran, croix, boutons A et B, boîte de dialogue).
- `art.js` : le dessin, en pixel art produit par le code (moteur de rendu, personnages, bâtiments, mobilier). Aucune image, aucun son.
- `game.js` : les données et le regroupement éditorial repris de `atlas.js`, le monde (cases, collisions, déclencheurs), le héros, la gare.
- `audio.js` : le son, généré dans le navigateur (Web Audio) : une boucle par genre, composée à partir de son nom, mixée selon la distance et le côté.
- `places.js` : les lieux (quartiers en étoile, maisons, tours à ascenseur, kiosques), la caméra, les commandes.
- `electronic.json` : la famille Electronic (392 genres), extraite de `/wp-json/genre-atlas/v1/tree`.
- `sketch.html` : le croquis validé avant le prototype (gare, rue, intérieur).
- `build.py` : assemble `genre-city-prototype.html`, une page autonome. `--data tree.json` refait d'abord `electronic.json`.

Hiérarchie (version 3, 26/10/2026) : la gare (une ligne par tuile) → une ville par famille. La ville est une place au centre (métro, monument, juke-box, borne ABOUT, panneau des directions), avec ses quartiers tout autour sur une grille de 3 × 3, dans le sens des aiguilles d'une montre depuis le nord : 8 au plus, comme l'anneau de la carte. Un quartier = un groupe éditorial, ses genres en bâtiments. Ce que devient un genre dépend de sa profondeur :
- sans sous-genre : un kiosque, on lit sa fiche au comptoir ;
- jusqu'à 8 sous-genres : une maison, une seule salle. Les sous-genres qui en ont d'autres sont des portes, les autres des studios vitrés qu'on lit ;
- des groupes : une tour, un ascenseur, un étage par groupe (plus haute à partir de 50 descendants). Les arches vers des quartiers en plein air ont été essayées en version 2 puis retirées : elles désorientaient.

Son : aucun avant le bouton SOUND (ou M). Chaque genre a une boucle (tempo, batterie et lead choisis d'après les mots de son nom, notes tirées du nom), chaque quartier une nappe, la place le thème de la famille. Trois voix au plus jouent, les plus proches, plus celle de la salle où l'on est.
