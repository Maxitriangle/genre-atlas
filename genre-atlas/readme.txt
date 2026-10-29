=== Genre Atlas ===
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 0.20.0

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
* Contact: /contact/ (menu CONTACT, and SUGGEST A CORRECTION at the foot of every dossier, which names the genre).
  Messages go to the address set in Genres > Settings, which visitors never see, with the visitor in Reply-To,
  and a copy is kept in Messages. No captcha and no outside service: a hidden field, a minimum of 3 seconds
  between loading and sending, and 5 messages an hour per connection.
* Mobile (under 900 px): the map turned upright. The lineage on top (two levels, then how many more), the genre in
  the middle, its subgenres fanned out below in two rows of four at most: the same eight seats and editorial groups
  as the desktop ring. A tap glides a subgenre into the centre, a tap on the lineage goes back up, and holding a
  genre plays its 30 seconds. MAP / LIST switches to the vertical tree.
* Sound: full songs by default, in YouTube's own player (youtube.com, so its Premium subscribers hear no ads),
  which the player bar drives and shows in a 200 x 200 card while it plays, as YouTube requires: HEAR on the panel
  and on mobile, RADIO, holding a genre on a phone, and the dossier's songs. The first time, the bar says that
  YouTube may set its cookies and show its ads. FULL / 30 S in the bar switches to Deezer's 30-second previews,
  which also play when the pointer rests on a genre once SOUND ON (header, screens with a mouse) is chosen, and for
  songs with no video. GET /wp-json/genre-atlas/v1/sound/<id>?i=<n>[&full=1] hands out the genre's songs in turn
  (Deezer signs a preview's address for 15 minutes, kept 10). The bar sits outside the page, so the sound goes on
  from the map to a dossier and back; ✕ stops it. RADIO chains one song per genre of a branch, shuffled, the next
  genre when a song ends (⏭ skips); like the random draw it stops at the tiles. Nothing is asked of Deezer or
  YouTube before one of those choices; the choices are kept in the browser's local storage, not in a cookie (all
  stated on /legal/).
* Listening examples: a genre whose key artists have no song (often a tradition or a form: oberek, gamelan degung)
  can have a YouTube video instead. The import file proposes up to three per genre, found under the genre's name;
  they wait in Genres > Listening examples, counted on the menu, where each one is played in place, then accepted
  or rejected. A rejected video makes way for the next and is never proposed again; an accepted one opens the
  dossier's LISTEN section and survives re-imports. The genre's edit screen ("Listening example") changes or
  removes it by hand. Nothing shows on the site before it is accepted.
* Community picks: under LISTEN, every dossier lets anyone suggest an artist or a playlist (a link on Spotify,
  Deezer, YouTube, Apple Music, Bandcamp, SoundCloud, Tidal or Qobuz, a name, an optional note and nickname).
  Nothing shows before it is approved in Suggestions, where the menu counts what is waiting: Approve puts a
  pick online, Reject moves it to the trash. The same link twice for one genre is refused; 10 suggestions an
  hour per connection.
* Approved links are checked once a week (WordPress's daily scheduled run). A link the platform calls gone twice
  in a row, a day apart, is flagged in Suggestions: counted on the menu, named at the top of the screen and listed
  under "Broken links". It stays on the dossier until it is corrected, taken offline or rejected. "Check link" on
  a row checks it at once. A refusal or a timeout never flags a link.
* Search engines and link previews: every page is written in plain HTML before the script draws over it (a genre's
  dossier with its text, subgenres, key artists, songs, picks and sources; the families and their subgenres on the
  home page). A genre's canonical address is its dossier (/genre/…/about/), which the sitemap lists. Each page has
  a title, a summary from its text, Open Graph tags and structured data (breadcrumbs of the lineage). The picture
  shared on social networks is drawn per genre with its glyph (1200 × 630, PHP GD, kept in uploads/genre-atlas/og/).
  /genre/random/ is not indexed; the users' sitemap is switched off. An SEO plugin (Yoast, Rank Math, AIOSEO,
  SEOPress, The SEO Framework) takes over the head if one is active.
* Legal notice and privacy: /legal/ (linked from the foot of every page, the map's panel included, and from both
  forms). When the Matomo Analytics plugin is active, the page says so and offers a button not to be counted
  (Matomo's own opt-out, its one cookie set only on request), and the atlas counts every page it shows without a
  reload, which Matomo's snippet alone does not see. The text is written once,
  in includes/legal.php: publisher (a private individual, anonymous as French law allows, details given to the host),
  host, what the forms keep, cookies (none), rights, sources and credits. Change GENRE_ATLAS_LEGAL_UPDATED with it.
  Core's emoji script is switched off on atlas pages, so no page fetches anything from outside before a click.
* Site icon: the glyph of the atlas (a hexagon in a ring of eight), used while none is set in Appearance > Customize,
  for /favicon.ico too. tools/make-icons.php draws it again.
* WP-CLI: wp genre-atlas import file.csv
* The font (Azeret Mono, SIL Open Font License) is bundled: no call to Google Fonts.
* Updates: new versions published as GitHub releases appear in Plugins like any other update.
