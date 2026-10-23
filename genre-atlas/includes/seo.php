<?php
/**
 * What search engines and social networks read: the dossier written into the
 * page itself (the script draws over it), the title and summary of each page,
 * the canonical address, the preview shared on social networks with the
 * genre's glyph, structured data, the site icon and the sitemap.
 *
 * A genre is found at its dossier, /genre/…/about/: the map URL of a genre
 * points there as its canonical address, and the sitemap lists the dossiers.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GENRE_ATLAS_OG_W       = 1200;
const GENRE_ATLAS_OG_H       = 630;
const GENRE_ATLAS_OG_DRAWING = 1; // Bump when the picture changes: every preview is drawn again.
const GENRE_ATLAS_BG         = array( 0x12, 0x10, 0x16 );
const GENRE_ATLAS_INK        = array( 0xE4, 0xDF, 0xF5 );
const GENRE_ATLAS_DIM        = array( 0x9A, 0x94, 0xB5 );
const GENRE_ATLAS_ACCENT     = array( 0xC2, 0xB0, 0xFB );

/** An SEO plugin, if one is active, writes the head: ours stays quiet. */
function genre_atlas_seo_plugin() {
	return defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' ) || defined( 'AIOSEO_VERSION' ) || defined( 'SEOPRESS_VERSION' ) || defined( 'THE_SEO_FRAMEWORK_VERSION' );
}

/* ---- The tree as the map shows it ----------------------------------------- */

/**
 * The tree with what the map adds to it, as build() and regroup() do in
 * atlas.js: tiles stand on their own with their shape and colour, wide
 * branches are cut into editorial groups. Read by the glyph, which counts the
 * dots and rings the visitor sees.
 *
 * @return array id => node; groups have string ids ("g12-0-1").
 */
function genre_atlas_model() {
	static $model = null;
	if ( null !== $model ) {
		return $model;
	}
	$tree = genre_atlas_tree();
	$n    = array();
	foreach ( $tree['nodes'] as $node ) {
		$node['kids']      = array();
		$node['dp']        = $node['p'];
		$n[ $node['id'] ] = $node;
	}
	foreach ( $n as $id => $node ) {
		if ( $node['p'] && isset( $n[ $node['p'] ] ) ) {
			$n[ $node['p'] ]['kids'][] = $id;
		} else {
			$n[ $id ]['p']  = 0;
			$n[ $id ]['dp'] = 0;
		}
	}
	$by_name = function ( $a, $b ) use ( &$n ) {
		return strcasecmp( remove_accents( $n[ $a ]['name'] ), remove_accents( $n[ $b ]['name'] ) );
	};
	foreach ( array_keys( $n ) as $id ) {
		usort( $n[ $id ]['kids'], $by_name );
	}
	$tiles = array_keys( array_filter( $n, function ( $x ) { return ! empty( $x['f'] ) || ! $x['p']; } ) );
	usort(
		$tiles,
		function ( $a, $b ) use ( &$n, $by_name ) {
			$fa = empty( $n[ $a ]['f'] ) ? 99 : $n[ $a ]['f'];
			$fb = empty( $n[ $b ]['f'] ) ? 99 : $n[ $b ]['f'];
			return $fa === $fb ? $by_name( $a, $b ) : $fa - $fb;
		}
	);
	$shapes = genre_atlas_shapes();
	foreach ( $tiles as $i => $id ) {
		if ( empty( $n[ $id ]['shape'] ) ) {
			$n[ $id ]['shape'] = $shapes[ $i % count( $shapes ) ];
		}
		$n[ $id ]['dbl']  = $i >= count( $shapes );
		$n[ $id ]['tile'] = $i + 1;
		if ( ! isset( $n[ $id ]['hue'] ) ) {
			$n[ $id ]['hue'] = fmod( 295 + 157.5 * ( $i + 1 ), 360 );
		}
		// A tile leaves its parent's ring: Metal is not a dot of Rock.
		if ( $n[ $id ]['p'] ) {
			$n[ $n[ $id ]['p'] ]['kids'] = array_values( array_diff( $n[ $n[ $id ]['p'] ]['kids'], array( $id ) ) );
			$n[ $id ]['dp']              = 0;
		}
	}
	foreach ( array_keys( $n ) as $id ) {
		$n[ $id ]['real'] = $n[ $id ]['kids'];
	}
	foreach ( array_keys( $n ) as $id ) {
		genre_atlas_model_cut( $n, $id, 0 );
	}
	$model = $n;
	return $model;
}

