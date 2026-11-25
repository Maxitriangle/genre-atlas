<?php
/**
 * /support/: donations, through Ko-fi. The site only links to Ko-fi: no
 * script, no widget, no request to Ko-fi before a visitor follows the link,
 * so nothing changes for privacy until they do. Nothing is given in return
 * and nothing is behind a paywall: the goals say what the money pays for.
 *
 * Everything stays hidden until a Ko-fi address is set in Genres → Settings.
 * The amount raised each month is typed there by hand (Ko-fi gives no feed
 * of it), as are the goals.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'init', 'genre_atlas_support_route', 11 );
function genre_atlas_support_route() {
	// Rendered by the atlas template, like /about/. The rules are flushed by
	// genre_atlas_dossier_route() when the version changes.
	add_rewrite_rule( '^support/?$', 'index.php?post_type=genre&ga_support=1', 'top' );
}

add_filter( 'query_vars', 'genre_atlas_support_query_var' );
function genre_atlas_support_query_var( $vars ) {
	$vars[] = 'ga_support';
	return $vars;
}

/** The Ko-fi page, or '' while none is set: then nothing about support shows. */
function genre_atlas_support_url() {
	$url = (string) get_option( 'genre_atlas_support_url', '' );
	return 0 === strpos( $url, 'https://' ) ? $url : '';
}

function genre_atlas_is_support() {
	return is_post_type_archive( 'genre' ) && get_query_var( 'ga_support' ) && genre_atlas_support_url();
}

const GENRE_ATLAS_SUPPORT_GOALS = "30 | Hosting and domain, every month\n150 | A curator a few hours a month: empty genres filled, artists checked\n1000 | More time on the atlas: new features and deeper curation";

/** The goals, smallest first: [ [ euros per month, what it pays for ], … ]. */
function genre_atlas_support_goals() {
	$out = array();
	foreach ( preg_split( '/\R/', (string) get_option( 'genre_atlas_support_goals', GENRE_ATLAS_SUPPORT_GOALS ) ) as $line ) {
		$p = array_map( 'trim', explode( '|', $line, 2 ) );
		if ( 2 === count( $p ) && (int) $p[0] > 0 && '' !== $p[1] ) {
			$out[] = array( (int) $p[0], $p[1] );
		}
	}
	usort( $out, function ( $a, $b ) { return $a[0] - $b[0]; } );
	return $out;
}

/** Euros a month raised so far, as typed in the settings; null when left blank. */
function genre_atlas_support_raised() {
	$v = get_option( 'genre_atlas_support_raised', '' );
	return '' === $v ? null : max( 0, (int) $v );
}

/** What the script needs: null while support is off. */
function genre_atlas_support_config() {
	$url = genre_atlas_support_url();
	if ( ! $url ) {
		return null;
	}
	return array(
		'url'    => $url,
		'page'   => home_url( '/support/' ),
		'raised' => genre_atlas_support_raised(),
		'goals'  => genre_atlas_support_goals(),
	);
}

/** The text of the page, as sections: a heading and its paragraphs (HTML). */
function genre_atlas_support_sections() {
	$site = esc_html( get_bloginfo( 'name' ) );
	$kofi = '<a href="' . esc_url( genre_atlas_support_url() ) . '" rel="noopener">Ko-fi</a>';
	return array(
		'Why'           => array(
			$site . ' is made by one person, in their spare time. Open data got it started, with ' . number_format( genre_atlas_genre_count() ) . ' genres and their artists, but only people listening and checking can make it right: hundreds of genres are still waiting for their first artist, and every lineage deserves a second look.',
			'Your support pays for that time: listening, checking artists, filling empty genres, fixing lineages, and, as it grows, a curator’s hours.',
		),
		'No strings'    => array(
			'Nothing is behind a paywall and nothing is given in return: the atlas stays free and the same for everyone, without ads.',
			'Donations are made on ' . $kofi . ', once or every month, under its own terms and privacy policy. This site never sees your card or your address, and asks nothing of Ko-fi until you follow the link.',
		),
	);
}

function genre_atlas_support_html() {
	$out = '<h1>Support the atlas</h1><div class="ga-support-text">';
	foreach ( genre_atlas_support_sections() as $title => $paras ) {
		$out .= '<section id="' . esc_attr( sanitize_title( $title ) ) . '"><h2>' . esc_html( $title ) . '</h2>';
		foreach ( $paras as $p ) {
			$out .= '<p>' . wp_kses( $p, array( 'a' => array( 'href' => true, 'rel' => true ) ) ) . '</p>';
		}
		$out .= '</section>';
	}
	$out .= '</div><h2>What it pays for, each month</h2><ul>';
	foreach ( genre_atlas_support_goals() as $g ) {
		$out .= '<li>€' . (int) $g[0] . ': ' . esc_html( $g[1] ) . '</li>';
	}
	return $out . '</ul><p><a href="' . esc_url( genre_atlas_support_url() ) . '" rel="noopener">Support the atlas on Ko-fi</a></p>';
}

/** The settings, in Genres → Settings. */
function genre_atlas_support_settings_save() {
	$url = isset( $_POST['genre_atlas_support_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['genre_atlas_support_url'] ) ), array( 'https' ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification -- checked by the settings page.
	update_option( 'genre_atlas_support_url', $url );
	$raised = isset( $_POST['genre_atlas_support_raised'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['genre_atlas_support_raised'] ) ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	update_option( 'genre_atlas_support_raised', '' === $raised ? '' : (string) max( 0, (int) $raised ) );
	if ( isset( $_POST['genre_atlas_support_goals'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		update_option( 'genre_atlas_support_goals', sanitize_textarea_field( wp_unslash( $_POST['genre_atlas_support_goals'] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification
	}
}

function genre_atlas_support_settings_fields() {
	echo '<h2>Donations (Ko-fi)</h2><p class="description">With a Ko-fi address, the atlas shows ♥ SUPPORT in its menu and foot, a <a href="' . esc_url( home_url( '/support/' ) ) . '">' . esc_html( home_url( '/support/' ) ) . '</a> page, a section on the About page, a line in the player once a week after a few songs, and a word on genres with no artist yet. Left empty, none of it shows.</p><table class="form-table" role="presentation"><tbody>';
	echo '<tr><th scope="row"><label for="genre_atlas_support_url">Ko-fi page</label></th><td><input class="regular-text" type="url" id="genre_atlas_support_url" name="genre_atlas_support_url" value="' . esc_attr( get_option( 'genre_atlas_support_url', '' ) ) . '" placeholder="https://ko-fi.com/yourname"></td></tr>';
	echo '<tr><th scope="row"><label for="genre_atlas_support_raised">Raised each month (€)</label></th><td><input class="small-text" type="number" min="0" id="genre_atlas_support_raised" name="genre_atlas_support_raised" value="' . esc_attr( get_option( 'genre_atlas_support_raised', '' ) ) . '"><p class="description">Typed by hand from Ko-fi: monthly supporters, plus one-off gifts if you like. Left blank, the page shows the goals without a gauge.</p></td></tr>';
	echo '<tr><th scope="row"><label for="genre_atlas_support_goals">Goals</label></th><td><textarea class="large-text" rows="4" id="genre_atlas_support_goals" name="genre_atlas_support_goals">' . esc_textarea( get_option( 'genre_atlas_support_goals', GENRE_ATLAS_SUPPORT_GOALS ) ) . '</textarea><p class="description">One per line: euros per month, a bar, what it pays for. In English, as on the site.</p></td></tr>';
	echo '</tbody></table>';
}
