#!/usr/bin/env python3
"""Pick one song per key artist for the dossier's Listen section.

The song is the artist's most played track on Deezer: an outside, repeatable
measure rather than a title typed from memory. The artist is the one Wikidata
links to (artist-streaming.csv, from listen-ids.py); only an artist without
that link is searched by name, and marked so for review.

On Deezer's top list the first track is kept whose main artist is the artist
itself and which is not a live take, a remix, a demo or a karaoke version.
Its title is shown without "(Remastered 2011)" and the like.

The same song is then looked up on YouTube, so the dossier can play the
whole list in one embedded player. A video is kept only if its title holds
the song's title, if it comes from the artist (its Wikidata channel, or a
channel named after the artist, such as "Nirvana - Topic" or "NirvanaVEVO")
or names the artist, if it is not a cover, a live take or a remix, and if
YouTube allows it to be embedded.

    python3 data/listen-tracks.py [workers]      # resumes from its cache

Writes artist-songs.csv: wikidata_id, artist, song_title, deezer_track,
youtube, match (how the Deezer artist was found: "wikidata", "name", or
"name-ambiguous" when namesakes share the name and the most followed was kept) and
youtube_channel (for review). Answers are cached in .listen-cache.json.
"""
import csv
import html
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'GenreAtlas/0.9 (personal non-commercial project; https://github.com/Maxitriangle/genre-atlas)'
BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
CACHE = os.path.join(HERE, '.listen-cache.json')
OUT = os.path.join(HERE, 'artist-songs.csv')

# Words that make a track or a video another take of the song.
OTHER_TAKE = re.compile(r'\b(live|remix|rmx|demo|karaoke|instrumental|acapella|a cappella|rehearsal|'
                        r'cover|reaction|tutorial|lesson|nightcore|slowed|sped up|8d|bass boosted|'
                        r'mix|medley|session|unplugged|acoustic|interview|trailer|teaser|full album)\b', re.I)
# Parts of a title that only name an edition of the same recording.
EDITION = re.compile(r'\s*[\(\[][^\)\]]*\b(remaster|remastered|version|mono|stereo|edit|deluxe|bonus|single|'
                     r'from|feat\.?|ft\.?|with|original|anniversary|explicit|clean|bof|soundtrack)\b[^\)\]]*[\)\]]'
                     r'|\s+-\s+.*\b(remaster|remastered|version|mono|stereo|edit|single|from)\b.*$', re.I)

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
lock = threading.Lock()


def save():
    with lock:
        tmp = CACHE + '.tmp'
        json.dump(cache, open(tmp, 'w'))
        os.replace(tmp, CACHE)


def fetch(url, browser=False, json_out=True, pause=0.0):
    with lock:
        if url in cache:
            return cache[url]
    for attempt in range(8):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': BROWSER if browser else UA, 'Accept-Language': 'en'})
            raw = urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
            data = json.loads(raw) if json_out else raw
            if isinstance(data, dict) and data.get('error', {}).get('code') == 4:   # Deezer quota
                raise IOError('Deezer quota')
            break
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404) and 'oembed' in url:
                data = {'status': e.code}                  # not embeddable, or gone
                break
            wait = min(300, 5 * 2 ** attempt)
        except Exception:
            wait = min(300, 5 * 2 ** attempt)
        sys.stderr.write('  retry in %ds: %s\n' % (wait, url[:110]))
        time.sleep(wait)
    else:
        return None
    time.sleep(pause)
    if not json_out:
        data = extract_videos(data)
    with lock:
        cache[url] = data
    return data


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'^the\s+', '', s.replace('&', 'and'))
    return re.sub(r'[^a-z0-9]', '', s)


def clean_title(t):
    prev = None
    while prev != t:
        prev, t = t, EDITION.sub('', t).strip()
    return t


def is_other_take(title, song=''):
    """A take word counts only when the song's own title does not carry it."""
    return any(not re.search(r'\b%s\b' % re.escape(m.group(0)), song, re.I) for m in OTHER_TAKE.finditer(title))


# ---- Deezer -----------------------------------------------------------------

