#!/usr/bin/env python3
"""Up to 100 artists per genre, from Wikidata, for a whole family.

The 8 key artists of artists-picks.csv were chosen by hand. This script
widens each genre to the artists Wikidata itself files under it (genre,
P136): for every genre of the family, up to 300 candidates, best documented
first (number of Wikimedia sitelinks), of which it keeps the people who make
music and the musical groups, with the rules artists-verify.py learnt over
seven passes (types checked against their labels, subclasses of "musical
group" read from Wikidata, a music occupation, genre, instrument or label for
a person). The 100 best documented are kept, in that order: the dossier shows
the first 8 as its essentials, the rest as a list.

    python3 data/artists-wide.py [family QID ...]    # default: Q9778, electronic music

Writes:
  artists-wide.csv        one row per artist: wikidata_id, name, kind, start,
                          country, image, sitelinks, deezer, youtube_channel,
                          musicbrainz
  genre-artists-wide.csv  genre_id, artist_id, rank (1 = best documented)
Runs on GitHub Actions ("Wide artists"): Wikimedia blocks the address Claude
sessions leave from. Answers are cached in .wide-cache.json (kept from run to
run by the workflow), so a run cut short starts again where it stopped.
"""
import csv
import importlib.util
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('verify', os.path.join(HERE, 'artists-verify.py'))
av = importlib.util.module_from_spec(spec)
spec.loader.exec_module(av)
av.CACHE = os.path.join(HERE, '.wide-cache.json')
av.cache = json.load(open(av.CACHE)) if os.path.exists(av.CACHE) else {}

KEEP_ARTISTS = 100
CANDIDATES = 300
LANGS = 'en|mul|fr|es|de|pt|it|ja'
PROPS = set(av.KEEP) | {'P2722', 'P2397', 'P434'}   # + Deezer artist, YouTube channel, MusicBrainz artist
QUERY = """SELECT ?a ?links WHERE {
  ?a wdt:P136 wd:%s ; wikibase:sitelinks ?links .
} ORDER BY DESC(?links) LIMIT %d"""


def sparql(genre):
    key = 'sparql|' + genre
    if key in av.cache:
        return av.cache[key]
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': QUERY % (genre, CANDIDATES)})
    req = urllib.request.Request(url, headers={'User-Agent': av.UA, 'Accept': 'text/csv'})
    for attempt in range(8):
        try:
            rows = list(csv.reader(io.StringIO(urllib.request.urlopen(req, timeout=90).read().decode('utf-8'))))
            # A query that times out still answers 200, with a Java trace appended.
            if rows and rows[0] == ['a', 'links'] and all(len(r) == 2 for r in rows[1:]):
                out = [[r[0].rsplit('/', 1)[-1], int(r[1])] for r in rows[1:]]
                av.cache[key] = out
                time.sleep(1)
                return out
        except Exception as e:  # 429, 502, 504, network
            sys.stderr.write('  retry %s (%s)\n' % (genre, e))
        time.sleep(min(300, 5 * 2 ** attempt))
    return None


def slim(ent):
    return {'labels': {k: v for k, v in ent.get('labels', {}).items()},
            'claims': {p: [{'mainsnak': c['mainsnak']} for c in cs] for p, cs in ent.get('claims', {}).items() if p in PROPS},
            'sitelinks': len(ent.get('sitelinks', {}))}


def entities(qids, props='labels|claims|sitelinks'):
    out, qids = {}, sorted(set(qids))
    for i in range(0, len(qids), 50):
        params = {'action': 'wbgetentities', 'ids': '|'.join(qids[i:i + 50]), 'props': props, 'languages': LANGS}
        key = json.dumps(params, sort_keys=True)
        if key not in av.cache:
            d = av.get(params)
            av.cache[key] = {q: slim(e) for q, e in d.get('entities', {}).items()}
        out.update(av.cache[key])
        if i % 2000 == 0:
            print('  entities %d / %d' % (i, len(qids)), flush=True)
            av.save()
    return out


