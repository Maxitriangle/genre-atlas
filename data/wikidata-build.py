#!/usr/bin/env python3
"""Build the Genre Atlas import file: every declared family and its subgenres.

Reads the five extracts that wikidata-fetch.sh writes and produces one CSV
covering the whole atlas. Run it after the fetch script:

    ./wikidata-fetch.sh && python3 wikidata-build.py

This supersedes wikidata-build-electronic.py, which built one family at a time.
Building every family in a single pass is what keeps the tree strict: a genre
reachable from several families (electro-industrial from Electronic and from
Industrial, say) is resolved once, so it lands under exactly one of them. Built
one family at a time, it would appear in two import files and the second import
would silently move it.
"""
import collections
import csv
import io
import os
import re
import sys

sys.setrecursionlimit(10000)
HERE = os.path.dirname(os.path.abspath(__file__))

# Families get a tile on the home page and are the root of their own tree.
# Ordered as the tiles are ordered; the two Rock territories sit right after it.
FAMILIES = [
    'electronic music',
    'rock music',
    'folk music',
    'Latin music',
    'art music',
    'hip-hop',
    'pop music',
    'jazz',
    'experimental music',
    'rhythm and blues',
    'country music',
    'blues',
    'reggae',
]

# Territories keep their real parent in the tree but still get a tile, because
# entering the atlas and descending from something are two different questions.
# Metal and Punk are children of Rock — one of the best documented filiations in
# music — and are also two of the places a visitor will look for first.
TERRITORIES = {'metal music': 'rock music', 'punk music': 'rock music'}

# Tile order: families by size, with each territory inserted after its parent.
TILE_ORDER = ['electronic music', 'rock music', 'metal music', 'punk music',
              'folk music', 'Latin music', 'art music', 'hip-hop', 'pop music',
              'jazz', 'experimental music', 'rhythm and blues', 'country music',
              'blues', 'reggae']

SHAPES = ['circle', 'hex', 'pent', 'square', 'diamond', 'oct', 'tri_up', 'tri_down', 'hex_r']
HUE_START, HUE_STEP = 295, 168   # 295 keeps Electronic the colour it already has

# Known inversions in Wikidata, carried over from the Electronic build.
OVERRIDE = {'jungle': ['breakbeat hardcore', 'breakbeat', 'electronic dance music'],
            'drum and bass': ['jungle']}


def read(name):
    path = os.path.join(HERE, name)
    return [row for row in list(csv.reader(io.open(path, encoding='utf-8')))[1:] if row]


qid = lambda uri: uri.rsplit('/', 1)[-1]

label, links = {}, {}
for g, l, k in read('a_labels.csv'):
    label[qid(g)] = l
    links[qid(g)] = int(k or 0)
known = set(label)

parents = collections.defaultdict(set)
for g, p in read('b_parents.csv'):
    if qid(p) in known:
        parents[qid(g)].add(qid(p))

year = {}
for g, y in read('c_inception.csv'):
    if y.isdigit():
        year[qid(g)] = min(int(y), year.get(qid(g), 9999))

country = collections.defaultdict(set)
for g, c in read('d_country.csv'):
    country[qid(g)].add(c)

mbid = {}
for g, m in read('e_mb.csv'):
    mbid.setdefault(qid(g), m)

# The reliable subset: a genre Wikidata and MusicBrainz both recognise.
M = {g for g in known if g in mbid and label[g]}


def ancestors(g, seen=None):
    seen = set() if seen is None else seen
    for p in parents[g]:
        if p not in seen:
            seen.add(p)
            ancestors(p, seen)
    return seen


ANC = {g: ancestors(g) for g in M}
geographic = lambda p: label[p].lower().startswith(('music of', 'music in'))
words = lambda s: set(re.findall(r'[a-z0-9]+', s.lower())) - {'music', 'and', 'the', 'of'}
depth_raw = lambda p: len(ANC[p] & M)


def nearest(g):
    """Ancestors inside the reliable subset, climbing through the others."""
    out, stack, seen = set(), list(parents[g]), set()
    while stack:
        p = stack.pop()
        if p in seen:
            continue
        seen.add(p)
        if p in M:
            out.add(p)
        else:
            stack.extend(parents[p])
    return out


# One parent per genre. Among the nearest recognised ancestors, drop the
# geographic axis and any candidate that is itself an ancestor of another
# candidate, then prefer the one whose name overlaps the child's, then the
# deepest, then the best documented. Ties fall back to the id, so a rerun on
# the same extracts always gives the same tree.
choice, how = {}, {}
for g in M:
    cand = {p for p in nearest(g) if not geographic(p) and p != g}
    cand = {p for p in cand if not any(p in ANC[o] for o in cand if o != p)}
    if not cand:
        choice[g], how[g] = None, 'root'
    elif len(cand) == 1:
        choice[g], how[g] = next(iter(cand)), 'single'
    else:
        choice[g] = max(cand, key=lambda p: (len(words(label[p]) & words(label[g])),
                                             depth_raw(p), links[p], p))
        how[g] = 'auto'

by_name = {label[g].lower(): g for g in sorted(M)}
for child, candidates in OVERRIDE.items():
    if child in by_name:
        for name in candidates:
            if name in by_name:
                choice[by_name[child]], how[by_name[child]] = by_name[name], 'override'
                break