/** cut() of atlas.js: a branch wider than the ring becomes groups. */
function genre_atlas_model_cut( &$n, $id, $depth ) {
	$limit = 8;
	if ( count( $n[ $id ]['kids'] ) <= $limit ) {
		return;
	}
	$path     = function ( $k ) use ( &$n ) {
		return isset( $n[ $k ]['g'] ) ? array_values( array_filter( array_map( 'trim', explode( '>', strtoupper( $n[ $k ]['g'] ) ) ), 'strlen' ) ) : array();
	};
	$order    = array();
	$buckets  = array();
	$loose    = array();
	foreach ( $n[ $id ]['kids'] as $k ) {
		$p = $path( $k );
		if ( count( $p ) > $depth ) {
			if ( ! isset( $buckets[ $p[ $depth ] ] ) ) {
				$buckets[ $p[ $depth ] ] = array();
				$order[]                 = $p[ $depth ];
			}
			$buckets[ $p[ $depth ] ][] = $k;
		} else {
			$loose[] = $k;
		}
	}
	$total = count( $order ) + count( $loose );
	if ( $total < 2 || $total >= count( $n[ $id ]['kids'] ) || $total > $limit ) {
		// The alphabetical fallback: contiguous ranges, never more than the ring.
		$sorted  = $n[ $id ]['kids'];
		$parts   = (int) ceil( count( $sorted ) / $limit );
		$size    = (int) ceil( count( $sorted ) / $parts );
		$order   = array();
		$buckets = array();
		$loose   = array();
		for ( $i = 0; $i < count( $sorted ); $i += $size ) {
			$label             = 'a' . $i;
			$buckets[ $label ] = array_slice( $sorted, $i, $size );
			$order[]           = $label;
		}
		if ( count( $order ) < 2 || count( $order ) >= count( $n[ $id ]['kids'] ) ) {
			return;
		}
	}
	$groups = array();
	foreach ( $order as $i => $label ) {
		$gid         = 'g' . $id . '-' . $depth . '-' . $i;
		$n[ $gid ] = array(
			'id'    => $gid,
			'grp'   => true,
			'name'  => $label,
			'p'     => ! empty( $n[ $id ]['grp'] ) ? $n[ $id ]['p'] : $id,
			'dp'    => $id,
			'kids'  => $buckets[ $label ],
			'real'  => array(),
		);
		foreach ( $buckets[ $label ] as $m ) {
			$n[ $m ]['dp'] = $gid;
		}
		$groups[] = $gid;
	}
	$n[ $id ]['kids'] = array_merge( $groups, $loose );
	foreach ( $groups as $gid ) {
		genre_atlas_model_cut( $n, $gid, $depth + 1 );
	}
}

/** The family of a genre: the tile it stands under (or itself). */
function genre_atlas_model_family( $id ) {
	$n = genre_atlas_model();
	while ( isset( $n[ $id ] ) && $n[ $id ]['p'] && empty( $n[ $id ]['tile'] ) && isset( $n[ $n[ $id ]['p'] ] ) ) {
		$id = $n[ $id ]['p'];
	}
	return isset( $n[ $id ] ) ? $n[ $id ] : null;
}

/** The real lineage, from the tile down to the genre, as genre IDs. */
function genre_atlas_lineage( $id ) {
	$n     = genre_atlas_model();
	$trail = array( $id );
	while ( isset( $n[ $trail[0] ] ) && empty( $n[ $trail[0] ]['tile'] ) && $n[ $trail[0] ]['p'] && isset( $n[ $n[ $trail[0] ]['p'] ] ) ) {
		array_unshift( $trail, $n[ $trail[0] ]['p'] );
	}
	return $trail;
}

/** The colour of a family, from its hue, as color() in atlas.js. */
function genre_atlas_family_color( $id ) {
	$fam = genre_atlas_model_family( $id );
	return $fam ? genre_atlas_oklch( 0.80, 0.105, (float) $fam['hue'] ) : GENRE_ATLAS_ACCENT;
}

/** What the glyph of a genre reads, as glyph() does on the map. */
function genre_atlas_glyph_spec( $id ) {
	$n     = genre_atlas_model();
	$node  = $n[ $id ];
	$fam   = genre_atlas_model_family( $id );
	$depth = 0;
	for ( $x = $node; empty( $x['tile'] ) && $x['dp'] && isset( $n[ $x['dp'] ] ); $x = $n[ $x['dp'] ] ) {
		$depth++;
	}
	return array(
		'shape' => $fam['shape'],
		'dbl'   => ! empty( $fam['dbl'] ),
		'kids'  => count( $node['kids'] ),
		'depth' => $depth,
		'year'  => isset( $node['y'] ) ? $node['y'] : 0,
		'bpm'   => isset( $node['b'] ) ? $node['b'] : null,
		'color' => genre_atlas_family_color( $id ),
	);
}

/** The address of a genre's dossier: the one search engines are given. */
function genre_atlas_about_url( $id ) {
	return trailingslashit( get_permalink( $id ) ) . 'about/';
}

/** Number of genres, for the summaries ("2,098 genres"). */
function genre_atlas_genre_count() {
	$tree = genre_atlas_tree();
	return (int) $tree['count'];
}

/* ---- The dossier in the page ---------------------------------------------- */

/** The paragraphs of a genre's text. */
function genre_atlas_paragraphs( $post ) {
	$text = trim( wp_strip_all_tags( $post->post_content ) );
	return $text ? array_values( array_filter( array_map( 'trim', preg_split( '/\n\s*\n/', $text ) ) ) ) : array();
}

/**
 * A genre's dossier as plain HTML, with what the script shows: lineage, text,
 * facts, subgenres, key artists, songs, picks and sources. It is the page as
 * search engines and link previews read it; the script draws the map or the
 * dossier over it.
 */
