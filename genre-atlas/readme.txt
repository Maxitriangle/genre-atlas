=== Genre Atlas ===
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 0.9.0

Music genre atlas: "Genre" content type (strict tree, one parent per genre), CSV import, JSON tree endpoint, map / list / mobile front end.

== Setup ==
1. Plugins > Add New > Upload Plugin > genre-atlas.zip, then Activate.
2. Settings > Permalinks: choose "Post name" and save.
3. Genres > Import CSV: upload genre-import.csv (13 families, 1630 genres).
4. Visit the site: the home page shows the atlas (switch off in Genres > Settings). The atlas is also at /genre/.

== Notes ==
* Re-importing the same file never creates duplicates (genres are matched on their Wikidata ID).
* A genre marked "Reviewed" is never modified by an import.
* The Genres list shows which genres have more than 8 subgenres, the point past which the map groups them.
* A genre with no group sits beside the groups rather than inside one, so a few leftovers from an older import
  file never stop a branch being grouped. A warning on the Genres screens names them.
* Past 8 subgenres the map shows editorial groups instead of genres, so nothing is ever hidden behind arrows.
  A group is a path ("EUROPE > IBERIA") and the map cuts one segment at a time, so folk's 170 subgenres narrow
  to continents, then regions. The import file carries the group; Genres > Groups is where they are renamed.
  A branch whose path runs out falls back on alphabetical ranges, never on the decade.
  Genres > Settings switches the editorial names off.
* A tile on the home page and having no parent are two different things. "Home page tile" on the genre screen
  gives a genre a tile and its own colour, whatever its parent: Metal keeps Rock as its parent in the tree and
  still opens the atlas from its own tile, which reads "FAMILY": a tile closes the displayed lineage, so nothing
  under Metal shows Rock above it, while the address stays /genre/rock-music/metal-music/.
* WP-CLI: wp genre-atlas import file.csv
* The font (Azeret Mono, SIL Open Font License) is bundled: no call to Google Fonts.
* Updates: new versions published as GitHub releases appear in Plugins like any other update.