def label(ent):
    labels = ent.get('labels', {})
    for lang in LANGS.split('|'):
        if lang in labels:
            return labels[lang].get('value', '')
    return ''


def family_genres(families):
    rows = list(csv.DictReader(open(os.path.join(HERE, 'genre-import.csv'), encoding='utf-8')))
    kids = {}
    for r in rows:
        kids.setdefault(r['parent_wikidata_id'], []).append(r)
    out = []

    def walk(q, top):
        out.append(q)
        for k in kids.get(q, []):
            if k['featured']:
                continue                       # a tile closes the lineage: Metal is not walked from Rock
            walk(k['wikidata_id'], False)
    for f in families:
        walk(f, True)
    return out


def main():
    families = sys.argv[1:] or ['Q9778']
    genres = family_genres(families)
    print('%d genres in %s' % (len(genres), ' '.join(families)), flush=True)
    cands = {}
    for i, g in enumerate(genres):
        got = sparql(g)
        if got is None:
            av.save()
            sys.exit('Wikidata keeps refusing; run again later, the cache keeps what is done.')
        cands[g] = got
        if i % 25 == 0:
            print('  queried %d / %d' % (i, len(genres)), flush=True)
            av.save()
    av.save()
    ents = entities({a for got in cands.values() for a, _ in got})
    # Bands typed with a subclass of "musical group": read those classes.
    classes = {c for e in ents.values() for c in av.ids(e, 'P31')} - av.GROUP_CLASSES - {av.HUMAN}
    for c, e in entities(classes, 'claims').items():
        if av.ids(e, 'P279') & av.GROUPS:
            av.GROUP_CLASSES.add(c)
    av.save()

    kept, links = {}, []
    for g in genres:
        rank = 0
        for a, n in cands[g]:
            e = ents.get(a)
            if not e or not label(e):
                continue
            k, sure = av.kind(e)
            if not k or sure < 2:
                continue                       # only Wikidata's own statements, no guess
            rank += 1
            links.append({'genre_id': g, 'artist_id': a, 'rank': rank})
            kept[a] = k
            if rank >= KEEP_ARTISTS:
                break
    # Country names, for the dossier.
    places = {c for a in kept for p in ('P495', 'P27', 'P740') for c in av.ids(ents[a], p)}
    names = {q: label(e) for q, e in entities(places, 'labels').items()}
    av.save()

    def first_id(e, *props):
        for p in props:
            for v in av.claims(e, p):
                if isinstance(v, dict) and 'id' in v and names.get(v['id']):
                    return names[v['id']]
        return ''

    def first_str(e, prop):
        vals = [v for v in av.claims(e, prop) if isinstance(v, str)]
        return '|'.join(vals[:3])

    with open(os.path.join(HERE, 'artists-wide.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['wikidata_id', 'name', 'kind', 'start', 'country', 'image', 'sitelinks', 'deezer', 'youtube_channel', 'musicbrainz'])
        for a in sorted(kept, key=lambda q: int(q[1:])):
            e = ents[a]
            img = [v for v in av.claims(e, 'P18') if isinstance(v, str)]
            w.writerow([a, label(e), kept[a], av.year(e, 'P2031', 'P571', 'P569'), first_id(e, 'P495', 'P27', 'P740'),
                        img[0] if img else '', e.get('sitelinks', 0), first_str(e, 'P2722'), first_str(e, 'P2397'), first_str(e, 'P434')])
    with open(os.path.join(HERE, 'genre-artists-wide.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['genre_id', 'artist_id', 'rank'])
        w.writeheader()
        w.writerows(links)
    full = sum(1 for g in genres if sum(1 for l in links if l['genre_id'] == g) >= KEEP_ARTISTS)
    print('%d genres: %d artists, %d genre links, %d genres with %d, %d with none' % (
        len(genres), len(kept), len(links), full, KEEP_ARTISTS, sum(1 for g in genres if not any(l['genre_id'] == g for l in links))))


if __name__ == '__main__':
    main()