def resolve(name):
    g = by_name.get(name.lower())
    if not g:
        sys.exit('Wikidata no longer has a recognised genre labelled %r. '
                 'Check the label and update FAMILIES/TERRITORIES.' % name)
    return g


family_ids = [resolve(n) for n in FAMILIES]
for name, parent_name in TERRITORIES.items():
    g, expected = resolve(name), resolve(parent_name)
    if choice.get(g) != expected:
        got = label[choice[g]] if choice.get(g) else 'no parent'
        sys.exit('%s should sit under %s but the build puts it under %s. '
                 'Wikidata changed; review TERRITORIES.' % (name, parent_name, got))

# Families must be roots of their own tree, or a genre would have two homes.
for g in family_ids:
    if choice.get(g):
        sys.exit('%s cannot be a family: the build gives it the parent %s.'
                 % (label[g], label[choice[g]]))

kids = collections.defaultdict(list)
for g in M:
    if choice.get(g):
        kids[choice[g]].append(g)


def subtree(g):
    out = {g}
    for k in kids[g]:
        out |= subtree(k)
    return out


def descendants(g):
    return sum(1 + descendants(k) for k in kids[g])


tiles = [resolve(n) for n in TILE_ORDER]
assert set(tiles) == set(family_ids) | {resolve(n) for n in TERRITORIES}, 'TILE_ORDER is incomplete'
tile_rank = {g: i for i, g in enumerate(tiles)}

width = lambda n: 'ring' if n <= 8 else ('dial' if n <= 40 else 'group')

# Editorial groups for the branches too wide to read one genre at a time,
# written by build-groups.py. Absent file = every wide branch falls back to
# decades, which is what the atlas did before.
groups = {}
_gf = os.path.join(HERE, 'genre-groups.csv')
if os.path.exists(_gf):
    for _r in csv.DictReader(io.open(_gf, encoding='utf-8')):
        groups[_r['wikidata_id']] = _r['group']
    sys.stderr.write('groupes editoriaux : %d genres\n' % len(groups))

rows = []


def emit(g, root, level):
    n = len(kids[g])
    i = tile_rank.get(g)
    rows.append(dict(
        wikidata_id=g,
        musicbrainz_id=mbid.get(g, ''),
        name=label[g],
        parent_wikidata_id=choice[g] if (choice.get(g) and g != root) else '',
        parent_name=label[choice[g]] if (choice.get(g) and g != root) else '',
        level=level,
        children_direct=n,
        descendants_total=descendants(g),
        display_rule=width(n),
        epoch_year=year.get(g, ''),
        origin=' · '.join(sorted(country.get(g, []))),
        group=groups.get(g, ''),
        bpm_min='',
        bpm_max='',
        parent_choice='root' if g == root else how[g],
        wikidata_parents_raw=' | '.join(sorted(label[p] for p in parents[g])),
        wikipedia_links=links[g],
        featured='' if i is None else i + 1,
        family_shape='' if i is None else SHAPES[i % len(SHAPES)],
        family_hue='' if i is None else (HUE_START + HUE_STEP * i) % 360,
    ))
    # Final tie-break on the Wikidata ID: two genres can share a label and
    # have no year (there are two 'bolero' under Latin music), and without
    # it their order falls back on set iteration, which moves between runs.
    for k in sorted(kids[g], key=lambda k: (year.get(k, 9999), label[k].lower(), k)):
        emit(k, root, level + 1)


for g in family_ids:
    emit(g, g, 0)

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'genre-import.csv')
writer = csv.DictWriter(io.open(out, 'w', newline='', encoding='utf-8'), fieldnames=list(rows[0]))
writer.writeheader()
writer.writerows(rows)

# ---- report -------------------------------------------------------------
seen = {r['wikidata_id'] for r in rows}
assert len(seen) == len(rows), 'a genre was emitted twice'
print('%d rows written to %s' % (len(rows), os.path.relpath(out, HERE)))
print('%d of %d recognised genres are covered (%d%%)'
      % (len(rows), len(M), 100 * len(rows) // len(M)))
print('\n%-22s %6s %9s %8s  %s' % ('family', 'genres', 'children', 'rule', 'tile'))
for g in tiles:
    n = len(kids[g])
    print('%-22s %6d %9d %8s  %s'
          % (label[g][:22], descendants(g) + 1, n, width(n),
             '#%d %s' % (tile_rank[g] + 1, SHAPES[tile_rank[g] % len(SHAPES)])))
print('\nparent chosen: ' + ', '.join(
    '%s %d' % (k, v) for k, v in sorted(collections.Counter(
        r['parent_choice'] for r in rows).items())))
print('epoch year on %d rows, origin on %d, bpm on 0'
      % (sum(1 for r in rows if r['epoch_year'] != ''),
         sum(1 for r in rows if r['origin'] != '')))

left = M - seen
roots_left = sorted((g for g in left if not choice.get(g)), key=lambda g: -descendants(g))
print('\n%d recognised genres stay out of the atlas, under %d roots of their own.'
      % (len(left), len(roots_left)))
print('largest left out: ' + ', '.join(
    '%s (%d)' % (label[g], descendants(g) + 1) for g in roots_left[:8]))
