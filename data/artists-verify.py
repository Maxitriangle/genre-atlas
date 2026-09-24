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
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'GenreAtlas/0.8 (personal non-commercial project; https://github.com/Maxitriangle/genre-atlas)'
API = 'https://www.wikidata.org/w/api.php?'
CACHE = os.path.join(HERE, '.artists-cache.json')

HUMAN = 'Q5'
# Musical group and the kinds of group Wikidata types bands with. Every ID
# here was checked against its English label: an earlier list typed from
# memory held "record label" and "musical work/composition", which let labels
# and albums through as bands.
GROUPS = {'Q215380',   # musical group
          'Q2088357',  # musical ensemble
          'Q5741069',  # rock band
          'Q56816954', # heavy metal band
          'Q9212979',  # musical duo
          'Q281643',   # musical trio
          'Q216337',   # boy band
          'Q641066',   # girl group
          'Q42998',    # orchestra
          'Q131186',   # choir
          'Q20819922'} # opera company
# Occupations that make a human count as a musician, checked the same way.
MUSIC_JOBS = {'Q639669', 'Q177220', 'Q36834', 'Q488205', 'Q753110', 'Q855091',
              'Q130857', 'Q386854', 'Q158852', 'Q486748', 'Q1259917', 'Q2252262',
              'Q1075651', 'Q806349', 'Q183945', 'Q584301', 'Q1198887', 'Q12800682',
              'Q765778', 'Q1415090', 'Q2643890', 'Q1643514', 'Q2865819', 'Q6168364',
              'Q1327329', 'Q1076502'}

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


KEEP = ('P31', 'P279', 'P106', 'P136', 'P1303', 'P264', 'P495', 'P27', 'P740', 'P18', 'P571', 'P2031', 'P569')


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


# The one-line description a search result carries ("American hardcore punk
# band", "Japanese idol group", "Cuban singer"). Trusted only when the name
# matched exactly, since it is a hint and not a statement.
GROUP_WORDS = re.compile(r'\b(band|duo|trio|quartet|quintet|sextet|ensemble|orchestra|choir|big band)\b'
                         r'|\bmusic(al)? (group|collective|project)\b'
                         r'|\b(pop|rock|rap|hip hop|hip-hop|girl|boy|vocal|folk|jazz|punk|metal|idol|dance|electronic) group\b', re.I)
MUSIC_WORDS = re.compile(r'\b(musician|singer|songwriter|rapper|composer|DJ|disc jockey|guitarist|pianist|drummer|'
                         r'bassist|violinist|cellist|saxophonist|trumpeter|percussionist|record producer|music producer|'
                         r'vocalist|organist|conductor|accordionist|harpist|flautist|beatmaker|bandleader|griot|'
                         r'MC|oud player|sitar player|tabla player)\b', re.I)
GROUP_CLASSES = set(GROUPS)   # grown in main() with the subclasses Wikidata uses


def kind(ent, desc='', exact=False):
    """('group' or 'person', 2 if Wikidata's own statements say so, 1 if only
    the search description does), or (None, 0)."""
    p31 = ids(ent, 'P31')
    if p31 & GROUP_CLASSES:
        return 'group', 2
    # A music occupation, or anything only musicians carry: a genre, an
    # instrument, a record label.
    if HUMAN in p31 and (ids(ent, 'P106') & MUSIC_JOBS or ids(ent, 'P136')
                         or ids(ent, 'P1303') or ids(ent, 'P264')):
        return 'person', 2
    if exact and desc:
        if HUMAN in p31 and MUSIC_WORDS.search(desc):
            return 'person', 1
        if HUMAN not in p31 and GROUP_WORDS.search(desc):
            return 'group', 1
    return None, 0


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
        found[name] = hits
        if i % 200 == 0:
            print('  searched %d / %d' % (i, len(wanted)), flush=True)
    ents = entities({h['id'] for hs in found.values() for h in hs})
    # Bands are often typed with a subclass of "musical group" ("hardcore punk
    # band", "idol group") that no fixed list can hold: read those classes.
    classes = {c for e in ents.values() for c in ids(e, 'P31')} - GROUP_CLASSES - {HUMAN}
    for c, e in entities(classes).items():
        if ids(e, 'P279') & GROUPS:
            GROUP_CLASSES.add(c)
    json.dump(cache, open(CACHE, 'w'))

    resolved, rejected = {}, []
    for name, hits in found.items():
        best = None
        for rank, h in enumerate(hits):
            q, e = h['id'], ents.get(h['id'], {})
            exact = h.get('match', {}).get('text', '').lower() == name.lower()
            k, sure = kind(e, h.get('description', ''), exact)
            if not k:
                continue
            label = e.get('labels', {}).get('en', {}).get('value', '')
            # A statement beats a description: "Pedro Infante" the film star is
            # not outranked by a namesake whose only claim is "Mexican singer".
            score = (sure,
                     bool(ids(e, 'P136') & wanted[name]),           # tagged with the genre
                     label.lower() == name.lower(),                    # exact name
                     len(e.get('sitelinks', {})),                      # best documented
                     -rank)
            if best is None or score > best[0]:
                best = (score, q, k)
        if best:
            resolved[name] = (best[1], best[2])
        else:
            # Say what Wikidata offered, so a rejection can be judged by eye.
            seen = '; '.join('%s %s (%s)' % (h['id'], h.get('label', ''), h.get('description', '—')) for h in hits[:3])
            rejected.append((name, 'no musician or group of that name on Wikidata' + (' — found: ' + seen if seen else ' — no result')))

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
