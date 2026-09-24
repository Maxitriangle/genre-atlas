#!/usr/bin/env python3
"""Turn each verified artist's Commons photo into the dossier's screened portrait.

For every artist of artists.csv with an image, fetches the Commons thumbnail
at 330 px (a size Wikimedia pre-renders, as its robot policy asks), crops it
square, and screens it into a 1-bit ordered dither at 132 px. The result is a
mask: a PNG whose opaque pixels are the dots. The site colours it with the
family's colour in CSS, so one file serves every family and any photo, concert
shot or studio portrait, looks like part of the same set.

    pip install pillow
    python3 data/artists-photos.py [minutes]    # resumes; stops after [minutes]

Writes masks/<wikidata_id>.png, and artist-photos.csv with what the credit
line needs: file, author, licence and its URL. A photo whose licence cannot
be read is left out: an uncredited photo is not shown.

Stops by itself after the given number of minutes (default 300) so that a
GitHub Actions run can commit what it has before its time limit; the next run
skips every mask already written.
"""
import csv
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageEnhance, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
MASKS = os.path.join(HERE, 'masks')
OUT = os.path.join(HERE, 'artist-photos.csv')
UA = 'GenreAtlas/0.8 (personal non-commercial project; https://github.com/Maxitriangle/genre-atlas)'
SIZE, THUMB = 132, 330

