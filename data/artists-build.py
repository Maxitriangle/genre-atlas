#!/usr/bin/env python3
"""Build the artist import file for the plugin from the verified artists.

    python3 data/artists-build.py

Reads artists.csv, genre-artists.csv and artist-photos.csv, and writes
artist-import.csv: one row per artist linked to at least one genre, with its
genres (Wikidata IDs, "|"-separated) and the credit of its photo. The photo
fields are empty when the photo was left out or has no mask in the plugin.
Import it in WordPress after genre-import.csv (Genres > Import CSV).
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MASKS = os.path.join(HERE, '..', 'genre-atlas', 'assets', 'masks')


def rows(name):
    return list(csv.DictReader(open(os.path.join(HERE, name), encoding='utf-8')))


def main():
    genres = {}
    for r in rows('genre-artists.csv'):
        genres.setdefault(r['artist_id'], []).append(r['genre_id'])
    photos = {r['wikidata_id']: r for r in rows('artist-photos.csv')
              if r['status'] == 'ok' and os.path.exists(os.path.join(MASKS, r['wikidata_id'] + '.png'))}
    out = []
    for a in rows('artists.csv'):
        q = a['wikidata_id']
        if q not in genres:
            continue
        p = photos.get(q, {})
        out.append(dict(wikidata_id=q, name=a['name'], kind=a['kind'], start=a['start'],
                        country=a['country'], genres='|'.join(genres[q]),
                        photo_file=p.get('file', ''), photo_author=p.get('author', ''),
                        photo_license=p.get('license', ''), photo_license_url=p.get('license_url', '')))
    out.sort(key=lambda r: r['wikidata_id'])
    with open(os.path.join(HERE, 'artist-import.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    print('%d artists, %d with a photo, %d genre links' % (
        len(out), sum(1 for r in out if r['photo_file']), sum(len(v) for v in genres.values())))


if __name__ == '__main__':
    main()