function genre_atlas_dossier_html( $post ) {
	$n     = genre_atlas_model();
	$id    = $post->ID;
	$node  = isset( $n[ $id ] ) ? $n[ $id ] : array( 'real' => array(), 'p' => 0 );
	$fam   = genre_atlas_model_family( $id );
	$trail = genre_atlas_lineage( $id );
	$name  = get_the_title( $post );

	$crumbs = '<a href="' . esc_url( home_url( '/' ) ) . '">' . esc_html( get_bloginfo( 'name' ) ) . '</a>';
	foreach ( $trail as $a ) {
		$crumbs .= ' / ' . ( $a === $id ? '<span aria-current="page">' . esc_html( $name ) . '</span>' : '<a href="' . esc_url( genre_atlas_about_url( $a ) ) . '">' . esc_html( $n[ $a ]['name'] ) . '</a>' );
	}
	$out = '<nav aria-label="Lineage">' . $crumbs . '</nav><article><h1>' . esc_html( $name ) . '</h1>';

	$facts = array();
	if ( $fam && $fam['id'] === $id ) {
		$facts[] = 'Music genre family';
	} elseif ( $node['p'] && isset( $n[ $node['p'] ] ) ) {
		$facts[] = 'Subgenre of <a href="' . esc_url( genre_atlas_about_url( $node['p'] ) ) . '">' . esc_html( $n[ $node['p'] ]['name'] ) . '</a>' . ( $fam ? ', in the ' . esc_html( $fam['name'] ) . ' family' : '' );
	}
	if ( ! empty( $node['o'] ) ) {
		$facts[] = 'Origin: ' . esc_html( $node['o'] );
	}
	if ( ! empty( $node['y'] ) ) {
		$facts[] = 'Epoch: ' . (int) $node['y'];
	}
	$out .= $facts ? '<p>' . implode( ' · ', $facts ) . '</p>' : '';

	$paras = genre_atlas_paragraphs( $post );
	foreach ( $paras as $p ) {
		$out .= '<p>' . esc_html( $p ) . '</p>';
	}
	$wiki = (string) get_post_meta( $id, 'ga_wikipedia', true );
	$wurl = $wiki ? 'https://en.wikipedia.org/wiki/' . rawurlencode( str_replace( ' ', '_', $wiki ) ) : '';
	if ( $paras && $wurl && 'wikipedia' === get_post_meta( $id, 'ga_text_source', true ) ) {
		$out .= '<p><small>Text from <a href="' . esc_url( $wurl ) . '">Wikipedia</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</small></p>';
	}

	if ( $node['real'] ) {
		$out .= '<h2>Subgenres of ' . esc_html( $name ) . '</h2><ul>';
		foreach ( $node['real'] as $k ) {
			$out .= '<li><a href="' . esc_url( genre_atlas_about_url( $k ) ) . '">' . esc_html( $n[ $k ]['name'] ) . '</a></li>';
		}
		$out .= '</ul>';
	}

	$artists = genre_atlas_dossier_artists( $id );
	if ( $artists ) {
		$out .= '<h2>Key ' . esc_html( $name ) . ' artists</h2><ul>';
		foreach ( $artists as $a ) {
			$more = array_filter( array( $a['country'], $a['start'] ? 'since ' . $a['start'] : '' ) );
			$out .= '<li>' . esc_html( $a['name'] ) . ( $more ? ' (' . esc_html( implode( ', ', $more ) ) . ')' : '' ) . '</li>';
		}
		$out .= '</ul>';
		$songs = array_filter( $artists, function ( $a ) { return ! empty( $a['song'] ); } );
		if ( $songs ) {
			$out .= '<h2>Listen</h2><ol>';
			foreach ( $songs as $a ) {
				$out .= '<li>' . esc_html( $a['name'] ) . ', “' . esc_html( $a['song']['title'] ) . '”</li>';
			}
			$out .= '</ol>';
		}
	}

	$picks = genre_atlas_dossier_picks( $id );
	if ( $picks ) {
		$out .= '<h2>Community picks</h2><ul>';
		foreach ( $picks as $p ) {
			$out .= '<li><a href="' . esc_url( $p['url'] ) . '" rel="nofollow ugc noopener">' . esc_html( $p['name'] ) . '</a> (' . esc_html( $p['kind'] ) . ' on ' . esc_html( $p['platform'] ) . ')' . ( $p['note'] ? ': “' . esc_html( $p['note'] ) . '”' : '' ) . '</li>';
		}
		$out .= '</ul>';
	}

	$sources = array();
	if ( $wurl ) {
		$sources[] = '<a href="' . esc_url( $wurl ) . '">Wikipedia</a>';
	}
	$qid = (string) get_post_meta( $id, 'ga_wikidata_id', true );
	if ( $qid ) {
		$sources[] = '<a href="' . esc_url( 'https://www.wikidata.org/wiki/' . $qid ) . '">Wikidata</a>';
	}
	$mbid = (string) get_post_meta( $id, 'ga_musicbrainz_id', true );
	if ( $mbid ) {
		$sources[] = '<a href="' . esc_url( 'https://musicbrainz.org/genre/' . $mbid ) . '">MusicBrainz</a>';
	}
	if ( $sources ) {
		$out .= '<h2>Sources</h2><p>' . implode( ' · ', $sources ) . '</p>';
	}
	$out .= '<p><a href="' . esc_url( get_permalink( $id ) ) . '">' . esc_html( $name ) . ' on the map</a> · <a href="' . esc_url( home_url( '/contact/?genre=' . rawurlencode( implode( '/', array_map( function ( $a ) use ( $n ) { return isset( $n[ $a ] ) ? $n[ $a ]['slug'] : get_post_field( 'post_name', $a ); }, genre_atlas_real_trail( $id ) ) ) ) ) ) . '">Suggest a correction</a></p>';
	return $out . '</article>';
}

