#!/usr/bin/env python3
"""Editorial grouping of the branches too wide to read one genre at a time.

Past 40 direct subgenres the atlas shows groups instead of genres. With no
group named, each genre falls back to its decade, which cuts where it is easy
rather than where it is useful: under Rock, "1960S" held 20 of the 48.

This writes `genre-groups.csv` (wikidata_id, name, parent, group), which
`wikidata-build.py` folds into the `group` column of `genre-import.csv`.

Two methods, because the data offers two different signals:

* Geography, for the branches that are geographic by nature (folk, Latin).
  99% of their children carry a second Wikidata parent naming a culture or a
  place ("Polish folk music", "music of Cuba"), so the groups are rolled up
  from that rather than typed out. REGIONS maps those labels onto regions.

* Style, for the rest. Wikipedia has no canonical stylistic taxonomy of rock
  or pop — its own list is alphabetical and its navbox falls back on decades —
  so STYLES is editorial. It is meant to be argued with and edited: nothing
  downstream depends on a genre being in one group rather than another, and a
  label typed in Genres > Groups overrides whatever lands here.

    python3 data/build-groups.py
"""
import collections
import csv
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# --- Geographic roll-up -----------------------------------------------------
# Second Wikidata parent -> region. Matched on the whole label, lower-cased.
REGIONS = {
    'AFRICA': ['african folk music'],
    'NORTH AMERICA': [
        'american folk music', 'african-american music', 'canadian folk music',
        'cape breton folk music', 'north american folk music',
        'indigenous american folk music', 'music of north america',
    ],
    'HISPANIC AMERICA': [
        'hispanic american folk music', 'hispanic music', 'litoraleña music',
    ],
    'BRAZIL & THE GUIANAS': ['brazilian folk music'],
    'THE CARIBBEAN': ['caribbean folk music', 'music of the caribbean'],
    'THE ANDES': ['andean music', 'peruvian folk music', 'music of bolivia'],
    'WESTERN EUROPE': [
        'french folk music', 'german folk music', 'swiss folk music',
        'alpine folk music', 'breton folk music', 'celtic folk music',
        'gaelic song', 'scottish folk music', 'european folk music',
    ],
    'IBERIA': [
        'spanish folk music', 'andalusian folk music', 'asturian folk music',
        'basque folk music', 'catalan traditional folk music',
        'galician folk music', 'portuguese folk music',
    ],
    'ITALY & GREECE': [
        'italian folk music', 'sardinian folk music', 'corsican folk music',
        'greek folk music', 'cretan folk music', 'music of greece',
    ],
    'EASTERN EUROPE & THE BALKANS': [
        'polish folk music', 'polska', 'lithuanian folk music',
        'ukrainian folk music', 'romanian folk music', 'croatian folk music',
        'bosnian and herzegovinian folk music', 'macedonian folk music',
        'balkan pop-folk', 'balto-finnic folk music',
    ],
    'JAPAN & KOREA': [
        'japanese folk music', 'korean folk music', 'ainu folk music',
    ],
    'CHINA & MONGOLIA': ['chinese traditional music', 'mongolian folk music'],
    'SOUTH ASIA': [
        'south asian folk music', 'bengali folk music', 'bhojpuri folk music',
        'tamil folk music', 'telugu folk music', 'sinhalese folk music',
        'bhutanese folk music',
    ],
    'SOUTHEAST ASIA': [
        'southeast asian folk music', 'indonesian folk music',
        'austronesian music', 'vietnamese folk music',
    ],
    'MIDDLE EAST': [
        'arabic folk music', 'azerbaijani folk music', 'west asian folk music',
        'islamic music',
    ],
    'OCEANIA': ['oceanic folk music'],
    'SONG & DANCE FORMS': [
        'christmas carol', 'folk dance music', 'polyphony', 'popular music',
        'traditional folk music',
    ],
    # Latin music
    'CUBA': ['music of cuba'],
    'THE ISLANDS': [
        'music of haiti', 'music of the dominican republic',
        'music of puerto rico', 'french caribbean music', 'tropical music',
    ],
    'BRAZIL': ['music of brazil', 'brazilian gaucho music'],
    # 'BRAZIL & THE GUIANAS' above is the folk branch's; this one is Latin's.
    'MEXICO & CENTRAL AMERICA': [
        'music of mexico', 'music of el salvador', 'music of nicaragua',
    ],
    'THE SOUTHERN CONE': [
        'music of argentina', 'music of chile', 'music of paraguay',
    ],
    'SPAIN': ['music of spain', 'music of catalonia'],
    'ACROSS LATIN AMERICA': [
        'hispanic american music', 'music of latin america',
    ],
    'DANCE & CARNIVAL': [
        'dance music', 'carnival music', 'holiday music', 'couplet',
    ],
}
LABEL_TO_REGION = {lab: reg for reg, labs in REGIONS.items() for lab in labs}

