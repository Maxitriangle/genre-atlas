<?php
/**
 * /about/: what the atlas is, how to use it, where its data comes from and
 * how to read a glyph (the former LEGEND page). The site-level /about/ is
 * not a genre's /genre/…/about/ page: that one stays the genre's own.
 *
 * The text is written here, once: the server prints it in the page, and the
 * script lifts it into the atlas's own layout, then draws the glyph legend
 * under it. The publisher stays unnamed, as on the legal page.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'init', 'genre_atlas_info_route', 11 );
function genre_atlas_info_route() {
	// Rendered by the atlas template, like /legal/. The rules are flushed by
	// genre_atlas_dossier_route() when the version changes.
	add_rewrite_rule( '^about/?$', 'index.php?post_type=genre&ga_info=1', 'top' );
}

add_filter( 'query_vars', 'genre_atlas_info_query_var' );
function genre_atlas_info_query_var( $vars ) {
	$vars[] = 'ga_info';
	return $vars;
}

function genre_atlas_is_info() {
	return is_post_type_archive( 'genre' ) && get_query_var( 'ga_info' );
}

/** How many artists the atlas lists. */
function genre_atlas_artist_count() {
	$c = wp_count_posts( 'ga_artist' );
	return isset( $c->publish ) ? (int) $c->publish : 0;
}

/** The text of the page, as sections: a heading and its paragraphs (HTML). */
function genre_atlas_info_sections() {
	$site    = esc_html( get_bloginfo( 'name' ) );
	$genres  = number_format( genre_atlas_genre_count() );
	$artists = genre_atlas_artist_count();
	$secs    = (int) genre_atlas_heard_after();
	$legal   = '<a href="' . esc_url( home_url( '/legal/#sources-and-credits' ) ) . '">legal page</a>';
	$contact = '<a href="' . esc_url( home_url( '/contact/' ) ) . '">contact page</a>';
	$random  = '<a href="' . esc_url( home_url( '/genre/random/' ) ) . '">RANDOM</a>';
	return array(
		'The project'        => array(
			$site . ' is an atlas of every music genre: ' . $genres . ' of them, from ambient to zydeco, each placed in one family tree. Every genre has a single parent, so a lineage can always be followed back to its roots: thrash metal comes from heavy metal, which comes from metal, which comes from rock.',
			'It is meant to be heard as much as read. Every genre that has songs plays them in full, and every genre page gives its key artists' . ( $artists ? ' (' . number_format( $artists ) . ' artists in all)' : '' ) . '.',
			'It is a personal, non-commercial project, made by one person in France. There is no advertising and no tracker of its own.',
		),
		'How it works'       => array(
			'<b>▶ LISTEN</b> plays a genre in full tracks, then moves on through its subgenres, one song each. Songs play in YouTube’s player, which loads only when you press play.',
			'<b>The map</b>: click a genre to open it, click it again to put it in the centre. Beyond eight subgenres, they are gathered by scene, style or region, never by date. The lineage stays on the left. LIST shows the same tree as an outline; on a phone, the map turns upright.',
			'<b>GENRE PAGE</b> gives a genre’s story, its lineage and up to 100 artists: the eight essentials first, each with a song, the others behind SHOW ALL.',
			'<b>☆ SAVE</b> keeps a genre in your atlas, and <b>♥</b> in the player keeps a song. With a free account, every genre you listen to for ' . $secs . ' seconds lights up on your map (◐ MY MAP), family by family. Your atlas can stay private or have its own public page.',
			'<b>+ SUGGEST AN ARTIST</b>: a band or an artist is missing from a genre? Suggest them from its page with a link. Every suggestion is checked by hand before it appears, and no e-mail is asked.',
			'<b>' . $random . '</b> draws a genre, anywhere or within a family, for when you do not know where to start.',
			'<b>Something wrong?</b> Every genre page has SUGGEST A CORRECTION, and the ' . $contact . ' is read by a person.',
		),
		'Where it comes from' => array(
			'The genres and their lineage come from Wikidata and MusicBrainz, then were sorted and grouped by hand. The texts are the introductions of Wikipedia’s articles (CC BY-SA 4.0), credited on each page.',
			'The artists come from Wikidata, kept when MusicBrainz’s listeners tag them with the genre, and from MusicBrainz itself; listeners’ suggestions join them once checked. The photos come from Wikimedia Commons, each with its author and licence.',
			'All the sources and credits are on the ' . $legal . '.',
		),
		'How to read a glyph' => array(
			'No glyph is drawn by hand: each is generated from the genre’s own data, so a subgenre always looks like its family. The frame and the colour give the family, the spokes the tempo, the rings the depth in the tree, the dots around the centre the direct subgenres, and the outer arc the era.',
		),
	);
}

function genre_atlas_info_html() {
	$out = '<h1>About</h1><div class="ga-info-text">';
	foreach ( genre_atlas_info_sections() as $title => $paras ) {
		$out .= '<section id="' . esc_attr( sanitize_title( $title ) ) . '"><h2>' . esc_html( $title ) . '</h2>';
		foreach ( array_filter( $paras ) as $p ) {
			$out .= '<p>' . wp_kses( $p, array( 'a' => array( 'href' => true ), 'b' => array() ) ) . '</p>';
		}
		$out .= '</section>';
	}
	return $out . '</div>';
}
