#!/usr/bin/env python3
"""Assemble the Genre City prototype into one self-contained HTML page.

    python3 prototypes/genre-city/build.py            # writes genre-city-prototype.html
    python3 prototypes/genre-city/build.py --data tree.json
        # first rebuilds electronic.json from a copy of /wp-json/genre-atlas/v1/tree

The page carries its own data (the Electronic family) and draws everything in code:
no image, no sound, no request to the site except the links the player opens.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def subtree(tree_path, root_slug='electronic-music'):
    nodes = json.load(open(tree_path))['nodes']
    by_id = {n['id']: n for n in nodes}
    kids = {}
    for n in nodes:
        kids.setdefault(n.get('p'), []).append(n['id'])
    root = next(n for n in nodes if n['slug'] == root_slug)
    out, todo = [], [root['id']]
    while todo:
        i = todo.pop(0)
        n = by_id[i]
        o = {'i': i, 'p': 0 if i == root['id'] else n.get('p'), 's': n['slug'], 'n': n['name']}
        for src, dst in (('g', 'g'), ('y', 'y'), ('o', 'o'), ('d', 'd'), ('a', 'a')):
            if n.get(src):
                o[dst] = n[src]
        out.append(o)
        todo.extend(kids.get(i, []))
    return out


if __name__ == '__main__':
    if '--data' in sys.argv:
        data = subtree(sys.argv[sys.argv.index('--data') + 1])
        json.dump(data, open(os.path.join(HERE, 'electronic.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    read = lambda f: open(os.path.join(HERE, f), encoding='utf-8').read()
    js = '  var DATA = ' + read('electronic.json') + ';\n' + read('art.js') + read('game.js')
    page = read('page.tpl.html').replace('/*#JS#*/', js)
    out = os.path.join(HERE, 'genre-city-prototype.html')
    open(out, 'w', encoding='utf-8').write(page)
    print(out, len(page.encode('utf-8')), 'bytes')