# Finer cuts inside the branches rolled up by region, applied after the roll-up.
# The regional signal runs out at one level: "music of Cuba" is a single label
# on all 18 Cuban genres, so nothing below it can be derived. These are cut by
# musical family instead, and stay at the SAME level rather than nesting, which
# keeps them one click away.
OVERRIDES = {
    'folk music': {
        'RÍO DE LA PLATA': [
            'chacarera', 'chamamé', 'chamarrita rioplatense', 'milonga',
            'candombe', 'zamba', 'payada',
        ],
        'ANDES & PACIFIC COAST': [
            'Taquirari', 'cueca', 'canto a lo poeta', 'yaraví', 'zamacueca',
            'malagueña',
        ],
        'CARIBBEAN COAST': [
            'bambuco', 'gaita zuliana', 'joropo', 'tamborito',
        ],
        # Hispanic-influenced, but Philippine music: it does not belong in
        # Hispanic America, where the roll-up had put it.
        'SOUTHEAST ASIA': ['Philippine rondalla'],
        'WEST AFRICA': ['apala', 'zinli', 'tchinkoumé', 'ambasse bey', 'batuque'],
        'CENTRAL & SOUTHERN AFRICA': [
            'semba', 'kilapanga', 'Ngoma music', 'montea',
        ],
        'NORTH AFRICA & THE ISLANDS': ['Gnawa music', 'traditional séga'],
        'SPAIN': [
            'asturianada', 'chotis madrileño', 'copla', 'fandango', 'jota',
            'muiñeira', 'música festera', 'pasodoble', 'saeta', 'sardana',
            'trikiti',
        ],
        'PORTUGAL': [
            'fado', 'cante alentejano', 'desgarrada', 'chamarrita açoriana',
        ],
        'JAPAN': [
            'kouta', "min'yō", 'ondo', 'rōkyoku', 'taiko music',
            'tsugaru-jamisen', 'upopo', 'yukar',
        ],
        'KOREA': ['Sinawi', 'musok eumak', 'pansori', 'pungmul', 'sanjo'],
        'THE BALKANS': [
            'bocet', 'doina', 'klapa', 'sevdalinka', 'turbo-folk', 'čalgija',
            'Bosnian root music',
        ],
        'CENTRAL & EASTERN EUROPE': [
            'Hambo', 'duma', 'krakowiak', 'kujawiak', 'oberek', 'runo song',
            'sutartinė',
        ],
    },
    'Latin music': {
        'SON & GUARACHA': [
            'son cubano', 'changüí', 'guaracha', 'songo music', 'trova',
            'guajira', 'punto guajiro', 'descarga',
        ],
        'RUMBA & AFRO-CUBAN': [
            'Cuban rumba', 'rumba', 'conga', 'tumba francesa', 'pilón',
        ],
        'DANZÓN & BALLROOM': [
            'danzón', 'mambo', 'pachanga', 'habanera', 'Cuban charanga',
        ],
        'SAMBA & BOSSA NOVA': [
            'samba', 'bossa nova', 'choro', 'maxixe',
            'música popular brasileira',
        ],
        'NORTHEASTERN BRAZIL': [
            'baião', 'coco', 'carimbó', 'xote', 'repente', 'afoxê', 'axé',
        ],
        'MODERN BRAZILIAN POP': [
            'brega', 'lambada', 'mangue bit', 'sertanejo', 'vanera',
            'bandinha',
        ],
        'COLOMBIA': [
            'Vallenato', 'champeta', 'currulao', 'porro', 'pasillo',
        ],
        'THE ANDES': [
            'coplas cajamarquinas', 'música criolla', 'pandilla',
        ],
        # Two genres the roll-up left alone in a group of their own.
        'DANCE & CARNIVAL': ['murga'],
        'MEXICO & CENTRAL AMERICA': ['New Mexico music'],
    },
}

