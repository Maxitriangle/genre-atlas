#!/usr/bin/env python3
"""Build the artist import file for the plugin from the verified artists.

    python3 data/artists-build.py

Reads artists.csv, genre-artists.csv, artist-photos.csv and, when they exist,
artist-songs.csv and artists-mb.csv (the artists that give a sound to the
genres that had none, from artists-mb.py) and artists-checked.csv with
genre-artists-checked.csv (else artists-wide.csv with genre-artists-wide.csv)
and wide-songs.csv (up to 100 artists per genre, from
artists-wide.py and wide-songs.py), and writes artist-import.csv: one row per
artist linked to at least one genre, with its genres ("Q123:4", Wikidata ID
and rank in that genre, "|"-separated: the 8 first are the dossier's
essentials, the hand-picked ones first, then the widest documented), the credit
of its photo and its song for the Listen section. The photo fields are empty
when the photo was left out or has no mask in the plugin.
Import it in WordPress after genre-import.csv (Genres > Import CSV).
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_ARTISTS = 100
MASKS = os.path.join(HERE, '..', 'genre-atlas', 'assets', 'masks')


def rows(name):
    return list(csv.DictReader(open(os.path.join(HERE, name), encoding='utf-8')))


def has(name):
    return os.path.exists(os.path.join(HERE, name))


def main():
    order = {}                                         # genre -> its artists, best first

    def link(q, g):
        lst = order.setdefault(g, [])
        if q not in lst and len(lst) < MAX_ARTISTS:
            lst.append(q)
            return True
        return False
    for r in rows('genre-artists.csv'):                # picked by hand: first
        link(r['artist_id'], r['genre_id'])
    photos = {r['wikidata_id']: r for r in rows('artist-photos.csv')
              if r['status'] == 'ok' and os.path.exists(os.path.join(MASKS, r['wikidata_id'] + '.png'))}
    songs = {r['wikidata_id']: r for r in rows('artist-songs.csv')} if has('artist-songs.csv') else {}
    artists = rows('artists.csv')
    known = {a['wikidata_id'] for a in artists}
    if has('artists-mb.csv'):
        for r in rows('artists-mb.csv'):
            q = r['wikidata_id']
            link(q, r['genre_id'])
            if q not in known:
                known.add(q)
                artists.append(r)
            if not songs.get(q, {}).get('deezer_track'):
                songs[q] = r
    # The wide artists come after those, in Wikidata's order (best documented).
    # Checked against MusicBrainz (artists-cross.py) when that pass was run.
    pair = ('artists-checked.csv', 'genre-artists-checked.csv') if has('genre-artists-checked.csv') else ('artists-wide.csv', 'genre-artists-wide.csv')
    if has(pair[0]) and has(pair[1]):
        wide = {r['wikidata_id']: r for r in rows(pair[0])}
        wsongs = {r['wikidata_id']: r for r in rows('wide-songs.csv')} if has('wide-songs.csv') else {}
        for r in sorted(rows(pair[1]), key=lambda r: int(r['rank'])):
            q = r['artist_id']
            if q not in wide or not link(q, r['genre_id']):
                continue
            if q not in known:
                known.add(q)
                artists.append(wide[q])
            if not songs.get(q, {}).get('deezer_track') and wsongs.get(q, {}).get('deezer_track'):
                songs[q] = wsongs[q]
    genres = {}
    for g, lst in order.items():
        for i, q in enumerate(lst, 1):
            genres.setdefault(q, []).append('%s:%d' % (g, i))
    out = []
    for a in artists:
        q = a['wikidata_id']
        if q not in genres:
            continue
        p, s = photos.get(q, {}), songs.get(q, {})
        out.append(dict(wikidata_id=q, name=a['name'], kind=a['kind'], start=a['start'],
                        country=a['country'], genres='|'.join(genres[q]),
                        photo_file=p.get('file', ''), photo_author=p.get('author', ''),
                        photo_license=p.get('license', ''), photo_license_url=p.get('license_url', ''),
                        song_title=s.get('song_title', ''), song_deezer=s.get('deezer_track', ''),
                        song_youtube=s.get('youtube', '')))
    out.sort(key=lambda r: r['wikidata_id'])
    with open(os.path.join(HERE, 'artist-import.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    print('%d artists, %d with a photo, %d with a song, %d genre links, %d genres with 100' % (
        len(out), sum(1 for r in out if r['photo_file']), sum(1 for r in out if r['song_title']),
        sum(len(v) for v in genres.values()), sum(1 for v in order.values() if len(v) >= MAX_ARTISTS)))


if __name__ == '__main__':
    main()
