#!/usr/bin/env python3
"""Keep a wide artist in a genre only when MusicBrainz agrees with Wikidata,
then top the genres up with MusicBrainz's own artists.

artists-wide.py ranks Wikidata's artists by how well documented they are,
which lets stars with a stray genre statement through (Cher in house music,
Flo Rida in techno). MusicBrainz users tag artists with genres and vote on
them: an artist stays in a genre when one of its MusicBrainz tags is that
genre or one of its subgenres in the atlas, with at least a quarter of the
votes of its best tag (artists-mb.py's rule: one vote for "organic house" on
Daft Punk, tagged French house twenty times, is noise). An artist MusicBrainz
does not know, or has not tagged, is left out: nothing confirms it.

Then each genre under 100 is topped up with the artists MusicBrainz tags with
it (artists-mb.py's candidates: the tag with a quarter of the votes, or three
tagged release groups), best tagged first, when MusicBrainz links them to
Wikidata (the plugin keys artists by their Wikidata ID).

    python3 data/artists-cross.py [family QID ...]     # default: Q9778

Reads artists-wide.csv and genre-artists-wide.csv; writes
artists-checked.csv (the columns of artists-wide.csv) and
genre-artists-checked.csv (genre_id, artist_id, rank, source: "both" or
"musicbrainz"), read by artists-build.py in their place. MusicBrainz is asked
once a second; answers are cached in .mb-cache.json, as for artists-mb.py.
"""
import csv
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('artists_mb', os.path.join(HERE, 'artists-mb.py'))
am = importlib.util.module_from_spec(spec)
spec.loader.exec_module(am)
lt = am.lt

KEEP = 100


def rows(name):
    return list(csv.DictReader(open(os.path.join(HERE, name), encoding='utf-8')))


def family(families, genres):
    kids = {}
    for r in genres:
        kids.setdefault(r['parent_wikidata_id'], []).append(r)
    out, below = [], {}

    def walk(q, top):
        out.append(q)
        mine = {q}
        for k in kids.get(q, []):
            if k['featured'] and not top:
                continue                               # a tile closes the lineage
            mine |= walk(k['wikidata_id'], False)
        below[q] = mine
        return mine
    for f in families:
        walk(f, True)
    return out, below


def save():
    lt.save()
    with am.mb_lock:
        tmp = am.MB_CACHE + '.tmp'
        json.dump(am.mb_cache, open(tmp, 'w'))
        os.replace(tmp, am.MB_CACHE)


def mbid_of(qid, listed):
    """The MusicBrainz artist: Wikidata's link, else MusicBrainz's own link back."""
    for m in (listed or '').split('|'):
        if m:
            return m
    found = am.mb('url', resource='https://www.wikidata.org/wiki/' + qid, inc='artist-rels')
    for r in found.get('relations', []):
        if r.get('artist', {}).get('id'):
            return r['artist']['id']
    return ''


def main():
    families = sys.argv[1:] or ['Q9778']
    genres = rows('genre-import.csv')
    by_q = {g['wikidata_id']: g for g in genres}
    order, below = family(families, genres)
    names = {}
    for g in order:
        mbn = am.mb_genres().get(by_q[g]['musicbrainz_id'], '')
        names[g] = {lt.norm(n) for n in (mbn, by_q[g]['name']) if n}
    wide = {r['wikidata_id']: r for r in rows('artists-wide.csv')}
    links = sorted(rows('genre-artists-wide.csv'), key=lambda r: int(r['rank']))
    links = [r for r in links if r['genre_id'] in below]

    # 1. Wikidata's artists, checked against their MusicBrainz tags.
    tags, mbids = {}, {}
    todo = sorted({r['artist_id'] for r in links})
    for i, q in enumerate(todo):
        m = mbid_of(q, wide.get(q, {}).get('musicbrainz', ''))
        mbids[q] = m
        a = am.mb('artist/' + m, inc='tags') if m else {}
        tags[q] = a.get('tags') or []
        if i % 200 == 0:
            print('  checked %d / %d' % (i, len(todo)), flush=True)
            save()
    save()

    def agrees(q, g):
        want = set().union(*(names[x] for x in below[g]))
        votes = max([t.get('count', 0) for t in tags[q] if lt.norm(t.get('name')) in want] + [0])
        return votes > 0 and am.share(tags[q], votes) >= am.SHARE

    kept = {g: [] for g in order}
    for r in links:
        if agrees(r['artist_id'], r['genre_id']) and len(kept[r['genre_id']]) < KEEP:
            kept[r['genre_id']].append((r['artist_id'], 'both'))
    confirmed = sum(len(v) for v in kept.values())

    # 2. MusicBrainz's own artists for the genres still under 100.
    by_mbid = {m: q for q, m in mbids.items() if m}
    extra = {}
    for i, g in enumerate(order):
        if len(kept[g]) >= KEEP:
            continue
        cands, _ = am.candidates(by_q[g])
        have = {q for q, _ in kept[g]}
        for a in cands:
            if len(kept[g]) >= KEEP:
                break
            q = by_mbid.get(a['id'])
            full = None
            if not q:
                q, _, full = am.links(a['id'])
                if not q:
                    continue
                by_mbid[a['id']] = q
            if q in have:
                continue
            have.add(q)
            kept[g].append((q, 'musicbrainz'))
            if q not in wide and q not in extra:
                full = full or am.links(a['id'])[2]
                begin = (full.get('life-span') or {}).get('begin') or ''
                extra[q] = dict(wikidata_id=q, name=full.get('name') or a['name'],
                                kind='group' if full.get('type') in am.GROUP else 'person',
                                start=begin[:4], country=(full.get('area') or {}).get('name', ''),
                                image='', sitelinks='', deezer='', youtube_channel='', musicbrainz=a['id'])
        if i % 20 == 0:
            print('  topped up %d / %d' % (i, len(order)), flush=True)
            save()
    save()

    used = {q for v in kept.values() for q, _ in v}
    fields = ['wikidata_id', 'name', 'kind', 'start', 'country', 'image', 'sitelinks', 'deezer', 'youtube_channel', 'musicbrainz']
    with open(os.path.join(HERE, 'artists-checked.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for q in sorted(used, key=lambda q: int(q[1:])):
            r = dict(wide.get(q) or extra[q])
            r['musicbrainz'] = r.get('musicbrainz') or mbids.get(q, '')
            w.writerow({k: r.get(k, '') for k in fields})
    with open(os.path.join(HERE, 'genre-artists-checked.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['genre_id', 'artist_id', 'rank', 'source'])
        w.writeheader()
        for g in order:
            for i, (q, src) in enumerate(kept[g], 1):
                w.writerow({'genre_id': g, 'artist_id': q, 'rank': i, 'source': src})
    n = [len(kept[g]) for g in order]
    print('%d genres: %d Wikidata links, %d confirmed by MusicBrainz, %d added from MusicBrainz; %d artists'
          % (len(order), len(links), confirmed, sum(n) - confirmed, len(used)))
    for lo, hi in ((0, 0), (1, 7), (8, 29), (30, 99), (100, 100)):
        print('  %3d-%3d artists: %d genres' % (lo, hi, sum(1 for x in n if lo <= x <= hi)))


if __name__ == '__main__':
    main()