/** The real lineage up to the root, for the address of the contact form. */
function genre_atlas_real_trail( $id ) {
	$n     = genre_atlas_model();
	$trail = array( $id );
	while ( isset( $n[ $trail[0] ] ) && $n[ $trail[0] ]['p'] && isset( $n[ $n[ $trail[0] ]['p'] ] ) ) {
		array_unshift( $trail, $n[ $trail[0] ]['p'] );
	}
	return $trail;
}

/** The home page as plain HTML: what the atlas is, and every family with its subgenres. */
function genre_atlas_home_html() {
	$n     = genre_atlas_model();
	$tiles = array_filter( $n, function ( $x ) { return ! empty( $x['tile'] ); } );
	uasort( $tiles, function ( $a, $b ) { return $a['tile'] - $b['tile']; } );
	$out   = '<h1>' . esc_html( get_bloginfo( 'name' ) ) . '</h1>';
	$out  .= '<p>' . esc_html( genre_atlas_home_summary() ) . '</p>';
	foreach ( $tiles as $id => $t ) {
		$out .= '<h2><a href="' . esc_url( genre_atlas_about_url( $id ) ) . '">' . esc_html( $t['name'] ) . '</a></h2>';
		if ( $t['real'] ) {
			$out .= '<ul>';
			foreach ( $t['real'] as $k ) {
				$out .= '<li><a href="' . esc_url( genre_atlas_about_url( $k ) ) . '">' . esc_html( $n[ $k ]['name'] ) . '</a></li>';
			}
			$out .= '</ul>';
		}
	}
	$out .= '<p><a href="' . esc_url( home_url( '/genre/random/' ) ) . '">A genre at random</a> · <a href="' . esc_url( home_url( '/contact/' ) ) . '">Contact</a></p>';
	return $out;
}

function genre_atlas_home_summary() {
	return sprintf( 'An atlas of every music genre: %s genres in one family tree, each with its lineage, its subgenres, its key artists and a song to hear.', number_format( genre_atlas_genre_count() ) );
}

/* ---- Title, summary, canonical address ------------------------------------ */

/** Which page of the atlas this is: genre, about, home, random, contact, or ''. */
function genre_atlas_page_kind() {
	if ( genre_atlas_is_contact() ) {
		return 'contact';
	}
	if ( is_singular( 'genre' ) ) {
		return 'genre';
	}
	if ( is_post_type_archive( 'genre' ) && get_query_var( 'ga_random' ) ) {
		return 'random';
	}
	if ( is_post_type_archive( 'genre' ) || ( is_front_page() && get_option( 'genre_atlas_home', '1' ) ) ) {
		return 'home';
	}
	return '';
}

add_filter( 'document_title_parts', 'genre_atlas_title_parts' );
function genre_atlas_title_parts( $parts ) {
	if ( genre_atlas_seo_plugin() ) {
		return $parts;
	}
	$kind = genre_atlas_page_kind();
	if ( 'genre' === $kind ) {
		$parts['title'] = get_the_title( get_queried_object() ) . ': history, subgenres and key artists';
	} elseif ( 'random' === $kind ) {
		$parts['title'] = 'A genre at random';
	} elseif ( 'contact' === $kind ) {
		$parts['title'] = 'Contact';
	}
	return $parts;
}

/** A sentence or two of the text, cut at a word, under 160 characters. */
function genre_atlas_summary( $text, $max = 158 ) {
	$text = trim( preg_replace( '/\s+/', ' ', $text ) );
	if ( mb_strlen( $text ) <= $max ) {
		return $text;
	}
	$cut  = mb_substr( $text, 0, $max );
	$stop = max( mb_strrpos( $cut, '. ' ), 0 );
	if ( $stop > $max * 0.5 ) {
		return mb_substr( $cut, 0, $stop + 1 );
	}
	return rtrim( mb_substr( $cut, 0, mb_strrpos( $cut, ' ' ) ), ',;:' ) . '…';
}