# Where a branch's unmatched leftovers go.
FALLBACK = {'folk music': 'SONG & DANCE FORMS', 'Latin music': 'ACROSS LATIN AMERICA'}

# --- Editorial, style-based grouping ---------------------------------------
STYLES = {
    'rock music': {
        'ROCK AND ROLL ERA': [
            'rock and roll', 'surf music', 'instrumental rock', 'mod',
            'garage rock',
        ],
        'PSYCHEDELIC & ART ROCK': [
            'psychedelic rock', 'art rock', 'experimental rock', 'math rock',
            'zolo',
        ],
        'PROGRESSIVE & THEATRICAL': [
            'progressive rock', 'symphonic rock', 'rock opera', 'rock musical',
        ],
        'HARD & ARENA ROCK': [
            'hard rock', 'glam rock', 'arena rock', 'classic rock',
            'mainstream rock',
        ],
        'BLUES & SOUTHERN ROCK': [
            'blues rock', 'Southern rock', 'heartland rock', 'jam band music',
            'pub rock',
        ],
        'FOLK, COUNTRY & ACOUSTIC': [
            'folk rock', 'country rock', 'roots rock', 'acoustic rock',
        ],
        'POP, NEW WAVE & ALTERNATIVE': [
            'pop rock', 'new wave', 'alternative rock', 'comedy rock',
            'Christian rock',
        ],
        'FUSIONS': [
            'jazz rock', 'funk rock', 'rap rock', 'reggae rock',
            'electronic rock', 'dance-rock',
        ],
        'SCENES AROUND THE WORLD': [
            'Latin rock', 'Anatolian rock', 'Zamrock', 'rock andino',
            'Afro-rock', 'Sufi rock', 'flamenco rock', 'miejski folk',
            'könsrock',
        ],
    },
    'classical music': {
        'HISTORICAL PERIODS': [
            'medieval music', 'Renaissance music', 'Baroque music',
            'Classical period', 'Romantic music', 'modern classical music',
            'post-classical', 'Mozarabic chant',
        ],
        'VOCAL & SACRED FORMS': [
            'opera', 'cantata', 'motet', 'madrigal', 'passion', 'art song',
        ],
        'STAGE & DANCE FORMS': [
            'ballet', 'waltz', 'polka', 'polonaise', 'dobrado',
            'divertissement', 'serenade', 'classic rag',
        ],
        'KEYBOARD FORMS': [
            'prelude', 'toccata', 'fugue', 'ricercar', 'fantasia', 'étude',
            'impromptu', 'bagatelle', 'capriccio', 'character piece',
        ],
        'CHAMBER & ORCHESTRAL FORMS': [
            'sonata', 'string quartet', 'Baroque suite', 'symphonic music',
            'overture', 'canzona', 'theme and variation',
        ],
        'MODERN & AVANT-GARDE': [
            'New Complexity', 'indeterminacy', 'musique concrète instrumentale',
            'sonorism', 'spectral music', 'stochastic music',
            'English Pastoral School',
        ],
    },
    'house music': {
        'CHICAGO & THE ORIGINS': [
            'Chicago house', 'acid house', 'garage house', 'deep house',
            'ghetto house', 'hip house', 'diva house',
        ],
        'SOUL, JAZZ & VOCAL HOUSE': [
            'gospel house', 'vocal house', 'jazz house', 'funky house',
            "jackin' house", "UK jackin'",
        ],
        'DEEP, MINIMAL & ORGANIC': [
            'microhouse', 'melodic house', 'organic house', 'outsider house',
            'ambient house', 'future funk',
        ],
        'BIG ROOM & FESTIVAL': [
            'big room house', 'progressive house', 'festival progressive house',
            'electro house', 'future house', 'hard house', 'tech house',
        ],
        'BASS & CLUB HOUSE': [
            'bass house', 'g-house', 'phonk house', 'stutter house',
            'ballroom', 'Baltimore club',
        ],
        'AFRICAN HOUSE': ['Afro house', 'Amapiano', 'gqom', 'kwaito'],
        'LATIN & BRAZILIAN HOUSE': [
            'Latin house', 'Brazilian bass', 'eletrofunk', 'changa tuki',
            'tribal house',
        ],
        'EUROPEAN & ASIAN SCENES': [
            'Eurohouse', 'French house', 'Italo house', 'popcorn music',
            'bubbling house', 'tropical house', 'vinahouse',
        ],
    },
    'electronic dance music': {
        'HOUSE & TECHNO': [
            'house music', 'techno', 'hypertechno', 'nerdcore techno',
            'toytown techno', 'electro', 'dark disco',
        ],
        'TRANCE & RAVE': [
            'trance', 'rave music', 'neo rave', 'future rave', 'jumpstyle',
            'hardtekk', 'Balearic beat',
        ],
        'HARDCORE & HARDSTYLE': [
            'hardcore', 'hardstyle', 'hardvapour', 'hardwave', 'hard drum',
            'lento violento', 'krushclub', 'slimepunk',
        ],
        'BREAKBEAT & JUNGLE': [
            'breakbeat', 'breaks', 'broken beat', 'jungle terror', 'footwork',
            'UK funky', 'intelligent dance music',
        ],
        'DUBSTEP & BASS': [
            'dubstep', 'post-dubstep', 'grime', 'future bass', 'melodic bass',
            'midtempo bass', 'wonky', 'glitch hop (EDM)', 'skweee',
        ],
        'UK & US CLUB': [
            'UK garage', 'Jersey club', 'Philly club', 'flex dance music',
            'deconstructed club', 'dariacore', 'cruise', 'bubbling',
        ],
        'GLOBAL CLUB': [
            'kuduro', 'singeli', 'coupé-décalé', 'funkot', 'budots',
            'balani show', 'bérite club', 'shangaan electro',
            'tribal guarachero', 'electro latino', 'moombahton', 'moombahcore',
            'Nortec', 'electrotango', 'tecnorumba',
        ],
        'RETRO & EURODANCE': [
            'Eurobeat', 'Eurodance', 'freestyle music', 'electro swing',
            'electroclash', 'electronic body music', 'partyschlager',
            'spacesynth', 'outrun',
        ],
        'TRAP & HYPERPOP': [
            'EDM trap music', 'Japanese artcore', 'bubblegum bass', 'ori deck',
        ],
    },
    'pop music': {
        'CLASSIC POP': [
            'Brill Building', 'traditional pop', 'bubblegum music',
            'sunshine pop', 'space age pop', 'teen pop', 'toytown pop',
            'new music',
        ],
        'ART & INDIE POP': [
            'art pop', 'avant-pop', 'baroque pop', 'progressive pop',
            'psychedelic pop', 'indie pop', 'alternative pop', 'sophisti-pop',
            'ambient pop',
        ],
        'ELECTRONIC POP': [
            'synth-pop', 'electropop', 'dance-pop', 'hyperpop', 'glitch pop',
            'electro hop',
        ],
        'POP CROSSOVERS': [
            'country pop', 'jazz pop', 'contemporary R&B', 'pop reggae',
            'pop raï', 'pop ghazal',
        ],
        'EUROPEAN POP': [
            'Europop', 'schlager music', 'yé-yé', 'Nederpop', 'dansband music',
            'dansktop', 'chalga', 'manele', 'tallava', 'mulatós', 'rabiz',
        ],
        'EAST ASIAN POP': [
            'cantopop', 'city pop', 'kayōkyoku', 'Shibuya-kei', 'Korean ballad',
            'V-pop', 'Q-pop',
        ],
        'SOUTH & SOUTHEAST ASIAN POP': [
            'Indian pop', 'pop Sunda', 'pop kreatif', 'pop minang', 'rom kbach',
            'rigsar',
        ],
        'MIDDLE EASTERN & AFRICAN POP': [
            'Iranian pop', 'Turkish pop', 'al jeel', 'mūsīqā lubnāniyya',
            'Orthodox pop', 'Afrobeats',
        ],
        'LATIN POP': ['Latin pop', 'canción melódica', 'neomelodic music'],
    },
    'hip-hop': {
        'OLD SCHOOL & FOUNDATIONS': [
            'old-school hip-hop', 'boom bap', 'turntablism', 'battle rap',
            'hardcore hip-hop', 'underground hip-hop',
        ],
        'US REGIONAL SCENES': [
            'East Coast hip-hop', 'West Coast hip-hop', 'Southern hip-hop',
            'dirty south', 'Detroit sound', 'Houston sound', 'Memphis rap',
            'mobb music',
        ],
        'CLUB & PARTY RAP': [
            'crunk', 'snap music', 'hyphy', 'chopped and screwed', 'Miami bass',
            'ratchet music', 'jerk', 'Jersey club rap', 'Philly club rap',
        ],
        'TRAP & PHONK': [
            'trap music', 'drill', 'drift phonk', 'lowend', 'cloud rap',
            'emo rap', 'digicore',
        ],
        'ALTERNATIVE & EXPERIMENTAL': [
            'alternative hip-hop', 'abstract hip-hop', 'experimental hip-hop',
            'jazz rap', 'instrumental hip-hop', 'lofi hip-hop',
            'drumless hip hop', 'chipmunk soul',
        ],
        'THEMES & CROSSOVERS': [
            'political hip-hop', 'Christian hip-hop', 'comedy hip-hop',
            'horrorcore', 'nerdcore', 'stoner rap', 'country rap', 'pop rap',
        ],
        'AFRICAN HIP-HOP': [
            'bongo flava', 'hiplife', 'hipco', 'genge', 'Afroswing',
        ],
        'OTHER SCENES': ['arabesque rap', 'ragga hip hop', 'hanmai'],
    },
}


