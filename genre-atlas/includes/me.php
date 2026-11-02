<?php
/**
 * /my-atlas/: the visitor's own atlas. Favourite genres (☆), favourite songs
 * (♥, played back as a list in the player bar) and the genres heard, each
 * counted once 20 seconds of one of its songs have played. Until accounts
 * exist, all of it is kept in the visitor's browser (local storage): nothing
 * reaches the site. The script draws the page; the server only gives it an
 * address, a title, and a page for search engines not to index.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'init', 'genre_atlas_me_route', 11 );
function genre_atlas_me_route() {
	// Rendered by the atlas template, like /contact/. The rules are flushed by
	// genre_atlas_dossier_route() when the version changes.
	add_rewrite_rule( '^my-atlas/?$', 'index.php?post_type=genre&ga_me=1', 'top' );
}

add_filter( 'query_vars', 'genre_atlas_me_query_var' );
function genre_atlas_me_query_var( $vars ) {
	$vars[] = 'ga_me';
	return $vars;
}

function genre_atlas_is_me() {
	return is_post_type_archive( 'genre' ) && get_query_var( 'ga_me' );
}

/** Seconds of listening after which a genre counts as heard. */
function genre_atlas_heard_after() {
	return max( 1, (int) apply_filters( 'genre_atlas_heard_after', 20 ) );
}

/** The page as served, before the script draws it (and for a visitor without script). */
function genre_atlas_me_html() {
	return '<h1>My atlas</h1><p>The genres you have heard, your favourite genres and your favourite songs. They are kept in your browser only, and this page needs JavaScript to show them.</p>';
}