/** The summary of the current page, for search results and previews. */
function genre_atlas_page_summary() {
	$kind = genre_atlas_page_kind();
	if ( 'genre' === $kind ) {
		$post  = get_queried_object();
		$paras = genre_atlas_paragraphs( $post );
		if ( $paras ) {
			return genre_atlas_summary( $paras[0] );
		}
		// No text yet: what the atlas knows of it, in a sentence.
		$n = genre_atlas_model();
		if ( ! isset( $n[ $post->ID ] ) ) { // a draft, seen in preview: not in the tree.
			return '';
		}
		$node = $n[ $post->ID ];
		$fam  = genre_atlas_model_family( $post->ID );
		$what = $node['p'] && empty( $node['tile'] ) && isset( $n[ $node['p'] ] ) ? 'a subgenre of ' . $n[ $node['p'] ]['name'] : 'a family of music genres';
		$what = get_the_title( $post ) . ' is ' . $what . ( ! empty( $node['o'] ) ? ' from ' . $node['o'] : '' ) . ( ! empty( $node['y'] ) ? ', around ' . $node['y'] : '' ) . '.';
		$subs = count( $node['real'] );
		return $what . ' Its lineage' . ( $subs ? ', ' . $subs . ' subgenre' . ( $subs > 1 ? 's' : '' ) : '' ) . ' and key artists on ' . get_bloginfo( 'name' ) . ', an atlas of every music genre.';
	}
	if ( 'random' === $kind ) {
		return 'A music genre drawn at random from ' . number_format( genre_atlas_genre_count() ) . ', anywhere or within a family: its story, its key artists and a song to hear.';
	}
	if ( 'contact' === $kind ) {
		return 'Write to ' . get_bloginfo( 'name' ) . ': feedback, a correction, a missing genre.';
	}
	if ( 'home' === $kind ) {
		return genre_atlas_home_summary();
	}
	return '';
}

/** The one address of the current page. */
function genre_atlas_canonical() {
	$kind = genre_atlas_page_kind();
	if ( 'genre' === $kind ) {
		return genre_atlas_about_url( get_queried_object_id() );
	}
	if ( 'contact' === $kind ) {
		return home_url( '/contact/' );
	}
	if ( 'random' === $kind ) {
		return home_url( '/genre/random/' );
	}
	if ( 'home' === $kind ) {
		return get_option( 'genre_atlas_home', '1' ) ? home_url( '/' ) : get_post_type_archive_link( 'genre' );
	}
	return '';
}

// Core writes the canonical of single posts: the dossier's is ours, so core's
// gives way on genres, and the head below writes it for every atlas page.
add_filter( 'get_canonical_url', 'genre_atlas_core_canonical', 10, 2 );
function genre_atlas_core_canonical( $url, $post ) {
	return ! genre_atlas_seo_plugin() && 'genre' === $post->post_type ? genre_atlas_about_url( $post->ID ) : $url;
}

// The random page changes on every visit: followed, not indexed.
add_filter( 'wp_robots', 'genre_atlas_robots' );
function genre_atlas_robots( $robots ) {
	if ( 'random' === genre_atlas_page_kind() ) {
		$robots['noindex'] = true;
		$robots['follow']  = true;
	}
	return $robots;
}

add_action( 'wp_head', 'genre_atlas_head', 2 );
function genre_atlas_head() {
	$kind = genre_atlas_page_kind();
	if ( ! $kind || genre_atlas_seo_plugin() ) {
		return;
	}
	$summary   = genre_atlas_page_summary();
	$canonical = genre_atlas_canonical();
	$title     = wp_get_document_title();
	$image     = 'genre' === $kind ? genre_atlas_og_image( get_queried_object_id() ) : genre_atlas_og_image( 0 );
	$site      = get_bloginfo( 'name' );

	echo "\n";
	if ( $summary ) {
		echo '<meta name="description" content="' . esc_attr( $summary ) . '">' . "\n";
	}
	if ( $canonical && ! is_singular() ) { // core writes it on single posts, with the filter above.
		echo '<link rel="canonical" href="' . esc_url( $canonical ) . '">' . "\n";
	}
	$og = array(
		'og:site_name'   => $site,
		'og:type'        => 'website',
		'og:title'       => 'genre' === $kind ? get_the_title( get_queried_object() ) : ( 'home' === $kind ? $site : $title ),
		'og:description' => $summary,
		'og:url'         => $canonical,
		'og:locale'      => 'en_US',
	);
	if ( $image ) {
		$og['og:image']        = $image;
		$og['og:image:width']  = GENRE_ATLAS_OG_W;
		$og['og:image:height'] = GENRE_ATLAS_OG_H;
		$og['og:image:alt']    = ( 'genre' === $kind ? 'The glyph of ' . get_the_title( get_queried_object() ) . ' on ' . $site : $site . ': ' . genre_atlas_home_summary() );
	}
	foreach ( $og as $property => $value ) {
		echo '<meta property="' . esc_attr( $property ) . '" content="' . esc_attr( $value ) . '">' . "\n";
	}
	echo '<meta name="twitter:card" content="' . ( $image ? 'summary_large_image' : 'summary' ) . '">' . "\n";

	$data = genre_atlas_structured_data( $kind, $summary, $canonical, $image );
	if ( $data ) {
		echo '<script type="application/ld+json">' . wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\n";
	}
}