def main():
    src = os.path.join(HERE, 'genre-import.csv')
    rows = list(csv.DictReader(open(src, encoding='utf-8')))
    by_q = {r['wikidata_id']: r for r in rows}
    kids = collections.defaultdict(list)
    for r in rows:
        if r['parent_wikidata_id']:
            kids[r['parent_wikidata_id']].append(r)
    featured = {r['wikidata_id'] for r in rows if r['featured']}

    out, problems = [], []
    for branch in list(STYLES) + list(FALLBACK):
        parent = next((r for r in rows if r['name'] == branch), None)
        if parent is None:
            problems.append('branche absente des donnees : %s' % branch)
            continue
        # A tile leaves its parent's ring, so it is not grouped with it.
        children = [k for k in kids[parent['wikidata_id']]
                    if k['wikidata_id'] not in featured]
        assigned = {}

        if branch in STYLES:
            for group, names in STYLES[branch].items():
                for n in names:
                    hits = [c for c in children if c['name'] == n]
                    if not hits:
                        problems.append('%s : « %s » introuvable parmi les enfants' % (branch, n))
                    for hit in hits:
                        assigned[hit['wikidata_id']] = group
        else:
            for c in children:
                alts = [p.strip() for p in c['wikidata_parents_raw'].split('|')
                        if p.strip() and p.strip().lower() != branch.lower()]
                group = next((LABEL_TO_REGION[a.lower()] for a in alts
                              if a.lower() in LABEL_TO_REGION), None)
                assigned[c['wikidata_id']] = group or FALLBACK[branch]
            # The finer cut wins over the region it came from.
            for group, names in OVERRIDES.get(branch, {}).items():
                for n in names:
                    hits = [c for c in children if c['name'] == n]
                    if not hits:
                        problems.append('%s : « %s » introuvable parmi les enfants' % (branch, n))
                    for hit in hits:
                        assigned[hit['wikidata_id']] = group

        missing = [c for c in children if c['wikidata_id'] not in assigned]
        for c in missing:
            problems.append('%s : « %s » sans groupe' % (branch, c['name']))

        sizes = collections.Counter(assigned.values())
        print('%-24s %3d enfants -> %2d groupes  (le plus gros : %d)'
              % (branch, len(children), len(sizes),
                 max(sizes.values()) if sizes else 0))
        for g, n in sorted(sizes.items(), key=lambda x: -x[1]):
            print('      %-32s %3d' % (g, n))
        for q, g in assigned.items():
            out.append({'wikidata_id': q, 'name': by_q[q]['name'],
                        'parent': branch, 'group': g})

    dst = os.path.join(HERE, 'genre-groups.csv')
    with open(dst, 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['wikidata_id', 'name', 'parent', 'group'])
        w.writeheader()
        for r in sorted(out, key=lambda r: (r['parent'], r['group'], r['name'])):
            w.writerow(r)
    print('\n%d genres groupes -> %s' % (len(out), os.path.relpath(dst)))

    if problems:
        print('\n%d PROBLEME(S) :' % len(problems))
        for p in problems:
            print('  ' + p)
        sys.exit(1)


if __name__ == '__main__':
    main()
