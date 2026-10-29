#!/usr/bin/env python3
"""Propose a listening example for the genres that are still silent.

Many silent genres are traditions or forms (oberek, gamelan degung, Mozarabic
chant, capriccio) that one recognises by a piece rather than by a name, so
they have no key artist to lend them a song. For each of them, YouTube is
searched for the genre's own name, and up to three videos are kept, in
YouTube's order, as candidates. Nothing is shown on the site before Maxime
accepts one, in WordPress (Genres > Listening examples); a rejected video
makes way for the next.

A video is a candidate when:
- its title holds the genre's name (or its MusicBrainz name), as a whole;
- it is not a lesson, a reaction, a "type beat", a cover, a karaoke, a
  sped-up or slowed copy, a trailer, an interview, a news item or a list;
- it lasts from 1 to 15 minutes: a piece, not an hour-long compilation;
- YouTube allows it to be embedded (oEmbed answers).

A genre is silent when none of its key artists in artist-import.csv has a
song, and when artists-mb.py found it none either (artists-mb.csv).

    python3 data/genre-examples.py [sample]   # resumes from its cache

Writes genre-examples.csv (wikidata_id, genre, candidates as JSON: youtube,
title, channel, length), read by wikidata-build.py into the column
"examples" of genre-import.csv. YouTube answers are cached in
.examples-cache.json (not versioned).
"""
import csv
import html
import importlib.util
import json
import os
import random
import re
import sys
import unicodedata
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('listen_tracks', os.path.join(HERE, 'listen-tracks.py'))
lt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lt)
lt.CACHE = os.path.join(HERE, '.examples-cache.json')
lt.cache = json.load(open(lt.CACHE)) if os.path.exists(lt.CACHE) else {}

OUT = os.path.join(HERE, 'genre-examples.csv')
KEEP = 3
NOT_A_PIECE = re.compile(r'\b(how to|lesson|lessons|tutorial|learn|learning|reaction|reacts?|type beat|karaoke|'
                         r'nightcore|slowed|sped up|8d|bass boosted|trailer|teaser|interview|podcast|explained|'
                         r'history of|documentary|vlog|unboxing|review|cover|what is|news|picks|top \d+|best of|compilation|playlist|'
                         r'for the first time|i made)\b', re.I)


def seconds(text):
    parts = [int(p) for p in re.findall(r'\d+', text or '')]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total


def search(query):
    """The results of a YouTube search page, with their length."""
    q = urllib.parse.urlencode({'search_query': query, 'sp': 'EgIQAQ=='})   # videos only
    page = lt.fetch('https://www.youtube.com/results?' + q, browser=True, json_out=False, pause=1.0)
    return page or []


def videos(page):
    """Replaces listen-tracks' extractor, to keep each video's length."""
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
                            'length': (v.get('lengthText') or {}).get('simpleText', '')})
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    walk(json.loads(m.group(1)))
    return out[:20]


def words(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower().replace('&', ' and ')
    return ' %s ' % re.sub(r'[^a-z0-9]+', ' ', s).strip()


def holds(title, name):
    """The name as a whole in the title: "oberek" in "Mazowsze - Oberek",
    not "son" in "Sonata"."""
    n = words(name)
    return n.strip() != '' and n in words(title)


def plain(s):
    """No straight quote nor backslash: JSON would escape them with a
    backslash, which the importer's CSV reader takes for its own escape."""
    return s.replace('\\', '/').replace('"', '”')


def candidates(names):
    found, seen = [], set()
    for name in names:
        for v in search(name):
            title = html.unescape(v['title'])
            length = seconds(v['length'])
            if v['id'] in seen or not holds(title, name) or NOT_A_PIECE.search(title) or not 60 <= length <= 900:
                continue
            seen.add(v['id'])
            ok = lt.fetch('https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote('https://www.youtube.com/watch?v=' + v['id']), pause=0.2)
            if ok and 'status' not in ok:
                found.append({'youtube': v['id'], 'title': plain(title), 'channel': plain(v['channel']), 'length': v['length']})
            if len(found) >= KEEP:
                return found
    return found


def main():
    sample = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    rows = lambda n: list(csv.DictReader(open(os.path.join(HERE, n), encoding='utf-8')))
    sound = set()
    for r in rows('artist-import.csv'):
        if r['song_deezer'] or r['song_youtube']:
            sound.update(r['genres'].split('|'))
    # Genres artists-mb.py gave artists with a song to, before artists-build.py
    # carried them into artist-import.csv.
    if os.path.exists(os.path.join(HERE, 'artists-mb.csv')):
        sound.update(r['genre_id'] for r in rows('artists-mb.csv') if r['deezer_track'] or r['youtube'])
    mb_names = {}
    mb_cache = os.path.join(HERE, '.mb-cache.json')
    if os.path.exists(mb_cache):          # the MusicBrainz names artists-mb.py looked up
        for url, data in json.load(open(mb_cache)).items():
            if '/ws/2/genre/all' in url:
                mb_names.update((g['id'], g['name']) for g in data.get('genres', []))
    silent = [g for g in rows('genre-import.csv') if g['wikidata_id'] not in sound]
    if sample:
        silent = random.Random(1).sample(silent, sample)
    out = []
    try:
        for i, g in enumerate(silent, 1):
            names = [g['name']] + [n for n in [mb_names.get(g['musicbrainz_id'])] if n and lt.norm(n) != lt.norm(g['name'])]
            found = candidates(names)
            if found:
                out.append({'wikidata_id': g['wikidata_id'], 'genre': g['name'], 'candidates': json.dumps(found, ensure_ascii=False)})
            sys.stderr.write('%d/%d %s: %d\n' % (i, len(silent), g['name'], len(found)))
            if i % 20 == 0:
                lt.save()
    finally:
        lt.save()
    with open(OUT, 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['wikidata_id', 'genre', 'candidates'])
        w.writeheader()
        w.writerows(out)
    print('%d silent genres: %d with at least one candidate video (%d candidates in all)' % (
        len(silent), len(out), sum(len(json.loads(r['candidates'])) for r in out)))


lt.extract_videos = videos

if __name__ == '__main__':
    main()