/** Structured data: the site on the home page, breadcrumbs and subject on a genre. */
function genre_atlas_structured_data( $kind, $summary, $canonical, $image ) {
	$site = array(
		'@type' => 'WebSite',
		'@id'   => home_url( '/#website' ),
		'name'  => get_bloginfo( 'name' ),
		'url'   => home_url( '/' ),
	);
	if ( 'home' === $kind ) {
		$site['description'] = $summary;
		return array( '@context' => 'https://schema.org' ) + $site;
	}
	if ( 'genre' !== $kind ) {
		return null;
	}
	$id    = get_queried_object_id();
	$n     = genre_atlas_model();
	$items = array(
		array( '@type' => 'ListItem', 'position' => 1, 'name' => get_bloginfo( 'name' ), 'item' => home_url( '/' ) ),
	);
	foreach ( genre_atlas_lineage( $id ) as $i => $a ) {
		$items[] = array( '@type' => 'ListItem', 'position' => $i + 2, 'name' => isset( $n[ $a ] ) ? $n[ $a ]['name'] : get_the_title( $a ), 'item' => genre_atlas_about_url( $a ) );
	}
	$same = array();
	$wiki = (string) get_post_meta( $id, 'ga_wikipedia', true );
	if ( $wiki ) {
		$same[] = 'https://en.wikipedia.org/wiki/' . rawurlencode( str_replace( ' ', '_', $wiki ) );
	}
	$qid = (string) get_post_meta( $id, 'ga_wikidata_id', true );
	if ( $qid ) {
		$same[] = 'https://www.wikidata.org/wiki/' . $qid;
	}
	$page = array(
		'@type'       => 'WebPage',
		'@id'         => $canonical,
		'url'         => $canonical,
		'name'        => html_entity_decode( wp_get_document_title(), ENT_QUOTES, 'UTF-8' ),
		'description' => $summary,
		'isPartOf'    => array( '@id' => home_url( '/#website' ) ),
		'breadcrumb'  => array( '@type' => 'BreadcrumbList', 'itemListElement' => $items ),
		'about'       => array_filter(
			array(
				'@type'       => 'DefinedTerm',
				'name'        => get_the_title( $id ),
				'description' => $summary,
				'sameAs'      => $same,
			)
		),
	);
	if ( $image ) {
		$page['primaryImageOfPage'] = array( '@type' => 'ImageObject', 'url' => $image, 'width' => GENRE_ATLAS_OG_W, 'height' => GENRE_ATLAS_OG_H );
	}
	return array( '@context' => 'https://schema.org', '@graph' => array( $site, $page ) );
}

/* ---- The preview picture ----------------------------------------------------
 * 1200 × 630, drawn once per genre with GD and kept in the uploads folder,
 * under a name that changes with what it shows: a renamed genre gets a new
 * picture, and networks that keep the old one in cache see a new address. */

/**
 * URL of the preview picture of a genre (0: the site's), drawn if missing.
 * Empty when GD or the uploads folder is not there.
 */
function genre_atlas_og_image( $id ) {
	if ( ! function_exists( 'imagecreatetruecolor' ) || ! function_exists( 'imagettftext' ) ) {
		return '';
	}
	$what = $id ? genre_atlas_og_genre_card( $id ) : genre_atlas_og_home_card();
	if ( ! $what ) {
		return '';
	}
	$up = wp_upload_dir( null, false );
	if ( ! empty( $up['error'] ) ) {
		return '';
	}
	$name = ( $id ? $id : 'atlas' ) . '-' . substr( md5( wp_json_encode( $what ) . GENRE_ATLAS_OG_DRAWING ), 0, 10 ) . '.png';
	$dir  = trailingslashit( $up['basedir'] ) . 'genre-atlas/og/';
	$url  = trailingslashit( $up['baseurl'] ) . 'genre-atlas/og/' . $name;
	if ( file_exists( $dir . $name ) ) {
		return $url;
	}
	if ( ! wp_mkdir_p( $dir ) ) {
		return '';
	}
	foreach ( (array) glob( $dir . ( $id ? $id : 'atlas' ) . '-*.png' ) as $old ) {
		wp_delete_file( $old );
	}
	$img = genre_atlas_og_draw( $what );
	$ok  = $img && imagepng( $img, $dir . $name, 9 );
	return $ok ? $url : '';
}

/** What a genre's picture shows, which also names its file. */
function genre_atlas_og_genre_card( $id ) {
	$n = genre_atlas_model();
	if ( ! isset( $n[ $id ] ) ) {
		return null;
	}
	$node = $n[ $id ];
	$fam  = genre_atlas_model_family( $id );
	$top  = $fam && $fam['id'] === $id ? 'FAMILY' : ( $fam ? $fam['name'] : '' );
	$sub  = $node['p'] && empty( $node['tile'] ) && isset( $n[ $node['p'] ] ) ? 'SUBGENRE OF ' . $n[ $node['p'] ]['name'] : count( $node['real'] ) . ' SUBGENRES';
	return array(
		'glyphs' => array( genre_atlas_glyph_spec( $id ) ),
		'top'    => $top,
		'name'   => $node['name'],
		'lines'  => array_values( array_filter( array( $sub, implode( ' · ', array_filter( array( isset( $node['y'] ) ? (string) $node['y'] : '', isset( $node['o'] ) ? $node['o'] : '' ) ) ) ) ) ),
		'color'  => genre_atlas_family_color( $id ),
		'site'   => preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) ),
	);
}

