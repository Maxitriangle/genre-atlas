#!/usr/bin/env python3
"""Fetch the lead of each genre's English Wikipedia article for the dossier.

For every genre of genre-import.csv, reads its English Wikipedia sitelink
from Wikidata (50 per request), then the article's lead as plain text from
Wikipedia (20 per request, the API's limit for leads).

    python3 data/wikipedia-fetch.py

Writes genre-descriptions.csv: wikidata_id, wikipedia_title, status, text.
Status is "ok", "no article" (no English sitelink), "section" (the sitelink
redirects to a section of a broader article, whose lead would describe
another genre) or "empty". The text keeps whole paragraphs, the first one
always, the next ones while the total stays under MAX characters; paragraphs
are separated by a blank line, which is how the dossier splits them.

Wikipedia text is CC BY-SA 4.0: the site credits it on the dossier, with a
link to the article.
"""
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'genre-descriptions.csv')
UA = 'GenreAtlas/0.8 (personal non-commercial project; https://github.com/Maxitriangle/genre-atlas)'
MAX = 1200


def get(url, tries=10):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except urllib.error.HTTPError as e:
            wait = min(300, 10 * 2 ** attempt)
            after = e.headers.get('Retry-After') if e.headers else None
            if after and after.isdigit():
                wait = max(wait, int(after))
        except Exception:
            wait = min(300, 10 * 2 ** attempt)
        sys.stderr.write('  retry in %ds: %s\n' % (wait, url[:100]))
        time.sleep(wait)
    sys.exit('giving up on ' + url)


def sitelinks(qids):
    out = {}
    for i in range(0, len(qids), 50):
        data = get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(dict(
            action='wbgetentities', ids='|'.join(qids[i:i + 50]), props='sitelinks',
            sitefilter='enwiki', format='json')))
        for qid, ent in data.get('entities', {}).items():
            link = ent.get('sitelinks', {}).get('enwiki')
            if link:
                out[qid] = link['title']
        time.sleep(1)
    return out


def tidy(text):
    """Plain-text leads keep the holes left by pronunciations and footnotes."""
    text = re.sub(r'\(\s*[;,]?\s*\)', '', text)          # "( )" or "(; )"
    text = re.sub(r'\(\s*[;,]\s*', '(', text)
    text = re.sub(r'[ \t]+([,.;:])', r'\1', text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    paras = [p.strip() for p in text.split('\n') if p.strip()]
    keep = []
    for p in paras:
        if keep and sum(len(k) for k in keep) + len(p) > MAX:
            break
        keep.append(p)
    return '\n\n'.join(keep)


def leads(titles):
    out = {}
    for i in range(0, len(titles), 20):
        batch = titles[i:i + 20]
        data = get('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode(dict(
            action='query', prop='extracts|pageprops', exintro=1, explaintext=1,
            exlimit=20, ppprop='disambiguation', redirects=1, titles='|'.join(batch),
            format='json', formatversion=2)))
        q = data.get('query', {})
        # Follow each asked title through normalisation and redirects.
        norm = {n['from']: n['to'] for n in q.get('normalized', [])}
        redir = {r['from']: r for r in q.get('redirects', [])}
        pages = {p['title']: p for p in q.get('pages', [])}
        for t in batch:
            t2 = norm.get(t, t)
            r = redir.get(t2)
            if r and r.get('tofragment'):
                out[t] = ('section', r['to'], '')
                continue
            final = r['to'] if r else t2
            p = pages.get(final, {})
            text = tidy(p.get('extract', '') or '')
            if 'disambiguation' in p.get('pageprops', {}) or not text:
                out[t] = ('empty', final, '')
            else:
                out[t] = ('ok', final, text)
        time.sleep(1)
    return out


def main():
    genres = list(csv.DictReader(open(os.path.join(HERE, 'genre-import.csv'), encoding='utf-8')))
    qids = [g['wikidata_id'] for g in genres]
    links = sitelinks(qids)
    print('%d genres, %d with an English article' % (len(qids), len(links)), flush=True)
    got = leads(sorted(set(links.values())))
    rows = []
    for q in sorted(qids):
        if q not in links:
            rows.append(dict(wikidata_id=q, wikipedia_title='', status='no article', text=''))
            continue
        status, title, text = got.get(links[q], ('empty', links[q], ''))
        rows.append(dict(wikidata_id=q, wikipedia_title=title, status=status, text=text))
    with open(OUT, 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['wikidata_id', 'wikipedia_title', 'status', 'text'])
        w.writeheader()
        w.writerows(rows)
    count = {}
    for r in rows:
        count[r['status']] = count.get(r['status'], 0) + 1
    print(', '.join('%d %s' % (n, s) for s, n in sorted(count.items())))


if __name__ == '__main__':
    main()
