#!/usr/bin/env python3
"""Check the key artists of artists-picks.csv against Wikidata, and describe them.

artists-picks.csv is editorial: up to 8 artist names per genre, picked by hand
(genre_id, genre, artists as "A | B | C"). A name can be misspelt, ambiguous or
simply wrong, so nothing reaches the site before this script has found it on
Wikidata as a person or a group that makes music.

For every distinct name it searches Wikidata, keeps the best candidate that is
a musician (a human with a music occupation, or a musical group of any kind),
and prefers one whose genres (P136) include the genre it was picked for. Then
it reads what the dossier shows: country, start year, image and its licence.

    python3 data/artists-verify.py       # resumes from its cache

Writes:
  artists.csv          one row per verified artist (wikidata_id, name, kind,
                       start, country, image, sitelinks)
  genre-artists.csv    genre_id, artist_id, in the pick's A-to-Z order
  artists-rejected.csv every name that did not verify, with the reason
The Wikimedia APIs are rate-limited; answers are cached in .artists-cache.json
so a stopped run picks up where it left off.
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'GenreAtlas/0.8 (personal non-commercial project; https://github.com/Maxitriangle/genre-atlas)'
API = 'https://www.wikidata.org/w/api.php?'
CACHE = os.path.join(HERE, '.artists-cache.json')

HUMAN = 'Q5'
# Musical group and the kinds of group Wikidata types bands with.
GROUPS = {'Q215380', 'Q5741069', 'Q2088357', 'Q9212979', 'Q216337', 'Q641066',
          'Q281643', 'Q42998', 'Q131186', 'Q56816954', 'Q1644573', 'Q20819922',
          'Q18127', 'Q1142850', 'Q2393701', 'Q105543609'}
# Occupations that make a human count as a musician.
MUSIC_JOBS = {'Q639669', 'Q177220', 'Q36834', 'Q488205', 'Q753110', 'Q855091',
              'Q130857', 'Q386854', 'Q158852', 'Q486748', 'Q1259917', 'Q2252262',
              'Q1075651', 'Q806349', 'Q183945', 'Q584301', 'Q1198887', 'Q12800682',
              'Q765778', 'Q1415090', 'Q2643890', 'Q5716684', 'Q3089940', 'Q1643514',
              'Q2865819', 'Q6168364', 'Q1327329', 'Q13365770', 'Q1076502', 'Q1028181'}

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def get(params):
    key = json.dumps(params, sort_keys=True)
    if key in cache:
        return cache[key]
    url = API + urllib.parse.urlencode(dict(params, format='json', formatversion=2))
    # Wikimedia throttles shared addresses hard (429, "robot policy"). Be slow
    # and patient: honour Retry-After, back off up to ten minutes, keep going.
    for attempt in range(20):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            data = json.load(urllib.request.urlopen(req, timeout=60))
            cache[key] = data
            if len(cache) % 25 == 0:
                save()
            time.sleep(2)
            return data
        except Exception as e:
            wait = min(600, 10 * 2 ** attempt)
            after = getattr(e, 'headers', None) and e.headers.get('Retry-After')
            if after and after.isdigit():
                wait = max(wait, int(after))
            sys.stderr.write('  retry %s in %ds (%s)\n' % (params.get('search') or params.get('action'), wait, e))
            time.sleep(wait)
    save()
    sys.exit('Wikidata keeps refusing; run again later, the cache keeps what is done.')


def save():
    json.dump(cache, open(CACHE, 'w'))


def claims(ent, prop):
    return [c['mainsnak'].get('datavalue', {}).get('value') for c in ent.get('claims', {}).get(prop, [])
            if c['mainsnak'].get('snaktype') == 'value']


def ids(ent, prop):
    return {v['id'] for v in claims(ent, prop) if isinstance(v, dict) and 'id' in v}


def year(ent, *props):
    for p in props:
        for v in claims(ent, p):
            t = v.get('time', '') if isinstance(v, dict) else ''
            if len(t) > 5 and t[1:5].isdigit():
                return int(t[1:5])
    return ''


KEEP = ('P31', 'P106', 'P136', 'P1303', 'P264', 'P495', 'P27', 'P740', 'P18', 'P571', 'P2031', 'P569')


def slim(ent):
    """Only what this script reads: a full entity weighs tens of kilobytes,
    and some 40,000 candidates go through the cache."""
    return {'labels': {k: v for k, v in ent.get('labels', {}).items() if k == 'en'},
            'claims': {p: [{'mainsnak': c['mainsnak']} for c in cs]
                       for p, cs in ent.get('claims', {}).items() if p in KEEP},
            'sitelinks': {k: 1 for k in ent.get('sitelinks', {})}}


def entities(qids):
    out = {}
    qids = sorted(qids)
    for i in range(0, len(qids), 50):
        params = {'action': 'wbgetentities', 'ids': '|'.join(qids[i:i + 50]),
                  'props': 'labels|claims|sitelinks', 'languages': 'en'}
        d = get(params)
        slimmed = {q: slim(e) for q, e in d.get('entities', {}).items()}
        cache[json.dumps(params, sort_keys=True)] = {'entities': slimmed}
        out.update(slimmed)
    return out


def kind(ent):
    p31 = ids(ent, 'P31')
    if p31 & GROUPS:
        return 'group'
    # A music occupation, or anything only musicians carry: a genre, an
    # instrument, a record label.
    if HUMAN in p31 and (ids(ent, 'P106') & MUSIC_JOBS or ids(ent, 'P136')
                         or ids(ent, 'P1303') or ids(ent, 'P264')):
        return 'person'
    return None


def main():
    picks = list(csv.DictReader(open(os.path.join(HERE, 'artists-picks.csv'), encoding='utf-8')))
    wanted = {}
    for p in picks:
        for n in [a.strip() for a in p['artists'].split('|') if a.strip()]:
            wanted.setdefault(n, set()).add(p['genre_id'])
    print('%d genres, %d distinct names' % (len(picks), len(wanted)), flush=True)

    found = {}
    for i, name in enumerate(sorted(wanted)):
        hits = get({'action': 'wbsearchentities', 'search': name, 'language': 'en',
                    'type': 'item', 'limit': 7}).get('search', [])
        found[name] = [h['id'] for h in hits]
        if i % 200 == 0:
            print('  searched %d / %d' % (i, len(wanted)), flush=True)
    ents = entities({q for qs in found.values() for q in qs})
    json.dump(cache, open(CACHE, 'w'))

    resolved, rejected = {}, []
    for name, qs in found.items():
        best = None
        for rank, q in enumerate(qs):
            e = ents.get(q, {})
            k = kind(e)
            if not k:
                continue
            label = e.get('labels', {}).get('en', {}).get('value', '')
            score = (bool(ids(e, 'P136') & wanted[name]),           # tagged with the genre
                     label.lower() == name.lower(),                    # exact name
                     len(e.get('sitelinks', {})),                      # best documented
                     -rank)
            if best is None or score > best[0]:
                best = (score, q, k)
        if best:
            resolved[name] = (best[1], best[2])
        else:
            rejected.append((name, 'no musician or group of that name on Wikidata'))

    arts = {}
    for name, (q, k) in resolved.items():
        e = ents[q]
        country = next(iter(ids(e, 'P495') or ids(e, 'P27') or ids(e, 'P740')), '')
        img = claims(e, 'P18')
        arts[q] = dict(wikidata_id=q, name=e.get('labels', {}).get('en', {}).get('value', name),
                       kind=k, start=year(e, 'P571', 'P2031', 'P569'), country=country,
                       image=img[0] if img else '', sitelinks=len(e.get('sitelinks', {})))
    countries = {c for a in arts.values() for c in [a['country']] if c}
    labels = entities(countries)
    for a in arts.values():
        if a['country']:
            a['country'] = labels.get(a['country'], {}).get('labels', {}).get('en', {}).get('value', '')
    json.dump(cache, open(CACHE, 'w'))

    with open(os.path.join(HERE, 'artists.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['wikidata_id', 'name', 'kind', 'start', 'country', 'image', 'sitelinks'])
        w.writeheader()
        w.writerows(sorted(arts.values(), key=lambda a: a['name'].lower()))
    with open(os.path.join(HERE, 'genre-artists.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['genre_id', 'artist_id'])
        for p in picks:
            seen = set()
            for n in [a.strip() for a in p['artists'].split('|') if a.strip()]:
                if n in resolved and resolved[n][0] not in seen:
                    seen.add(resolved[n][0])
                    w.writerow([p['genre_id'], resolved[n][0]])
    with open(os.path.join(HERE, 'artists-rejected.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['name', 'genres', 'reason'])
        for n, why in sorted(rejected):
            w.writerow([n, ' '.join(sorted(wanted[n])), why])
    print('%d verified, %d rejected' % (len(arts), len(rejected)))


if __name__ == '__main__':
    main()