/** The site's picture: the glyphs of the families, and what the atlas is. */
function genre_atlas_og_home_card() {
	$n     = genre_atlas_model();
	$tiles = array_filter( $n, function ( $x ) { return ! empty( $x['tile'] ); } );
	uasort( $tiles, function ( $a, $b ) { return $a['tile'] - $b['tile']; } );
	if ( ! $tiles ) {
		return null;
	}
	return array(
		'glyphs' => array_values( array_map( 'genre_atlas_glyph_spec', array_keys( $tiles ) ) ),
		'top'    => 'THE ATLAS OF EVERY MUSIC GENRE',
		'name'   => get_bloginfo( 'name' ),
		'lines'  => array( number_format( genre_atlas_genre_count() ) . ' GENRES · ' . count( $tiles ) . ' FAMILIES', 'ONE TREE · LINEAGE · KEY ARTISTS' ),
		'color'  => GENRE_ATLAS_ACCENT,
		'site'   => preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) ),
	);
}

/** Draws a card: glyph(s) on the left, the words on the right. */
function genre_atlas_og_draw( $card ) {
	$w    = GENRE_ATLAS_OG_W;
	$h    = GENRE_ATLAS_OG_H;
	$ss   = 3; // drawn three times larger, then shrunk: GD does not smooth its strokes.
	$big  = imagecreatetruecolor( $w * $ss, $h * $ss );
	$bg   = GENRE_ATLAS_BG;
	imagefill( $big, 0, 0, imagecolorallocate( $big, $bg[0], $bg[1], $bg[2] ) );

	$glyphs = $card['glyphs'];
	if ( 1 === count( $glyphs ) ) {
		genre_atlas_glyph_gd( $big, $glyphs[0], 70 * $ss, 105 * $ss, 420 * $ss, $bg );
	} else {
		// The families on a grid of 4 columns, as the home page tiles.
		$cols = 4;
		$cell = 112;
		foreach ( $glyphs as $i => $spec ) {
			$gx = 66 + ( $i % $cols ) * $cell;
			$gy = 62 + intdiv( $i, $cols ) * $cell;
			genre_atlas_glyph_gd( $big, $spec, $gx * $ss, $gy * $ss, 100 * $ss, $bg );
		}
	}
	$img = imagecreatetruecolor( $w, $h );
	imagecopyresampled( $img, $big, 0, 0, 0, 0, $w, $h, $w * $ss, $h * $ss );
	imagedestroy( $big );

	$col   = function ( $rgb ) use ( $img ) { return imagecolorallocate( $img, $rgb[0], $rgb[1], $rgb[2] ); };
	$ink   = $col( GENRE_ATLAS_INK );
	$dim   = $col( GENRE_ATLAS_DIM );
	$fam   = $col( $card['color'] );
	$line  = $col( array( 0x33, 0x2F, 0x3D ) );
	$bold  = GENRE_ATLAS_DIR . 'assets/fonts/azeret-mono-600.ttf';
	$reg   = GENRE_ATLAS_DIR . 'assets/fonts/azeret-mono-400.ttf';
	$left  = 1 === count( $glyphs ) ? 560 : 590;
	$width = $w - $left - 70;

	// The name, as large as fits in three lines without cutting a word.
	$name = mb_strtoupper( $card['name'] );
	for ( $size = 64; $size > 26; $size -= 4 ) {
		$cut   = false;
		$lines = genre_atlas_og_wrap( $name, $bold, $size, $width, $size * 0.02, $cut );
		if ( count( $lines ) <= 3 && ! $cut ) {
			break;
		}
	}
	$lines = array_slice( $lines, 0, 3 );
	$lead  = (int) round( $size * 1.18 );
	$block = 40 + 28 + count( $lines ) * $lead + 26 + count( $card['lines'] ) * 34;
	$y     = (int) max( 70, ( $h - 70 - $block ) / 2 + 20 );

	genre_atlas_og_text( $img, $card['top'] ? mb_strtoupper( $card['top'] ) : '', $reg, 17, $left, $y + 18, $fam, 17 * 0.12 );
	$y += 40 + 28;
	foreach ( $lines as $l ) {
		$y += $lead;
		genre_atlas_og_text( $img, $l, $bold, $size, $left, $y - (int) round( $size * 0.25 ), $ink, $size * 0.02 );
	}
	$y += 26;
	foreach ( $card['lines'] as $l ) {
		$y += 34;
		genre_atlas_og_text( $img, mb_strtoupper( $l ), $reg, 17, $left, $y, $dim, 17 * 0.1, $width );
	}
	imageline( $img, 70, $h - 92, $w - 70, $h - 92, $line );
	genre_atlas_og_text( $img, mb_strtoupper( $card['site'] ), $bold, 16, 70, $h - 52, $ink, 16 * 0.14 );
	genre_atlas_og_text( $img, 'AN ATLAS OF EVERY MUSIC GENRE', $reg, 16, $w - 70 - genre_atlas_og_width( 'AN ATLAS OF EVERY MUSIC GENRE', $reg, 16, 16 * 0.1 ), $h - 52, $dim, 16 * 0.1 );
	return $img;
}

