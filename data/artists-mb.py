#!/usr/bin/env python3
"""Give a sound to the genres that have none, with artists from MusicBrainz.

A genre is silent when none of its key artists has a song (781 of 2,098 on
28/10/2026: most never had key artists, a few have artists Deezer does not
know). Every genre of the atlas has a MusicBrainz genre ID, and MusicBrainz
users tag artists and releases with genres: that tag is the source here, an
outside, checkable fact rather than a name typed from memory.

For each silent genre:
- its MusicBrainz name (genre lookup), and the artists tagged with exactly
  that name, either directly or on at least three of their release groups;
- each candidate is looked up on Deezer by name (or alias); the best followed
  come first;
- the MusicBrainz artist must link to Wikidata (the plugin keys artists by
  their Wikidata ID). When it also links to Deezer, that link wins over the
  name search;
- its song comes from one of its release groups tagged with the genre when
  Deezer has it, so it is in the genre and not only the artist's biggest
  hit; otherwise it is picked as in listen-tracks.py (best long-run Deezer
  rank, no live take or remix). Then the same song on YouTube. An artist found by name
  among Deezer namesakes keeps its song only if YouTube has it on the
  artist's own channel.
The genre keeps its key artists and is topped up to 8 with artists that
have a song.

    python3 data/artists-mb.py [sample]    # resumes from its caches

MusicBrainz asks for one request per second; its answers are cached in
.mb-cache.json, Deezer's and YouTube's in .listen-cache.json (neither is
versioned). Writes artists-mb.csv, read by artists-build.py.
"""
import csv
import importlib.util
import json
import os
import random
import sys
import threading
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('listen_tracks', os.path.join(HERE, 'listen-tracks.py'))
lt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lt)

MB_CACHE = os.path.join(HERE, '.mb-cache.json')
OUT = os.path.join(HERE, 'artists-mb.csv')
MAX = 8           # key artists per genre, as in artists-picks.csv
TRIED = 30        # candidates looked up on Deezer per genre
RELEASES = 3      # tagged release groups that make an untagged artist count
GROUP = {'Group', 'Orchestra', 'Choir'}

mb_cache = json.load(open(MB_CACHE)) if os.path.exists(MB_CACHE) else {}
mb_lock = threading.Lock()
mb_last = [0.0]


def mb(path, **params):
    """One MusicBrainz request, at most one per second across threads."""
    url = 'https://musicbrainz.org/ws/2/' + path + '?' + urllib.parse.urlencode(dict(params, fmt='json'))
    with mb_lock:
        if url in mb_cache:
            return mb_cache[url]
        for attempt in range(8):
            time.sleep(max(0, mb_last[0] + 1.1 - time.time()))
            mb_last[0] = time.time()
            try:
                req = urllib.request.Request(url, headers={'User-Agent': lt.UA, 'Accept': 'application/json'})
                data = json.loads(urllib.request.urlopen(req, timeout=40).read().decode('utf-8'))
                break
            except urllib.error.HTTPError as e:
                if e.code in (400, 404):
                    data = {}
                    break
            except Exception:
                pass
            wait = min(120, 3 * 2 ** attempt)
            sys.stderr.write('  MusicBrainz retry in %ds: %s\n' % (wait, url[:110]))
            time.sleep(wait)
        else:
            return {}
        mb_cache[url] = data
        if len(mb_cache) % 50 == 0:
            tmp = MB_CACHE + '.tmp'
            json.dump(mb_cache, open(tmp, 'w'))
            os.replace(tmp, MB_CACHE)
        return data


def tagged(tags, names):
    return sum(t.get('count', 0) for t in tags or [] if lt.norm(t.get('name')) in names)


def candidates(genre):
    """MusicBrainz artists tagged with the genre, best tagged first.

    An artist counts when it carries the tag itself, or when at least
    RELEASES of its release groups do: a single tagged album is how a star
    with one track in the style would slip in (Drake for zess)."""
    g = mb('genre/' + genre['musicbrainz_id']) if genre['musicbrainz_id'] else {}
    names = {lt.norm(n) for n in (g.get('name'), genre['name']) if n}
    found = {}

    def add(a):
        return found.setdefault(a['id'], dict(a, votes=0, albums=[]))
    for name in sorted({g.get('name') or genre['name'], genre['name']}):
        q = 'tag:"%s"' % name.replace('"', '')
        for a in mb('artist', query=q, limit=100).get('artists', []):
            n = tagged(a.get('tags'), names)
            if n:
                add(a)['votes'] += n
        for rg in mb('release-group', query=q, limit=100).get('release-groups', []):
            if not tagged(rg.get('tags'), names):
                continue
            for c in rg.get('artist-credit', []):
                a = c.get('artist', {})
                if a.get('id') and a.get('name') not in ('Various Artists', '[unknown]'):
                    add(a)['albums'].append(rg.get('title', ''))
    kept = [a for a in found.values() if a['votes'] or len(a['albums']) >= RELEASES]
    for a in kept:
        a['weight'] = a['votes'] + len(a['albums'])
    return sorted(kept, key=lambda a: -a['weight']), names


