#!/usr/bin/env python3
"""Reports every node the map would still show behind a dial.

Mirrors what `regroup()`/`cut()` in assets/atlas.js do to the tree — a tile
leaves its parent's ring, then any node wider than the ring is cut on the next
segment of its children's group path — and lists what is left above the ring's
capacity. Run it after changing the groups:

    python3 tools/check-widths.py [data/genre-import.csv]
"""
import collections
import csv
import os
import sys

RING_MAX = 8      # atlas.js: seats around a tile
DEEP_MAX = 8      # atlas.js: seats deeper down, nothing open
GROUP_LIMIT = 8   # atlas.js: past this a node is cut into groups
SEP = '>'

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'data', 'genre-import.csv')
rows = list(csv.DictReader(open(src, encoding='utf-8')))

kids = collections.defaultdict(list)
for r in rows:
    if r['parent_wikidata_id']:
        kids[r['parent_wikidata_id']].append(r['wikidata_id'])
by_q = {r['wikidata_id']: r for r in rows}
featured = {r['wikidata_id'] for r in rows if r['featured']}


def path(q):
    return [s.strip().upper() for s in (by_q[q]['group'] or '').split(SEP) if s.strip()]


def decade(q):
    y = by_q[q]['epoch_year']
    return (str(int(y) // 10 * 10) + 'S') if y else 'UNDATED'


over = []


def cut(label, members, depth, is_tile):
    """members: list of (key, children-getter). Returns the display width."""
    seats = RING_MAX if is_tile else DEEP_MAX
    if len(members) <= GROUP_LIMIT:
        return len(members)
    buckets, order = {}, []
    for q in members:
        seg = path(q)[depth] if len(path(q)) > depth else decade(q)
        if seg not in buckets:
            buckets[seg] = []
            order.append(seg)
        buckets[seg].append(q)
    if len(order) < 2 or len(order) >= len(members):
        return len(members)   # cannot be narrowed: the dial stays
    if len(order) > seats:
        over.append((label, len(order), 'groupes'))
    for seg in order:
        cut('%s > %s' % (label, seg), buckets[seg], depth + 1, False)
    return len(order)


def walk(q, is_tile):
    children = [k for k in kids[q] if k not in featured]
    if children:
        width = cut(by_q[q]['name'], children, 0, is_tile)
        seats = RING_MAX if is_tile else DEEP_MAX
        if width > seats and len(children) <= GROUP_LIMIT:
            over.append((by_q[q]['name'], width, 'genres'))
        elif width > seats and len(children) > GROUP_LIMIT:
            pass  # already reported inside cut()
    for k in kids[q]:
        walk(k, k in featured)


for r in rows:
    if not r['parent_wikidata_id']:
        walk(r['wikidata_id'], True)

if not over:
    print('Aucun noeud au-dessus de la capacite de l anneau : plus aucun cadran.')
else:
    print('%d noeud(s) encore au cadran :\n' % len(over))
    for label, n, what in sorted(over, key=lambda x: -x[1]):
        print('  %-58s %3d %s' % (label[:58], n, what))
