=== Genre Atlas ===
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 0.2.1

Music genre atlas: "Genre" content type (strict tree, one parent per genre), CSV import, JSON tree endpoint, map / list / mobile front end.

== Setup ==
1. Plugins > Add New > Upload Plugin > genre-atlas.zip, then Activate.
2. Settings > Permalinks: choose "Post name" and save.
3. Genres > Import CSV: upload genre-electronic-import.csv.
4. Visit the site: the home page shows the atlas (switch off in Genres > Settings). The atlas is also at /genre/.

== Notes ==
* Re-importing the same file never creates duplicates (genres are matched on their Wikidata ID).
* A genre marked "Reviewed" is never modified by an import.
* The Genres list shows which genres have more than 12 subgenres (dial) or more than 40 (group needed).
* WP-CLI: wp genre-atlas import file.csv
* The font (Azeret Mono, SIL Open Font License) is bundled: no call to Google Fonts.
* Updates: new versions published as GitHub releases appear in Plugins like any other update.