/** Width of a text set letter by letter with extra spacing, as the site's capitals. */
function genre_atlas_og_width( $text, $font, $size, $spacing ) {
	$wd = 0;
	foreach ( preg_split( '//u', $text, -1, PREG_SPLIT_NO_EMPTY ) as $ch ) {
		$box = imagettfbbox( $size, 0, $font, $ch );
		$wd += ( ' ' === $ch ? $size * 0.6 : $box[2] - $box[0] ) + $spacing;
	}
	return (int) ceil( $wd - $spacing );
}

/** Writes a text letter by letter (GD has no letter spacing), cut with … past $max. */
function genre_atlas_og_text( $img, $text, $font, $size, $x, $y, $color, $spacing, $max = 0 ) {
	if ( $max && genre_atlas_og_width( $text, $font, $size, $spacing ) > $max ) {
		while ( mb_strlen( $text ) > 1 && genre_atlas_og_width( $text . '…', $font, $size, $spacing ) > $max ) {
			$text = rtrim( mb_substr( $text, 0, -1 ) );
		}
		$text .= '…';
	}
	foreach ( preg_split( '//u', $text, -1, PREG_SPLIT_NO_EMPTY ) as $ch ) {
		$box = imagettftext( $img, $size, 0, (int) round( $x ), $y, $color, $font, $ch );
		$x  += ( ' ' === $ch ? $size * 0.6 : $box[2] - $box[0] ) + $spacing;
	}
}

/** Cuts a name into lines that fit, at spaces and hyphens; a word too long is cut itself. */
function genre_atlas_og_wrap( $text, $font, $size, $width, $spacing, &$cut = false ) {
	$words = preg_split( '/(?<=[\s\-\/])/u', $text );
	$lines = array( '' );
	foreach ( $words as $word ) {
		$try = $lines[ count( $lines ) - 1 ] . $word;
		if ( '' === $lines[ count( $lines ) - 1 ] || genre_atlas_og_width( rtrim( $try ), $font, $size, $spacing ) <= $width ) {
			$lines[ count( $lines ) - 1 ] = $try;
		} else {
			$lines[] = $word;
		}
	}
	$out = array();
	foreach ( $lines as $l ) {
		$l = rtrim( $l );
		while ( genre_atlas_og_width( $l, $font, $size, $spacing ) > $width && mb_strlen( $l ) > 1 ) {
			// A single word wider than the column: cut it, the rest goes on.
			for ( $k = mb_strlen( $l ) - 1; $k > 1 && genre_atlas_og_width( mb_substr( $l, 0, $k ), $font, $size, $spacing ) > $width; $k-- ) {
			}
			$out[] = mb_substr( $l, 0, $k );
			$l     = mb_substr( $l, $k );
			$cut   = true;
		}
		$out[] = $l;
	}
	return $out;
}

/* ---- Site icon ---------------------------------------------------------------
 * The glyph of the atlas itself: a hexagon in a ring of eight, the most the map
 * shows around a centre. Used when no icon is set in Appearance > Customize. */

// Core writes the icon links (32, 180, 192 and 270 px) from the site icon, and
// sends /favicon.ico there: with none set, it answers with ours instead of the
// WordPress logo. The SVG, sharp at every size, is added beside them.
add_filter( 'get_site_icon_url', 'genre_atlas_site_icon_url', 10, 2 );
function genre_atlas_site_icon_url( $url, $size ) {
	if ( get_option( 'site_icon' ) ) {
		return $url;
	}
	$file = $size <= 48 ? 'icon-48.png' : ( 180 === (int) $size ? 'apple-touch-icon.png' : 'icon-192.png' );
	return GENRE_ATLAS_URL . 'assets/icons/' . $file . '?v=' . GENRE_ATLAS_VERSION;
}

add_action( 'wp_head', 'genre_atlas_icon_svg', 98 );
function genre_atlas_icon_svg() {
	if ( ! get_option( 'site_icon' ) ) {
		echo '<link rel="icon" href="' . esc_url( GENRE_ATLAS_URL . 'assets/icons/favicon.svg?v=' . GENRE_ATLAS_VERSION ) . '" type="image/svg+xml">' . "\n";
	}
}

/* ---- Sitemap -------------------------------------------------------------- */

// Each genre is listed at its dossier, the address search engines are given.
add_filter( 'wp_sitemaps_posts_entry', 'genre_atlas_sitemap_entry', 10, 3 );
function genre_atlas_sitemap_entry( $entry, $post, $post_type ) {
	if ( 'genre' === $post_type ) {
		$entry['loc'] = genre_atlas_about_url( $post->ID );
	}
	return $entry;
}

// The users' sitemap only gives away the login name of the site's author.
add_filter( 'wp_sitemaps_add_provider', 'genre_atlas_sitemap_providers', 10, 2 );
function genre_atlas_sitemap_providers( $provider, $name ) {
	return 'users' === $name ? false : $provider;
}
