#!/usr/bin/env python3
"""Read each verified artist's streaming identifiers from Wikidata.

The Listen section of the dossier plays one song per key artist. To find that
song without guessing between namesakes (a Deezer search for "Nirvana" puts a
British band first), each artist is looked up by the identifiers Wikidata
already links to it:

  P2722  Deezer artist ID    finds the artist's most played track
  P1902  Spotify artist ID   kept for a later exact Spotify link
  P2397  YouTube channel ID  confirms a YouTube video is the artist's own

    python3 data/listen-ids.py

Writes artist-streaming.csv (wikidata_id, deezer, spotify, youtube_channel;
several values joined by "|"). Runs on GitHub Actions ("Listen IDs"), because
Wikidata blocks the address Claude sessions leave from.
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'GenreAtlas/0.9 (personal non-commercial project; https://github.com/Maxitriangle/genre-atlas)'
API = 'https://www.wikidata.org/w/api.php?'
OUT = os.path.join(HERE, 'artist-streaming.csv')
PROPS = (('deezer', 'P2722'), ('spotify', 'P1902'), ('youtube_channel', 'P2397'))


def get(params):
    url = API + urllib.parse.urlencode(dict(params, format='json', formatversion=2))
    for attempt in range(12):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            data = json.load(urllib.request.urlopen(req, timeout=60))
            time.sleep(1)
            return data
        except Exception as e:
            wait = min(600, 10 * 2 ** attempt)
            after = getattr(e, 'headers', None) and e.headers.get('Retry-After')
            if after and after.isdigit():
                wait = max(wait, int(after))
            sys.stderr.write('  retry in %ds (%s)\n' % (wait, e))
            time.sleep(wait)
    sys.exit('Wikidata keeps refusing; run again later.')


def values(ent, prop):
    return [c['mainsnak']['datavalue']['value'] for c in ent.get('claims', {}).get(prop, [])
            if c['mainsnak'].get('snaktype') == 'value' and c.get('rank') != 'deprecated']


def main():
    qids = [r['wikidata_id'] for r in csv.DictReader(open(os.path.join(HERE, 'artists.csv')))]
    rows = []
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        ents = get({'action': 'wbgetentities', 'ids': '|'.join(batch), 'props': 'claims'})['entities']
        for q in batch:
            ent = ents.get(q, {})
            rows.append(dict({'wikidata_id': q}, **{k: '|'.join(values(ent, p)) for k, p in PROPS}))
        sys.stderr.write('%d/%d\n' % (len(rows), len(qids)))
    with open(OUT, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['wikidata_id'] + [k for k, _ in PROPS])
        w.writeheader()
        w.writerows(rows)
    for k, _ in PROPS:
        print('%s: %d of %d artists' % (k, sum(1 for r in rows if r[k]), len(rows)))


if __name__ == '__main__':
    main()
