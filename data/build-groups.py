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
            'Q15830404',  # the Cuban bolero; the Spanish one stays in SPAIN
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
        'COLOMBIA & VENEZUELA': [
            'Vallenato', 'champeta', 'currulao', 'porro', 'pasillo',
            'onda nueva',
        ],
        'THE ANDES': [
            'coplas cajamarquinas', 'música criolla', 'pandilla',
        ],
        # Two genres the roll-up left alone in a group of their own.
        'DANCE & CARNIVAL': ['murga'],
        'MEXICO & CENTRAL AMERICA': [
            'New Mexico music', 'tamborera', 'tropicanibalismo',
        ],
        # "Across Latin America" was a catch-all: each genre goes to its country.
        'THE SOUTHERN CONE': ['guarania', 'avanzada'],
        'THE ISLANDS': ['Dominican dembow'],
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
        'PSYCHEDELIC & EXPERIMENTAL': [
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
        'POP ROCK': ['pop rock', 'comedy rock', 'Christian rock'],
        'NEW WAVE & ALTERNATIVE': ['new wave', 'alternative rock'],
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


# --- The nodes between 9 and 33 children -----------------------------------
# Nothing to derive here: their children carry no second Wikidata parent worth
# grouping on, so these are families anyone who knows the genre would recognise.
MORE_STYLES = {
    'jazz': {
        'ORIGINS & SWING': ['Dixieland jazz', 'Creole jazz', 'big band music', 'swing', 'sweet jazz', 'jazz standard', 'orchestral jazz'],
        'BEBOP & MODERN JAZZ': ['bebop', 'cool jazz', 'modal jazz', 'third stream', 'contemporary jazz'],
        'FUSION & FUNK': ['jazz fusion', 'jazz-funk', 'nu jazz', 'crossover jazz', 'smooth jazz', 'world fusion'],
        'BLUES & SPIRITUAL JAZZ': ['jazz blues', 'spiritual jazz', 'vocal jazz', 'instrumental jazz'],
        'JAZZ AROUND THE WORLD': ['Afro-jazz', 'Ethio-jazz', 'Gypsy jazz', 'Indo jazz', 'Latin jazz', 'cape jazz', 'marabi', 'paramaribop'],
        'MOOD & SCREEN': ['crime jazz', 'dark jazz', 'jazz poetry'],
    },
    'electronic music': {
        'CLUB & DANCEFLOOR': ['electronic dance music', 'nightcore', 'witch house', 'seapunk'],
        'AMBIENT & CHILL-OUT': ['chill-out music', 'chillwave', 'binaural beats', 'illbient', 'leftfield electronic', 'minimal wave', 'wave'],
        'SYNTH & RETRO': ['synthwave', 'horror synth', 'bit music', 'moogsploitation', 'cyberpunk music', 'progressive electronic music'],
        'EXPERIMENTAL & DIGITAL': ['experimental electronic music', 'graphical sound', 'digital fusion', 'HexD', 'acholitronix', 'electronica'],
    },
    'metal music': {
        'EXTREME METAL': ['black metal', 'death metal', 'thrash metal', 'groove metal'],
        'DOOM & SLUDGE': ['doom metal', 'sludge metal', 'drone metal', 'stoner metal', 'post-metal'],
        'CLASSIC & POWER METAL': ['heavy metal music', 'power metal', 'neo-classical metal', 'glam metal', 'Southern metal'],
        'PROGRESSIVE & SYMPHONIC': ['progressive metal', 'symphonic metal', 'avant-garde metal', 'gothic metal', 'folk metal'],
        'CROSSOVER METAL': ['alternative metal', 'pop metal', 'kawaii metal', 'trance metal'],
    },
    'hardcore': {
        'GABBER & MAINSTREAM': ['gabber', 'happy hardcore', 'uptempo hardcore', 'hard renaissance', 'Frenchcore'],
        'SPEED & EXTREME': ['speedcore', 'terrorcore', 'doomcore', 'darkcore', 'deathchant hardcore'],
        'BREAKS & DIGITAL': ['breakbeat hardcore', 'breakcore', 'digital hardcore', 'amigacore', 'acidcore'],
        'SCENES & OFFSHOOTS': ['J-core', 'frapcore', 'freeform hardcore', 'industrial hardcore'],
    },
    'drum and bass': {
        'LIQUID & ATMOSPHERIC': ['liquid drum and bass', 'atmospheric drum and bass', 'deep drum and bass', 'minimal drum and bass', 'jazzstep', 'drumfunk'],
        'DARK & TECHNICAL': ['darkstep', 'techstep', 'neurofunk', 'technoid', 'halftime', 'trancestep'],
        'DANCEFLOOR & JUMP-UP': ['jump-up', 'hardstep', 'dancefloor drum and bass', 'dubwise drum and bass', 'sambass'],
    },
    'punk rock': {
        'HARDCORE & OI!': ['hardcore punk', 'oi!', 'anarcho-punk', 'queercore', 'riot grrrl'],
        'POP & SKATE PUNK': ['pop-punk', 'skate punk', 'alternative punk', 'garage punk'],
        'ROOTS & REVIVAL': ['psychobilly', 'surf punk', 'horror punk', 'Gypsy punk', 'Celtic punk'],
        'PUNK FUSIONS': ['ska punk', 'punk rap', 'Neue Deutsche Welle'],
    },
    'contemporary folk music': {
        'FOLK REVIVAL': ['skiffle', 'campus folk song', 'country folk', 'neofolklore', 'American primitive guitar'],
        'INDIE & ALTERNATIVE FOLK': ['indie folk', 'alternative folk', 'anti-folk', 'folk-pop', 'loner folk'],
        'PSYCHEDELIC & AVANT FOLK': ['psychedelic folk', 'avant-folk', 'chamber folk', 'neofolk', 'progressive folk', 'filk'],
    },
    'regional Mexican': {
        'SON & HUAPANGO': ['son calentano', 'son huasteco', 'son istmeño', 'son jarocho', 'huapango', 'trova yucateca'],
        'BANDA & NORTEÑO': ['banda music', 'norteño', 'Duranguense', 'corrido', 'grupera', 'tejano music'],
        'MARIACHI & RANCHERA': ['mariachi', 'ranchera', 'canto cardenche', 'pirekua'],
    },
    'trance': {
        'CLASSIC & UPLIFTING': ['uplifting trance', 'vocal trance', 'dream trance', 'Balearic trance', 'Eurotrance'],
        'HARD & TECH TRANCE': ['hard trance', 'tech trance', 'acid trance', 'hard NRG', 'electro trance'],
        'PSYCHEDELIC & MODERN': ['psychedelic trance', 'hi-tech full-on', 'progressive trance', 'big room trance', 'trance 2.0'],
    },
    'samba': {
        'TRADITIONAL SAMBA': ['samba de terreiro', 'samba de breque', 'partido alto', 'batucada', 'samba-enredo', 'samba-exaltação'],
        'SAMBA & SONG': ['samba-canção', 'samba-choro', 'samba-jazz', 'samba de gafieira', 'samba-joia'],
        'MODERN SAMBA': ['pagode', 'samba rock', 'samba rap', 'sambalanço'],
    },
    'blues': {
        'COUNTRY & ACOUSTIC BLUES': ['country blues', 'acoustic blues', 'acoustic Chicago blues', 'piano blues', 'fife and drum blues', 'jug band'],
        'ELECTRIC & JUMP BLUES': ['electric blues', 'jump blues', 'boogie-woogie', 'soul blues', 'classic female blues'],
        'REGIONAL & AFRICAN BLUES': ['Texas blues', 'Louisiana blues', 'African blues', 'desert blues'],
    },
    'hardcore punk': {
        'METALLIC HARDCORE': ['metalcore', 'grindcore', 'thrashcore', 'powerviolence', 'beatdown hardcore', 'tough guy hardcore'],
        'CRUST & D-BEAT': ['D-beat', 'crust punk', 'noisecore', 'burning spirits'],
        'MELODIC & THEMED': ['melodic hardcore', 'street punk', 'Christian hardcore', 'Nintendocore'],
    },
    'soul': {
        'CITY SCENES': ['Chicago soul', 'Philadelphia soul', 'Southern soul', 'Northern soul', 'deep soul'],
        'MODERN SOUL': ['neo soul', 'progressive soul', 'psychedelic soul', 'smooth soul', 'pop soul'],
        'SOUL CROSSOVERS': ['soul jazz', 'Latin soul', 'country soul', 'blue-eyed soul'],
    },
    'pop rock': {
        'BEAT & POWER POP': ['beat music', 'beat rock', 'power pop', 'jangle pop', 'twee pop'],
        'BRITPOP & SOFT ROCK': ['Britpop', 'soft rock', 'piano rock', 'Donosti sound'],
        'POP ROCK AROUND THE WORLD': ['Burmese stereo', 'Manila sound', 'pop yeh-yeh', 'tropical rock'],
    },
    'trap music': {
        'TRAP FUSIONS': ['trap soul', 'trap metal', 'new jazz', 'plugg music'],
        'RAGE & PHONK': ['rage', 'rare phonk', 'sigilkore', 'no melody trap', 'tread rap'],
        'TRAP AROUND THE WORLD': ['Afro trap', 'Latin trap', 'trap shaabi', 'regalia'],
    },
    'country music': {
        'TRADITIONAL COUNTRY': ['traditional country music', 'classic country', 'honky tonk', 'western music', 'Western swing'],
        'MODERN NASHVILLE': ['Nashville sound', 'contemporary country', 'truck-driving country'],
        'ALTERNATIVE & REGIONAL': ['alternative country', 'progressive country', 'Texas country music', 'country and Irish', 'Czech tramping music'],
    },
    'techno': {
        'DETROIT & CLASSIC TECHNO': ['Detroit techno', 'bleep techno', 'acid techno', 'minimal techno'],
        'HARD & INDUSTRIAL TECHNO': ['hard techno', 'industrial techno', 'Belgian hardcore techno', 'hardgroove techno'],
        'DEEP & MELODIC TECHNO': ['deep techno', 'melodic techno', 'peak time techno', 'wonky techno'],
    },
    'art music': {
        'WESTERN ART MUSIC': ['classical music', 'avant-garde music', 'pìobaireachd'],
        'EAST ASIAN COURT MUSIC': ['Japanese classical music', 'Korean court music', 'gagaku', 'guoyue', 'Vietnamese classical music'],
        'OTHER CLASSICAL TRADITIONS': ['Indian classical music', 'Southeast Asian classical music', 'maqāmic music', 'kete'],
    },
    'black metal': {
        'ATMOSPHERIC & MELODIC': ['atmospheric black metal', 'melodic black metal', 'symphonic black metal', 'depressive black metal', 'pagan black metal'],
        'RAW & DISSONANT': ["black 'n' roll", 'black noise', 'dissonant black metal', 'viking metal', 'war metal'],
    },
    'alternative rock': {
        'INDIE & GUITAR': ['indie rock', 'shoegaze', 'gothic rock', 'geek rock', 'Japanese rock'],
        'GRUNGE & EMO': ['grunge', 'post-grunge', 'emo', 'post-Britpop', 'alternative dance'],
    },
    'cumbia': {
        'ANDEAN & PACIFIC CUMBIA': ['Colombian cumbia', 'Peruvian cumbia', 'Chilean cumbia', 'new Chilean cumbia', 'bullerengue'],
        'SOUTHERN & MODERN CUMBIA': ['Argentine cumbia', 'cumbia santafesina', 'Mexican cumbia', 'cumbia salvadoreña', 'digital cumbia'],
    },
    'Southeast Asian classical music': {
        'INDONESIAN TRADITIONS': ['gamelan', 'kacapi suling', 'tembang sunda', 'saluang klasik', 'kakawin'],
        'MAINLAND & PHILIPPINE': ['Burmese classical music', 'Thai classical music', 'pinpeat', 'mahori', 'kulintang'],
    },
    'experimental music': {
        'NOISE & DRONE': ['noise music', 'drone music', 'industrial music', 'sound art', 'tape music'],
        'IMPROVISATION & PROCESS': ['free improvisation', 'conducted improvisation', 'modern creative', 'reductionism', 'data sonification music'],
    },
    'breakbeat': {
        'BIG BEAT & FUNKY BREAKS': ['big beat', 'funky breaks', 'Florida breaks', 'West Coast breaks', 'breakbeat kota'],
        'NU SKOOL & PSY BREAKS': ['nu skool breaks', 'progressive breaks', 'psybreaks', 'acid breaks'],
    },
    'punk music': {
        'PUNK ROOTS': ['proto-punk', 'punk rock', 'cowpunk', 'punk blues', 'folk punk'],
        'POST-PUNK & ART PUNK': ['post-punk', 'post-hardcore', 'art punk', 'synth-punk'],
    },
    'modern classical music': {
        'EARLY MODERNISM': ['impressionist music', 'expressionist music', 'futurism', 'neoclassical music'],
        'POST-WAR & PROCESS': ['serialism', 'minimalist music', 'process music', 'microtonal classical music', 'contemporary classical music'],
    },
    'gamelan': {
        'JAVA & BALI': ['Javanese gamelan', 'Gamelan Bali', 'gamelan degung', 'gamelan salendro', 'gamelan sekaten'],
        'OTHER GAMELAN': ['Malay gamelan', 'American gamelan', 'gamelan joged bumbung', 'gamelan siteran'],
    },
    'metalcore': {
        'DEATHCORE & EXTREME': ['deathcore', 'downtempo deathcore', 'thall', 'mathcore'],
        'MELODIC & PROGRESSIVE': ['melodic metalcore', 'progressive metalcore', 'easycore', 'electronicore'],
    },
    'Hindustani classical music': {
        'DHRUPAD & KHYAL': ['dhrupad', 'Khyal', 'tappa', 'tarana'],
        'DEVOTIONAL & LIGHT': ['Abhang', 'qawwali', 'Thumri', 'Klasik'],
    },
    'maqāmic music': {
        'ARAB & ANDALUSI': ['Andalusi classical music', 'Iraqi maqam', 'Ottoman classical music', 'Sufiana kalam'],
        'PERSIAN & CENTRAL ASIAN': ['Persian traditional music', 'mugham', 'muqam', 'shashmaqam'],
    },
    'Gamelan Bali': {
        'CEREMONIAL GAMELAN': ['Gamelan selunding', 'gamelan angklung', 'gamelan beleganjur', 'gamelan gong gede'],
        'THEATRE & MODERN GAMELAN': ['gamelan gender wayang', 'gamelan gong kebyar', 'gamelan jegog', 'gamelan semar pegulingan'],
    },
    'rhythm and blues': {
        'CLASSIC R&B': ['New Orleans rhythm and blues', 'British rhythm and blues', 'doo-wop', 'boogie', 'swamp pop'],
        'SOUL & DISCO': ['soul', 'disco', 'boogaloo', 'beach music'],
    },
}
STYLES.update(MORE_STYLES)

# --- The level above ---------------------------------------------------------
# Folk ends at 24 groups and Latin at 14, more than the ring holds. A continent
# above them turns the label into a path ("EUROPE > IBERIA"), which the atlas
# cuts one segment at a time. Same for the branches that came out at 9 groups.
SUPER = {
    'folk music': {
        'NORTH AMERICA': 'THE AMERICAS', 'BRAZIL & THE GUIANAS': 'THE AMERICAS',
        'THE CARIBBEAN': 'THE AMERICAS', 'RÍO DE LA PLATA': 'THE AMERICAS',
        'ANDES & PACIFIC COAST': 'THE AMERICAS', 'CARIBBEAN COAST': 'THE AMERICAS',
        'THE ANDES': 'THE AMERICAS',
        'WESTERN EUROPE': 'EUROPE', 'SPAIN': 'EUROPE', 'PORTUGAL': 'EUROPE',
        'ITALY & GREECE': 'EUROPE', 'THE BALKANS': 'EUROPE',
        'CENTRAL & EASTERN EUROPE': 'EUROPE',
        'JAPAN': 'ASIA', 'KOREA': 'ASIA', 'CHINA & MONGOLIA': 'ASIA',
        'SOUTH ASIA': 'ASIA', 'SOUTHEAST ASIA': 'ASIA',
        'WEST AFRICA': 'AFRICA & THE MIDDLE EAST',
        'CENTRAL & SOUTHERN AFRICA': 'AFRICA & THE MIDDLE EAST',
        'NORTH AFRICA & THE ISLANDS': 'AFRICA & THE MIDDLE EAST',
        'MIDDLE EAST': 'AFRICA & THE MIDDLE EAST',
    },
    'Latin music': {
        'SON & GUARACHA': 'CUBA & THE CARIBBEAN',
        'RUMBA & AFRO-CUBAN': 'CUBA & THE CARIBBEAN',
        'DANZÓN & BALLROOM': 'CUBA & THE CARIBBEAN',
        'THE ISLANDS': 'CUBA & THE CARIBBEAN',
        'SAMBA & BOSSA NOVA': 'BRAZIL', 'NORTHEASTERN BRAZIL': 'BRAZIL',
        'MODERN BRAZILIAN POP': 'BRAZIL',
        'THE ANDES': 'THE ANDES & THE PACIFIC',
        'COLOMBIA & VENEZUELA': 'THE ANDES & THE PACIFIC',
    },
    'rock music': {
        'BLUES & SOUTHERN ROCK': 'ROOTS ROCK',
        'FOLK, COUNTRY & ACOUSTIC': 'ROOTS ROCK',
        # Pop rock and new wave split in two, so these two share a level to
        # keep Rock at 8.
        'PSYCHEDELIC & EXPERIMENTAL': 'ART & PROGRESSIVE ROCK',
        'PROGRESSIVE & THEATRICAL': 'ART & PROGRESSIVE ROCK',
    },
    'electronic dance music': {
        'DUBSTEP & BASS': 'BASS MUSIC', 'TRAP & HYPERPOP': 'BASS MUSIC',
        'UK & US CLUB': 'CLUB & BREAKS', 'BREAKBEAT & JUNGLE': 'CLUB & BREAKS',
    },
    'house music': {
        'CHICAGO & THE ORIGINS': 'CLASSIC HOUSE',
        'SOUL, JAZZ & VOCAL HOUSE': 'CLASSIC HOUSE',
    },
    'pop music': {
        'SOUTH & SOUTHEAST ASIAN POP': 'POP AROUND THE WORLD',
        'MIDDLE EASTERN & AFRICAN POP': 'POP AROUND THE WORLD',
        'LATIN POP': 'POP AROUND THE WORLD',
    },
}

# --- A third segment, where a group is still wider than the ring -------------
# 15 groups came out between 9 and 15 members. Without a segment below them the
# map had nothing left to cut on and fell back on the decade, which is the one
# thing this whole mechanism exists to remove.
DEEP = {
    'Latin music': {
        'HAITI & THE FRENCH CARIBBEAN': ['cadence rampa', 'konpa', 'rasin', 'twoubadou', 'biguine'],
        'PUERTO RICO, HISPANIOLA & THE COAST': ['bomba', 'plena', 'merengue', 'cumbia', 'Dominican dembow'],
        'BALLROOM & COUPLE DANCES': ['tango', 'salsa', 'bachata', 'cha-cha-chá'],
        'CARNIVAL & STREET': ['frevo', 'marchinha', 'murga', 'rara'],
        'SONG FORMS': ['cuplé', 'forró'],
        'MEXICO': ['New Mexico music', 'chilena', 'merequetengue', 'regional Mexican', 'rock urbano mexicano', 'tropicanibalismo'],
        'CENTRAL AMERICA': ['son nica', 'xuc', 'tamborera'],
    },
    'electronic dance music': {
        'DUBSTEP & GRIME': ['dubstep', 'post-dubstep', 'grime'],
        'FUTURE & MELODIC BASS': ['future bass', 'melodic bass', 'midtempo bass'],
        'GLITCH & WONKY': ['glitch hop (EDM)', 'wonky', 'skweee'],
        'AFRICAN CLUB': ['kuduro', 'singeli', 'coupé-décalé', 'balani show', 'bérite club', 'shangaan electro'],
        'LATIN CLUB': ['electro latino', 'electrotango', 'tecnorumba', 'tribal guarachero', 'moombahton', 'moombahcore', 'Nortec'],
        'ASIAN CLUB': ['funkot', 'budots'],
        'EURODANCE': ['Eurobeat', 'Eurodance', 'freestyle music', 'partyschlager'],
        'ELECTRO & BODY MUSIC': ['electroclash', 'electronic body music', 'electro swing'],
        'SYNTH REVIVAL': ['spacesynth', 'outrun'],
    },
    'rock music': {
        'AFRICA & THE MIDDLE EAST': ['Afro-rock', 'Zamrock', 'Anatolian rock', 'Sufi rock'],
        'EUROPE': ['flamenco rock', 'könsrock', 'miejski folk'],
        'LATIN AMERICA': ['Latin rock', 'rock andino'],
    },
    'folk music': {
        'ITALY': ['cantu a chiterra', 'cantu a tenore', 'canzone napoletana', 'liscio', 'paghjella', 'stornello'],
        'GREECE': ['Rebetiko', 'dimotiko', 'laïko', 'rizitika'],
        'SPANISH SONG': ['asturianada', 'copla', 'saeta', 'música festera'],
        'SPANISH DANCE': ['chotis madrileño', 'fandango', 'jota', 'muiñeira', 'pasodoble', 'sardana', 'trikiti'],
        'BRITAIN & IRELAND': ['Irish folk music', 'Scottish country dance music', 'Gaelic psalm singing', 'pipe band music'],
        'THE ALPS & CENTRAL EUROPE': ['Alpini song', 'Gstanzl', 'ländler music', 'Hungarian folk music', 'narodnozabavna glasba'],
        'FRANCE & THE MEDITERRANEAN': ['bal-musette', 'kan ha diskan', 'għana', 'pagan folk'],
        'SONG': ['colindă', 'drinking song', 'seguidilla', 'white voice', 'yodel', 'trallalero'],
        'DANCE & REVIVAL': ['contra dance music', 'contemporary folk music', 'industrial folk music', 'neo-medieval music'],
        'BRAZILIAN SONG & POETRY': ['cantoria', 'modinha', 'aboio', 'toada de boi', 'cururu'],
        'BRAZILIAN DANCE & DRUMMING': ['samba de roda', 'jongo', 'maracatu', 'xaxado', 'fandango caiçara', 'lundu'],
        'FIDDLE TRADITIONS': ['Cape Breton fiddling', 'James Bay fiddling', 'Métis fiddle', 'old-time music', 'Appalachian folk music'],
        'AFRICAN-AMERICAN TRADITIONS': ['spirituals', 'ring shout', 'talking blues'],
        'INDIGENOUS TRADITIONS': ['rabbit song', 'unakesa'],
        'THE PHILIPPINES': ['Philippine rondalla', 'balitaw', 'harana', 'kundiman'],
        'VIETNAM': ['chèo', 'quan họ', 'xẩm'],
        'INDONESIA': ['gondang', 'kuda kepang', 'tarawangsa'],
        'INDIA': ['Burra katha', 'biraha', 'kirtan', 'urumi melam'],
        'BENGAL & THE HIMALAYA': ['baul gaan', 'dohori', 'nepali lok geet', 'boedra'],
        'SRI LANKA & THE MALDIVES': ['sarala gee', 'boduberu'],
    },
    'classical music': {
        'COUNTERPOINT & IMPROVISATION': ['fugue', 'ricercar', 'fantasia', 'toccata', 'prelude'],
        'CHARACTER PIECES': ['bagatelle', 'capriccio', 'character piece', 'impromptu', 'étude'],
    },
    'hip-hop': {
        'SOUTHERN CLUB RAP': ['crunk', 'snap music', 'Miami bass', 'chopped and screwed'],
        'WEST COAST CLUB RAP': ['hyphy', 'jerk', 'ratchet music'],
        'EAST COAST CLUB RAP': ['Jersey club rap', 'Philly club rap'],
    },
    'pop music': {
        'ART POP': ['art pop', 'avant-pop', 'baroque pop', 'progressive pop', 'psychedelic pop'],
        'INDIE POP': ['indie pop', 'alternative pop', 'sophisti-pop', 'ambient pop'],
        'WESTERN EUROPEAN POP': ['Europop', 'Nederpop', 'schlager music', 'yé-yé'],
        'NORDIC POP': ['dansband music', 'dansktop'],
        'BALKAN & EASTERN EUROPEAN POP': ['chalga', 'manele', 'tallava', 'mulatós', 'rabiz'],
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
            # The finer cut wins over the region it came from. A name shared
            # by two genres is given by its Wikidata ID instead.
            for group, names in OVERRIDES.get(branch, {}).items():
                for n in names:
                    hits = [c for c in children if n in (c['name'], c['wikidata_id'])]
                    if not hits:
                        problems.append('%s : « %s » introuvable parmi les enfants' % (branch, n))
                    for hit in hits:
                        assigned[hit['wikidata_id']] = group

        missing = [c for c in children if c['wikidata_id'] not in assigned]
        for c in missing:
            problems.append('%s : « %s » sans groupe' % (branch, c['name']))

        for q, g in list(assigned.items()):
            top = SUPER.get(branch, {}).get(g)
            if top:
                assigned[q] = top + ' > ' + g

        # One more segment where the group is still wider than the ring.
        for seg, names in DEEP.get(branch, {}).items():
            for n in names:
                hits = [c for c in children if c['name'] == n]
                if not hits:
                    problems.append('%s : « %s » introuvable (DEEP)' % (branch, n))
                for hit in hits:
                    assigned[hit['wikidata_id']] += ' > ' + seg

        sizes = collections.Counter(a.split(' > ')[0] for a in assigned.values())
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