def genre_song(artist_id, name, albums):
    """The artist's best ranked track from one of its tagged release groups,
    so the song is in the genre and not only the artist's biggest hit."""
    best = None
    for album in albums[:5]:
        q = 'artist:"%s" album:"%s"' % (name.replace('"', ''), album.replace('"', ''))
        res = lt.fetch('https://api.deezer.com/search/track?' + urllib.parse.urlencode({'q': q, 'limit': 25}), pause=0.12) or {}
        for t in res.get('data', []):
            if str(t.get('artist', {}).get('id')) != str(artist_id) or lt.norm(t.get('album', {}).get('title')) != lt.norm(album):
                continue
            title = lt.clean_title(t.get('title', ''))
            if not title or len(title) > 80 or lt.is_other_take(t.get('title', '')):
                continue
            if not best or t.get('rank', 0) > best[2]:
                best = (title, str(t['id']), t.get('rank', 0))
    return best[:2] if best else ('', '')


def deezer_match(a):
    """Deezer artists bearing the artist's name or one of its aliases."""
    same = {}
    for n in [a['name']] + [x.get('name') for x in a.get('aliases', [])]:
        if not n:
            continue
        res = lt.fetch('https://api.deezer.com/search/artist?' + urllib.parse.urlencode({'q': n, 'limit': 25}), pause=0.12) or {}
        for d in res.get('data', []):
            if lt.norm(d.get('name')) == lt.norm(n) and lt.norm(n):
                same[str(d['id'])] = d
        if same:
            break
    return list(same.values())


def links(mbid):
    """Wikidata ID and Deezer artist IDs that MusicBrainz links to."""
    a = mb('artist/' + mbid, inc='url-rels')
    qid, dz = '', []
    for r in a.get('relations', []):
        u = r.get('url', {}).get('resource', '')
        if '://www.wikidata.org/wiki/Q' in u:
            qid = u.rsplit('/', 1)[1]
        elif 'deezer.com/' in u and '/artist/' in u:
            dz.append(u.rstrip('/').rsplit('/', 1)[1])
    return qid, dz, a


def one(genre, keep, known):
    """Up to MAX - len(keep) artists with a song for one silent genre."""
    cands, _ = candidates(genre)
    scored = []
    for a in cands[:TRIED]:
        same = deezer_match(a)
        if same:
            scored.append((max(d.get('nb_fan', 0) for d in same), a, same))
    scored.sort(key=lambda x: -x[0])
    out = []
    for fans, a, same in scored:
        if len(out) >= MAX - len(keep):
            break
        qid, dz, full = links(a['id'])
        if not qid or qid in keep or any(r['wikidata_id'] == qid for r in out):
            continue
        if dz:
            artist, match = dz[0], 'musicbrainz'
        else:
            best = max(same, key=lambda d: d.get('nb_fan', 0))
            artist, match = str(best['id']), 'name' if len(same) == 1 else 'name-ambiguous'
        name = known.get(qid, {}).get('name') or a['name']
        title, track = genre_song(artist, name, a['albums'])
        if not title:
            title, track = lt.deezer_song(artist, name)
        if not title:
            continue
        yt, ch, own = lt.youtube_video(name, title, set())
        if match == 'name-ambiguous' and not own:
            continue                               # the song may be a namesake's
        begin = (full.get('life-span') or {}).get('begin') or ''
        out.append(dict(genre_id=genre['wikidata_id'], genre=genre['name'], wikidata_id=qid,
                        musicbrainz_id=a['id'], name=name,
                        kind='group' if full.get('type') in GROUP else 'person',
                        start=begin[:4], country=(full.get('area') or {}).get('name', ''),
                        weight=a['weight'], deezer_fans=fans, song_title=title, deezer_track=track,
                        youtube=yt, match=match, youtube_channel=ch))
    return out


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    rows = lambda n: list(csv.DictReader(open(os.path.join(HERE, n), encoding='utf-8')))
    genres = rows('genre-import.csv')
    art = {}
    for r in rows('artist-import.csv'):
        for g in r['genres'].split('|'):
            art.setdefault(g, []).append(r)
    known = {r['wikidata_id']: r for r in rows('artists.csv')}
    silent = [g for g in genres if not any(r['song_deezer'] or r['song_youtube'] for r in art.get(g['wikidata_id'], []))]
    if limit:
        silent = random.Random(1).sample(silent, limit)     # a trial on a fixed sample
    out = []
    try:
        for i, g in enumerate(silent, 1):
            got = one(g, {r['wikidata_id'] for r in art.get(g['wikidata_id'], [])}, known)
            out += got
            sys.stderr.write('%d/%d %s: %d\n' % (i, len(silent), g['name'], len(got)))
            if i % 10 == 0:
                lt.save()
    finally:
        lt.save()
        json.dump(mb_cache, open(MB_CACHE, 'w'))
    fields = ['genre_id', 'genre', 'wikidata_id', 'musicbrainz_id', 'name', 'kind', 'start', 'country', 'weight',
              'deezer_fans', 'song_title', 'deezer_track', 'youtube', 'match', 'youtube_channel']
    with open(OUT, 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(out)
    voiced = {r['genre_id'] for r in out}
    print('%d silent genres: %d now have a sound, with %d artists (%d new to the atlas, %d also on YouTube)' % (
        len(silent), len(voiced), len(out), sum(1 for r in out if r['wikidata_id'] not in known),
        sum(1 for r in out if r['youtube'])))


if __name__ == '__main__':
    main()
