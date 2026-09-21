# Genre Atlas

A personal, non-commercial atlas of music genres: every genre, every lineage.
WordPress plugin + the data pipeline that feeds it.

- `genre-atlas/` — the WordPress plugin (content type "Genre" as a strict tree, CSV import, JSON tree endpoint, map / list / mobile front end, self-update from this repository's releases).
- `data/` — `wikidata-build-electronic.py` builds an import file from Wikidata (MusicBrainz-recognised genres only, one parent per genre); `genre-electronic-import.csv` is its output for the Electronic family.
- `docs/cadrage-mvp.md` — project brief and decisions (in French).

## Releasing

Bump `Version` and `GENRE_ATLAS_VERSION` in `genre-atlas/genre-atlas.php`, commit, then push a tag `vX.Y.Z`.
The workflow builds `genre-atlas.zip` and publishes a release; the site then offers the update in Plugins.

## Licences

Code: GPL-2.0-or-later (as WordPress). Genre data derived from Wikidata (CC0). Font: Azeret Mono, SIL Open Font License.
