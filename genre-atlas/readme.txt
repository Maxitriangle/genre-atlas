=== Genre Atlas ===
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 0.5.0

Music genre atlas: "Genre" content type (strict tree, one parent per genre), CSV import, JSON tree endpoint, map / list / mobile front end.

== Setup ==
1. Plugins > Add New > Upload Plugin > genre-atlas.zip, then Activate.
2. Settings > Permalinks: choose "Post name" and save.
3. Genres > Import CSV: upload genre-import.csv (13 families, 1630 genres).
4. Visit the site: the home page shows the atlas (switch off in Genres > Settings). The atlas is also at /genre/.

== Notes ==
* Re-importing the same file never creates duplicates (genres are matched on their Wikidata ID).
* A genre marked "Reviewed" is never modified by an import.
* The Genres list shows which genres have more than 8 subgenres (dial) or more than 40 (grouped).
* Past 40 subgenres the map shows editorial groups instead of genres. Genres > Groups is where they are named;
  a genre with no group falls back to its decade, so a wide branch is readable before any of that work is done.
* A tile on the home page and having no parent are two different things. "Home page tile" on the genre screen
  gives a genre a tile and its own colour, whatever its parent: Metal keeps Rock as its parent in the tree and
  still opens the atlas from its own tile, which reads "IN ROCK MUSIC" rather than calling itself a family.
* WP-CLI: wp genre-atlas import file.csv
* The font (Azeret Mono, SIL Open Font License) is bundled: no call to Google Fonts.
* Updates: new versions published as GitHub releases appear in Plugins like any other update.