def deezer_artist_by_name(name):
    res = fetch('https://api.deezer.com/search/artist?' + urllib.parse.urlencode({'q': name, 'limit': 25}), pause=0.12) or {}
    same = [a for a in res.get('data', []) if norm(a.get('name')) == norm(name)]
    if not same:
        return '', ''
    # Namesakes: the most followed is kept, and the row is flagged for review.
    return str(max(same, key=lambda a: a.get('nb_fan', 0))['id']), 'name' if len(same) == 1 else 'name-ambiguous'


def deezer_song(artist_id):
    res = fetch('https://api.deezer.com/artist/%s/top?limit=25' % artist_id, pause=0.12) or {}
    for t in res.get('data', []):
        if str(t.get('artist', {}).get('id')) != str(artist_id):
            continue                                   # a feature on someone else's track
        title = clean_title(t.get('title', ''))
        if not title or is_other_take(t.get('title', '')) or is_other_take(t.get('album', {}).get('title', ''), title):
            continue
        return title, str(t['id'])
    return '', ''


# ---- YouTube ----------------------------------------------------------------

def extract_videos(page):
    """The first results of a YouTube search page, from its ytInitialData."""
    m = re.search(r'var ytInitialData = (\{.*?\});</script>', page, re.S)
    if not m:
        return []
    out = []

    def walk(o):
        if isinstance(o, dict):
            v = o.get('videoRenderer')
            if isinstance(v, dict) and v.get('videoId'):
                owner = (v.get('ownerText') or v.get('longBylineText') or {}).get('runs', [{}])[0]
                out.append({'id': v['videoId'],
                            'title': ''.join(r.get('text', '') for r in v.get('title', {}).get('runs', [])),
                            'channel': owner.get('text', ''),
                            'channel_id': owner.get('navigationEndpoint', {}).get('browseEndpoint', {}).get('browseId', '')})
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    walk(json.loads(m.group(1)))
    return out[:12]


def youtube_video(artist, title, channels):
    q = urllib.parse.urlencode({'search_query': '%s %s' % (artist, title), 'sp': 'EgIQAQ=='})   # videos only
    found = fetch('https://www.youtube.com/results?' + q, browser=True, json_out=False, pause=1.0) or []
    a, t = norm(artist), norm(title)
    own, named = [], []
    for v in found:
        vt, ch = html.unescape(v['title']), v['channel']
        if t not in norm(vt) or is_other_take(vt, title):
            continue
        if v['channel_id'] in channels or (a and norm(ch).startswith(a)):
            own.append(v)
        elif a and a in norm(vt):
            named.append(v)                            # a label's or a fan's upload
    for v in own + named:                              # the artist's own channel first
        ch = v['channel']
        ok = fetch('https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote('https://www.youtube.com/watch?v=' + v['id']), pause=0.2)
        if ok and 'status' not in ok:
            return v['id'], ch
    return '', ''


# ---- main -------------------------------------------------------------------

def one(row, ids):
    q, name = row['wikidata_id'], row['name']
    s = ids.get(q, {})
    dz, match = (s.get('deezer') or '').split('|')[0], 'wikidata'
    if not dz:
        dz, match = deezer_artist_by_name(name)
    title, track = deezer_song(dz) if dz else ('', '')
    yt, ch = youtube_video(name, title, set((s.get('youtube_channel') or '').split('|')) - {''}) if title else ('', '')
    return {'wikidata_id': q, 'artist': name, 'song_title': title, 'deezer_track': track,
            'youtube': yt, 'match': match if track else '', 'youtube_channel': ch}


def main():
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    artists = list(csv.DictReader(open(os.path.join(HERE, 'artists.csv'))))
    ids = {r['wikidata_id']: r for r in csv.DictReader(open(os.path.join(HERE, 'artist-streaming.csv')))}
    rows, done = [None] * len(artists), [0]

    def job(i):
        rows[i] = one(artists[i], ids)
        with lock:
            done[0] += 1
            n = done[0]
        if n % 50 == 0:
            save()
            sys.stderr.write('%d/%d\n' % (n, len(artists)))

    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(job, range(len(artists))))
    save()
    with open(OUT, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print('%d artists: %d with a Deezer song (%d found by name, %d of them among namesakes), %d also on YouTube' % (
        len(rows), sum(1 for r in rows if r['deezer_track']), sum(1 for r in rows if r['match'].startswith('name')),
        sum(1 for r in rows if r['match'] == 'name-ambiguous'),
        sum(1 for r in rows if r['youtube'])))


if __name__ == '__main__':
    main()