# 8x8 Bayer matrix: an ordered dither reads as a printed screen, which is the
# look of the page; error diffusion would read as noise at this size.
BAYER = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
         [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
         [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
         [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]]


def fetch(url, tries=6):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return urllib.request.urlopen(req, timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                return None             # no such thumbnail: try another form
            wait = min(600, 10 * 2 ** attempt)
            after = e.headers.get('Retry-After') if e.headers else None
            if after and after.isdigit():
                wait = max(wait, int(after))
        except Exception:
            wait = min(600, 10 * 2 ** attempt)
        sys.stderr.write('  retry in %ds: %s\n' % (wait, url[:100]))
        time.sleep(wait)
    return None


def thumb_urls(filename):
    """The pre-rendered thumbnail, then the original for images too small to
    have one. Commons lays files out by the MD5 of their name."""
    name = filename.replace(' ', '_')
    h = hashlib.md5(name.encode('utf-8')).hexdigest()
    q = urllib.parse.quote(name)
    base = 'https://upload.wikimedia.org/wikipedia/commons/'
    ext = name.rsplit('.', 1)[-1].lower()
    if ext in ('svg',):
        yield '%sthumb/%s/%s/%s/%dpx-%s.png' % (base, h[0], h[:2], q, THUMB, q)
    elif ext in ('tif', 'tiff'):
        yield '%sthumb/%s/%s/%s/lossy-page1-%dpx-%s.jpg' % (base, h[0], h[:2], q, THUMB, q)
    else:
        yield '%sthumb/%s/%s/%s/%dpx-%s' % (base, h[0], h[:2], q, THUMB, q)
        yield '%s%s/%s/%s' % (base, h[0], h[:2], q)


def screen(data):
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im).convert('L')
    w, h = im.size
    s = min(w, h)
    # A portrait keeps its top, where the faces are; a landscape its centre.
    left = (w - s) // 2
    im = im.crop((left, 0, left + s, s)).resize((SIZE, SIZE), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=2)
    im = ImageEnhance.Contrast(im).enhance(1.25)
    px = im.load()
    mask = Image.new('LA', (SIZE, SIZE), (0, 0))
    mp = mask.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if px[x, y] / 255 * 64 > BAYER[y % 8][x % 8] + 0.5:
                mp[x, y] = (255, 255)
    out = io.BytesIO()
    mask.save(out, 'PNG', optimize=True)
    return out.getvalue()


def strip(html):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', html or '')).strip()


def credits(files):
    """Author and licence of each file, 50 per request, from Commons."""
    out = {}
    files = list(files)
    for i in range(0, len(files), 50):
        titles = '|'.join('File:' + f for f in files[i:i + 50])
        url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(dict(
            action='query', titles=titles, prop='imageinfo', iiprop='extmetadata',
            iiextmetadatafilter='Artist|LicenseShortName|LicenseUrl|Credit',
            format='json', formatversion=2))
        data = fetch(url)
        if not data:
            continue
        pages = json.loads(data).get('query', {}).get('pages', [])
        norm = {n['to']: n['from'] for n in json.loads(data).get('query', {}).get('normalized', [])}
        for p in pages:
            info = (p.get('imageinfo') or [{}])[0].get('extmetadata', {})
            title = p.get('title', '')[5:]
            key = norm.get('File:' + title, 'File:' + title)[5:]
            author = strip(info.get('Artist', {}).get('value')) or strip(info.get('Credit', {}).get('value'))
            # A template can carry the name twice, once visible, once hidden.
            author = re.sub(r'^(.{3,}?)\1$', r'\1', author)
            out[key] = dict(author=author[:120],
                            license=strip(info.get('LicenseShortName', {}).get('value')),
                            license_url=info.get('LicenseUrl', {}).get('value', ''))
        time.sleep(1)
    return out


def main():
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 300
    deadline = time.time() + budget * 60
    os.makedirs(MASKS, exist_ok=True)
    artists = [a for a in csv.DictReader(open(os.path.join(HERE, 'artists.csv'), encoding='utf-8')) if a['image']]
    rows = {}
    if os.path.exists(OUT):
        rows = {r['wikidata_id']: r for r in csv.DictReader(open(OUT, encoding='utf-8'))}

    todo = [a for a in artists if a['wikidata_id'] not in rows]
    print('%d artists with a photo, %d already done' % (len(artists), len(artists) - len(todo)), flush=True)
    for i in range(0, len(todo), 50):
        if time.time() > deadline:
            print('time is up, stopping here', flush=True)
            break
        batch = todo[i:i + 50]
        info = credits(a['image'] for a in batch)
        for a in batch:
            meta = info.get(a['image'])
            # Uncredited, or not under a licence we can show: leave it out.
            if not meta or not meta['license'] or not meta['author']:
                rows[a['wikidata_id']] = dict(wikidata_id=a['wikidata_id'], file=a['image'], author='',
                                              license='', license_url='', status='no credit')
                continue
            data = next((d for d in (fetch(u) for u in thumb_urls(a['image'])) if d), None)
            if not data:
                rows[a['wikidata_id']] = dict(wikidata_id=a['wikidata_id'], file=a['image'], status='no image', **meta)
                continue
            try:
                png = screen(data)
            except Exception as e:  # an unreadable format: skip, do not stop
                rows[a['wikidata_id']] = dict(wikidata_id=a['wikidata_id'], file=a['image'], status='unreadable', **meta)
                continue
            open(os.path.join(MASKS, a['wikidata_id'] + '.png'), 'wb').write(png)
            rows[a['wikidata_id']] = dict(wikidata_id=a['wikidata_id'], file=a['image'], status='ok', **meta)
            time.sleep(0.5)
        with open(OUT, 'w', encoding='utf-8', newline='') as fh:
            w = csv.DictWriter(fh, fieldnames=['wikidata_id', 'file', 'author', 'license', 'license_url', 'status'])
            w.writeheader()
            for q in sorted(rows):
                w.writerow(rows[q])
        print('  %d / %d' % (min(i + 50, len(todo)), len(todo)), flush=True)

    done = sum(1 for r in rows.values() if r['status'] == 'ok')
    print('%d masks, %d without credit, %d without image' % (
        done, sum(1 for r in rows.values() if r['status'] == 'no credit'),
        sum(1 for r in rows.values() if r['status'] in ('no image', 'unreadable'))))


if __name__ == '__main__':
    main()
