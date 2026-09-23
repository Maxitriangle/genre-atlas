#!/usr/bin/env python3
"""Fetch the artist candidates of every genre in the atlas from Wikidata.

For each genre of genre-import.csv, asks Wikidata for everything whose genre
(P136) is that genre, best documented first (number of Wikimedia
sitelinks), and keeps the first 80. This is the pool the key artists of each
dossier are picked from; the pick itself is editorial (artists-picks.csv).

    python3 data/artists-fetch.py            # resumes where it stopped

Writes artist-candidates.csv (genre_id, artist_id, links). One query per genre,
about 2,100 of them: the script paces itself, retries on 429/5xx and on the
truncated 200 answers Wikidata sends when a query times out, and skips the
genres already in the output file, so it can be stopped and restarted.
"""
import csv
import io
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'artist-candidates.csv')
UA = 'GenreAtlas/0.8 (personal non-commercial project; https://github.com/Maxitriangle/genre-atlas)'
LIMIT = 80

# Anything whose genre is this genre, best documented first. Albums and songs
# carry P136 too; they are told apart from people and groups afterwards, in one
# batched pass (artists-details.py), because filtering on the type here makes
# the wide genres time out.
QUERY = """SELECT ?a ?links WHERE {
  ?a wdt:P136 wd:%s ; wikibase:sitelinks ?links .
} ORDER BY DESC(?links) LIMIT %d"""


def ask(q):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': q})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/csv'})
    for attempt in range(6):
        try:
            body = urllib.request.urlopen(req, timeout=90).read().decode('utf-8')
            rows = list(csv.reader(io.StringIO(body)))
            # A timed-out query still answers 200, with a Java trace appended.
            if rows and rows[0] == ['a', 'links'] and all(len(r) == 2 for r in rows[1:]):
                return rows[1:]
        except Exception as e:  # 429, 502, 504, network
            sys.stderr.write('  retry (%s)\n' % e)
        time.sleep(2 ** attempt * 2)
    return None


def main():
    genres = [r['wikidata_id'] for r in csv.DictReader(open(os.path.join(HERE, 'genre-import.csv'), encoding='utf-8'))]
    done = set()
    if os.path.exists(OUT):
        done = {r['genre_id'] for r in csv.DictReader(open(OUT, encoding='utf-8'))}
    else:
        with open(OUT, 'w', encoding='utf-8', newline='') as fh:
            csv.writer(fh).writerow(['genre_id', 'artist_id', 'links'])
    todo = [g for g in genres if g not in done]
    failed = []
    for i, g in enumerate(todo):
        rows = ask(QUERY % (g, LIMIT))
        if rows is None:
            failed.append(g)
            continue
        with open(OUT, 'a', encoding='utf-8', newline='') as fh:
            w = csv.writer(fh)
            # A genre with no artist still gets a line, so a rerun skips it.
            if not rows:
                w.writerow([g, '', ''])
            for a, links in rows:
                w.writerow([g, a.rsplit('/', 1)[-1], links])
        if i % 50 == 0:
            print('%d / %d' % (i + len(done), len(genres)), flush=True)
        time.sleep(0.5)
    print('done, %d failed: %s' % (len(failed), ' '.join(failed)))


if __name__ == '__main__':
    main()
