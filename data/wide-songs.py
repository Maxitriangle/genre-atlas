#!/usr/bin/env python3
"""One song for each artist of artists-wide.csv, as listen-tracks.py does it.

The Deezer artist is the one Wikidata links to (column deezer); without that
link the artist is searched by name, and among namesakes the song is kept
only when YouTube has it on the artist's own channel. The YouTube video is
matched with the same rules (title, the artist's channel or name, no cover,
no live take, embeddable). Same cache as listen-tracks.py, so an artist
already done there costs nothing.

    python3 data/wide-songs.py [workers]      # resumes from its cache

Writes wide-songs.csv, with the columns of artist-songs.csv.
"""
import csv
import importlib.util
import os
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('listen', os.path.join(HERE, 'listen-tracks.py'))
lt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lt)
OUT = os.path.join(HERE, 'wide-songs.csv')


def main():
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    artists = list(csv.DictReader(open(os.path.join(HERE, 'artists-wide.csv'), encoding='utf-8')))
    ids = {r['wikidata_id']: r for r in artists}
    rows, done = [None] * len(artists), [0]

    def job(i):
        rows[i] = lt.one(artists[i], ids)
        with lt.lock:
            done[0] += 1
            n = done[0]
        if n % 50 == 0:
            lt.save()
            sys.stderr.write('%d/%d\n' % (n, len(artists)))

    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(job, range(len(artists))))
    lt.save()
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print('%d artists: %d with a Deezer song (%d by Wikidata link), %d also on YouTube' % (
        len(rows), sum(1 for r in rows if r['deezer_track']), sum(1 for r in rows if r['match'] == 'wikidata'),
        sum(1 for r in rows if r['youtube'])))


if __name__ == '__main__':
    main()
