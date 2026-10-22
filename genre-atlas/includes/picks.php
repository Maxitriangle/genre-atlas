<?php
/**
 * Community picks: anyone can suggest an artist or a playlist for a genre,
 * from its dossier. Nothing is shown before Maxime approves it by hand in
 * Suggestions. A pick is a link, on a closed list of listening platforms:
 * no picture, no embedded player.
 *
 * Statuses: pending (waiting), publish (on the dossier), trash (rejected,
 * emptied by WordPress after 30 days).
 *
 * Approved links are checked once a week. One that is gone is flagged in
 * Suggestions and stays on the dossier: Maxime decides what becomes of it.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GENRE_ATLAS_PICKS_PER_HOUR = 10; // Per connection.
const GENRE_ATLAS_PICK_RECHECK    = 6 * DAY_IN_SECONDS + 12 * HOUR_IN_SECONDS; // A week, give or take the daily run.
const GENRE_ATLAS_PICK_CONFIRM    = 20 * HOUR_IN_SECONDS; // A link found gone is tried again the next day.
const GENRE_ATLAS_PICK_BUDGET     = 20; // Seconds of checking per run, under any host's time limit.

/**
 * The platforms a pick may link to: label => hosts. A host matches itself
 * and its subdomains (any artist's page on bandcamp.com).
 */
function genre_atlas_pick_platforms() {
	return array(
		'Spotify'     => array( 'open.spotify.com', 'spotify.link' ),
		'Deezer'      => array( 'deezer.com', 'deezer.page.link', 'link.deezer.com' ),
		'YouTube'     => array( 'youtube.com', 'youtu.be' ),
		'Apple Music' => array( 'music.apple.com' ),
		'Bandcamp'    => array( 'bandcamp.com' ),
		'SoundCloud'  => array( 'soundcloud.com' ),
		'Tidal'       => array( 'tidal.com' ),
		'Qobuz'       => array( 'qobuz.com' ),
	);
}

/**
 * A link reduced to what it points at, with its platform: the scheme forced to
 * https, tracking parameters and the fragment dropped. Null if the link is not
 * on a platform of the list.
 *
 * @return array|null { url, platform }
 */
function genre_atlas_pick_link( $url ) {
	$url = trim( (string) $url );
	if ( ! preg_match( '#^https?://#i', $url ) ) {
		$url = 'https://' . $url;
	}
	$parts = wp_parse_url( $url );
	if ( ! $parts || empty( $parts['host'] ) ) {
		return null;
	}
	$host     = strtolower( $parts['host'] );
	$platform = '';
	foreach ( genre_atlas_pick_platforms() as $label => $hosts ) {
		foreach ( $hosts as $h ) {
			if ( $host === $h || substr( $host, -strlen( '.' . $h ) ) === '.' . $h ) {
				$platform = $label;
				break 2;
			}
		}
	}
	if ( ! $platform ) {
		return null;
	}
	$query = array();
	if ( ! empty( $parts['query'] ) ) {
		parse_str( $parts['query'], $query );
		foreach ( array_keys( $query ) as $k ) {
			if ( in_array( $k, array( 'si', 'feature', 'fbclid', 'gclid', 'ref', 'app' ), true ) || 0 === strpos( $k, 'utm_' ) ) {
				unset( $query[ $k ] );
			}
		}
	}
	$path = isset( $parts['path'] ) ? rtrim( $parts['path'], '/' ) : '';
	$out  = 'https://' . $host . $path . ( $query ? '?' . http_build_query( $query ) : '' );
	return array(
		'url'      => esc_url_raw( $out ),
		'platform' => $platform,
	);
}

/* ---- Storage -------------------------------------------------------------- */

add_action( 'init', 'genre_atlas_register_pick' );
function genre_atlas_register_pick() {
	register_post_type(
		'ga_pick',
		array(
			'labels'        => array(
				'name'          => 'Suggestions',
				'singular_name' => 'Suggestion',
				'edit_item'     => 'Edit suggestion',
				'search_items'  => 'Search suggestions',
				'not_found'     => 'No suggestion yet',
				'all_items'     => 'Suggestions',
			),
			'public'        => false,
			'show_ui'       => true,
			'show_in_menu'  => true,
			'menu_position' => 27,
			'menu_icon'     => 'dashicons-groups',
			'supports'      => array( 'title' ),
			'map_meta_cap'  => true,
			'capabilities'  => array( 'create_posts' => 'do_not_allow' ), // they come from the dossiers only.
		)
	);
}

/** Approved picks of a genre, A to Z, as the dossier shows them. */
function genre_atlas_dossier_picks( $genre_id ) {
	$posts = get_posts(
		array(
			'post_type'   => 'ga_pick',
			'post_status' => 'publish',
			'numberposts' => 200,
			'meta_key'    => 'ga_pick_genre', // phpcs:ignore WordPress.DB.SlowDBQuery
			'meta_value'  => (int) $genre_id,  // phpcs:ignore WordPress.DB.SlowDBQuery
		)
	);
	$out = array();
	foreach ( $posts as $p ) {
		$out[] = array(
			'kind'     => get_post_meta( $p->ID, 'ga_pick_kind', true ),
			'name'     => html_entity_decode( get_the_title( $p ), ENT_QUOTES, 'UTF-8' ),
			'url'      => get_post_meta( $p->ID, 'ga_pick_url', true ),
			'platform' => get_post_meta( $p->ID, 'ga_pick_platform', true ),
			'note'     => get_post_meta( $p->ID, 'ga_pick_note', true ),
			'by'       => get_post_meta( $p->ID, 'ga_pick_by', true ),
		);
	}
	usort(
		$out,
		function ( $a, $b ) {
			return strcasecmp( genre_atlas_artist_sort_key( $a['name'] ), genre_atlas_artist_sort_key( $b['name'] ) );
		}
	);
	return $out;
}

/**
 * Validates and records one suggestion, as pending.
 *
 * @param array $in genre, kind, url, name, note, by, token, website.
 * @return true|WP_Error The error carries the field at fault and an HTTP status.
 */
function genre_atlas_pick_submit( $in ) {
	$get = function ( $k ) use ( $in ) {
		return isset( $in[ $k ] ) && is_scalar( $in[ $k ] ) ? (string) $in[ $k ] : '';
	};

	// Bots, as on the contact form: told it worked, nothing kept.
	$age = genre_atlas_contact_token_age( $get( 'token' ) );
	if ( '' !== trim( $get( 'website' ) ) || ( $age >= 0 && $age < GENRE_ATLAS_CONTACT_MIN_SECONDS ) ) {
		return true;
	}
	if ( $age < 0 ) {
		return new WP_Error( 'genre_atlas_pick_token', 'The page is out of date. Reload it and send again.', array( 'status' => 400 ) );
	}

	$genre = get_post( (int) $get( 'genre' ) );
	if ( ! $genre || 'genre' !== $genre->post_type || 'publish' !== $genre->post_status ) {
		return new WP_Error( 'genre_atlas_pick_genre', 'This genre no longer exists.', array( 'status' => 400 ) );
	}
	$kind = 'playlist' === $get( 'kind' ) ? 'playlist' : 'artist';
	$link = genre_atlas_pick_link( $get( 'url' ) );
	$name = mb_substr( trim( sanitize_text_field( $get( 'name' ) ) ), 0, 120 );
	$note = mb_substr( trim( sanitize_text_field( $get( 'note' ) ) ), 0, 140 );
	$by   = mb_substr( trim( sanitize_text_field( $get( 'by' ) ) ), 0, 40 );

	if ( ! $link ) {
		return new WP_Error( 'genre_atlas_pick_url', 'Paste a link from Spotify, Deezer, YouTube, Apple Music, Bandcamp, SoundCloud, Tidal or Qobuz.', array( 'status' => 400, 'field' => 'url' ) );
	}
	if ( '' === $name ) {
		return new WP_Error( 'genre_atlas_pick_name', 'playlist' === $kind ? 'Give the playlist its title.' : 'Give the artist\'s name.', array( 'status' => 400, 'field' => 'name' ) );
	}
	// The same link twice for one genre, waiting or online, is one too many.
	$twice = get_posts(
		array(
			'post_type'   => 'ga_pick',
			'post_status' => array( 'pending', 'publish' ),
			'numberposts' => 1,
			'fields'      => 'ids',
			'meta_query'  => array( // phpcs:ignore WordPress.DB.SlowDBQuery
				array( 'key' => 'ga_pick_genre', 'value' => $genre->ID ),
				array( 'key' => 'ga_pick_url', 'value' => $link['url'] ),
			),
		)
	);
	if ( $twice ) {
		return new WP_Error( 'genre_atlas_pick_twice', 'This link has already been suggested for this genre. Thank you all the same.', array( 'status' => 409, 'field' => 'url' ) );
	}
	if ( ! genre_atlas_rate_ok( 'pick', GENRE_ATLAS_PICKS_PER_HOUR ) ) {
		return new WP_Error( 'genre_atlas_pick_limit', 'Too many suggestions from this connection. Try again in an hour.', array( 'status' => 429 ) );
	}

	$id = wp_insert_post(
		array(
			'post_type'   => 'ga_pick',
			'post_status' => 'pending',
			'post_title'  => $name,
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return new WP_Error( 'genre_atlas_pick_store', 'The suggestion could not be sent. Try again in a moment.', array( 'status' => 500 ) );
	}
	update_post_meta( $id, 'ga_pick_genre', $genre->ID );
	update_post_meta( $id, 'ga_pick_kind', $kind );
	update_post_meta( $id, 'ga_pick_url', $link['url'] );
	update_post_meta( $id, 'ga_pick_platform', $link['platform'] );
	update_post_meta( $id, 'ga_pick_note', $note );
	update_post_meta( $id, 'ga_pick_by', $by );
	return true;
}

add_action( 'rest_api_init', 'genre_atlas_pick_rest' );
function genre_atlas_pick_rest() {
	register_rest_route(
		'genre-atlas/v1',
		'/pick',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => function ( $request ) {
				$r = genre_atlas_pick_submit( $request->get_params() );
				return is_wp_error( $r ) ? $r : rest_ensure_response( array( 'ok' => true ) );
			},
		)
	);
}

/* ---- Suggestions screen: approve or reject in one click ------------------ */

function genre_atlas_pending_picks() {
	$counts = wp_count_posts( 'ga_pick' );
	return isset( $counts->pending ) ? (int) $counts->pending : 0;
}

// The number waiting, as a badge on the menu, like comments.
add_action( 'admin_menu', 'genre_atlas_picks_badge', 99 );
function genre_atlas_picks_badge() {
	global $menu;
	$n = genre_atlas_pending_picks() + count( genre_atlas_broken_picks() );
	if ( ! $n || ! is_array( $menu ) ) {
		return;
	}
	foreach ( $menu as $i => $item ) {
		if ( isset( $item[2] ) && 'edit.php?post_type=ga_pick' === $item[2] ) {
			$menu[ $i ][0] .= ' <span class="awaiting-mod count-' . $n . '"><span class="pending-count">' . number_format_i18n( $n ) . '</span></span>'; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
		}
	}
}

add_filter( 'manage_ga_pick_posts_columns', 'genre_atlas_pick_columns' );
function genre_atlas_pick_columns( $columns ) {
	return array(
		'cb'            => $columns['cb'],
		'title'         => 'Suggestion',
		'ga_pick_kind'  => 'Kind',
		'ga_pick_link'  => 'Link',
		'ga_pick_genre' => 'Genre',
		'ga_pick_note'  => 'Note',
		'ga_pick_by'    => 'Picked by',
		'ga_pick_state' => 'Status',
		'date'          => $columns['date'],
	);
}

add_action( 'manage_ga_pick_posts_custom_column', 'genre_atlas_pick_column', 10, 2 );
function genre_atlas_pick_column( $column, $id ) {
	if ( 'ga_pick_kind' === $column ) {
		echo esc_html( ucfirst( get_post_meta( $id, 'ga_pick_kind', true ) ) );
	} elseif ( 'ga_pick_link' === $column ) {
		$url = get_post_meta( $id, 'ga_pick_url', true );
		echo '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( get_post_meta( $id, 'ga_pick_platform', true ) ) . ' ↗</a>';
	} elseif ( 'ga_pick_genre' === $column ) {
		$genre = (int) get_post_meta( $id, 'ga_pick_genre', true );
		echo $genre ? '<a href="' . esc_url( trailingslashit( get_permalink( $genre ) ) . 'about/' ) . '" target="_blank">' . esc_html( get_the_title( $genre ) ) . '</a>' : '—';
	} elseif ( 'ga_pick_note' === $column ) {
		echo esc_html( get_post_meta( $id, 'ga_pick_note', true ) );
	} elseif ( 'ga_pick_by' === $column ) {
		echo esc_html( get_post_meta( $id, 'ga_pick_by', true ) );
	} elseif ( 'ga_pick_state' === $column ) {
		echo 'publish' === get_post_status( $id ) ? 'Online' : '<strong>Waiting</strong>';
		echo '<br>' . genre_atlas_pick_check_label( $id ); // phpcs:ignore WordPress.Security.EscapeOutput -- built escaped.
	}
}

// Waiting suggestions first, then the newest. WP_Query cannot order by
// status, so the clause is written out (CASE, which SQLite reads too).
add_filter( 'posts_orderby', 'genre_atlas_picks_order', 10, 2 );
function genre_atlas_picks_order( $orderby, $query ) {
	global $wpdb;
	if ( is_admin() && $query->is_main_query() && 'ga_pick' === $query->get( 'post_type' ) && empty( $_GET['orderby'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		return "CASE {$wpdb->posts}.post_status WHEN 'pending' THEN 0 ELSE 1 END ASC, {$wpdb->posts}.post_date DESC";
	}
	return $orderby;
}

add_filter( 'post_row_actions', 'genre_atlas_pick_row_actions', 10, 2 );
function genre_atlas_pick_row_actions( $actions, $post ) {
	if ( 'ga_pick' !== $post->post_type || 'trash' === $post->post_status || ! current_user_can( 'publish_post', $post->ID ) ) {
		return $actions;
	}
	$do   = 'publish' === $post->post_status ? 'unapprove' : 'approve';
	$link = wp_nonce_url( admin_url( 'admin-post.php?action=genre_atlas_pick&do=' . $do . '&id=' . $post->ID ), 'genre_atlas_pick_' . $post->ID );
	$mine = array( $do => '<a href="' . esc_url( $link ) . '"' . ( 'approve' === $do ? ' style="color:#008a20;font-weight:600"' : '' ) . '>' . ( 'approve' === $do ? 'Approve' : 'Take offline' ) . '</a>' );
	$mine['ga_check'] = '<a href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=genre_atlas_pick&do=check&id=' . $post->ID ), 'genre_atlas_pick_' . $post->ID ) ) . '">Check link</a>';
	if ( isset( $actions['trash'] ) ) {
		$actions['trash'] = str_replace( '>Trash<', '>Reject<', $actions['trash'] );
	}
	unset( $actions['inline hide-if-no-js'] );
	return $mine + $actions;
}

add_action( 'admin_post_genre_atlas_pick', 'genre_atlas_pick_action' );
function genre_atlas_pick_action() {
	$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
	check_admin_referer( 'genre_atlas_pick_' . $id );
	if ( 'ga_pick' !== get_post_type( $id ) || ! current_user_can( 'publish_post', $id ) ) {
		wp_die( 'Not allowed.' );
	}
	$do = isset( $_GET['do'] ) ? sanitize_key( $_GET['do'] ) : '';
	if ( 'check' === $do ) {
		genre_atlas_pick_check( $id, true );
		wp_safe_redirect( wp_get_referer() ? wp_get_referer() : admin_url( 'edit.php?post_type=ga_pick' ) );
		exit;
	}
	wp_update_post(
		array(
			'ID'          => $id,
			'post_status' => 'approve' === $do ? 'publish' : 'pending',
		)
	);
	wp_safe_redirect( wp_get_referer() ? wp_get_referer() : admin_url( 'edit.php?post_type=ga_pick' ) );
	exit;
}

add_filter( 'bulk_actions-edit-ga_pick', 'genre_atlas_pick_bulk_actions' );
function genre_atlas_pick_bulk_actions( $actions ) {
	unset( $actions['edit'] );
	$actions = array( 'ga_approve' => 'Approve' ) + $actions;
	if ( isset( $actions['trash'] ) ) {
		$actions['trash'] = 'Reject';
	}
	return $actions;
}

add_filter( 'handle_bulk_actions-edit-ga_pick', 'genre_atlas_pick_bulk_approve', 10, 3 );
function genre_atlas_pick_bulk_approve( $redirect, $action, $ids ) {
	if ( 'ga_approve' !== $action ) {
		return $redirect;
	}
	foreach ( $ids as $id ) {
		if ( current_user_can( 'publish_post', $id ) ) {
			wp_update_post( array( 'ID' => (int) $id, 'post_status' => 'publish' ) );
		}
	}
	return $redirect;
}

/* ---- Link check: approved links that no longer answer -------------------- */

/**
 * What a platform says of a link: ok, gone, or unknown (refused, timed out,
 * down). Only a plain "not found" counts as gone: Bandcamp turns robots away
 * with a 403 and Qobuz sends unknown pages to its shop, so anything else could
 * flag a link that is fine.
 *
 * @return array { verdict: ok|gone|unknown, code: HTTP status, 0 if none }
 */
function genre_atlas_pick_probe( $url ) {
	$host  = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
	$query = (string) wp_parse_url( $url, PHP_URL_QUERY );
	$gone  = array( 404, 410 );
	$fine  = array();
	// A removed YouTube video still answers 200 as a page; its oEmbed says 400
	// or 404 instead (and 401 or 403 when only embedding is turned off).
	if ( preg_match( '/(^|\.)(youtube\.com|youtu\.be)$/', $host ) && ( 'youtu.be' === $host || preg_match( '/(^|&)(v|list)=/', $query ) ) ) {
		$url  = 'https://www.youtube.com/oembed?format=json&url=' . rawurlencode( $url );
		$gone = array( 400, 404, 410 );
		$fine = array( 401, 403 );
	} elseif ( preg_match( '/(^|\.)soundcloud\.com$/', $host ) ) {
		$url = 'https://soundcloud.com/oembed?format=json&url=' . rawurlencode( $url );
	}
	$response = wp_remote_get(
		$url,
		array(
			'timeout'             => 10,
			'redirection'         => 5,
			'user-agent'          => 'Mozilla/5.0 (compatible; Genre Atlas link check; ' . home_url( '/' ) . ')',
			'limit_response_size' => 65536,
		)
	);
	$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
	if ( in_array( $code, $gone, true ) ) {
		return array( 'verdict' => 'gone', 'code' => $code );
	}
	if ( ( $code >= 200 && $code < 300 ) || in_array( $code, $fine, true ) ) {
		return array( 'verdict' => 'ok', 'code' => $code );
	}
	return array( 'verdict' => 'unknown', 'code' => $code );
}

/**
 * Checks one pick's link and records the answer. A link is flagged broken
 * after two "not found" in a row, a day apart, so one bad day on a platform
 * flags nothing; a check asked for by hand settles it at once.
 *
 * @return string ok|gone|unknown
 */
function genre_atlas_pick_check( $id, $by_hand = false, $now = null ) {
	$probe  = genre_atlas_pick_probe( get_post_meta( $id, 'ga_pick_url', true ) );
	$misses = (int) get_post_meta( $id, 'ga_pick_misses', true );
	update_post_meta( $id, 'ga_pick_checked', null === $now ? time() : (int) $now );
	update_post_meta( $id, 'ga_pick_code', $probe['code'] );
	if ( 'ok' === $probe['verdict'] ) {
		delete_post_meta( $id, 'ga_pick_misses' );
		delete_post_meta( $id, 'ga_pick_broken' );
	} elseif ( 'gone' === $probe['verdict'] ) {
		update_post_meta( $id, 'ga_pick_misses', ++$misses );
		if ( $by_hand || $misses >= 2 ) {
			update_post_meta( $id, 'ga_pick_broken', 1 );
		}
	}
	// Unknown: nothing learnt, the earlier verdict stands.
	return $probe['verdict'];
}

/**
 * The daily run: approved picks whose turn has come, the longest unchecked
 * first, until the time budget is spent. The rest wait for tomorrow.
 *
 * @param int|null $now The time to act at (the test bench moves it forward).
 */
add_action( 'genre_atlas_check_picks', 'genre_atlas_check_picks' );
function genre_atlas_check_picks( $now = null ) {
	$now   = null === $now ? time() : (int) $now;
	$start = microtime( true );
	$due   = array();
	$ids   = get_posts(
		array(
			'post_type'   => 'ga_pick',
			'post_status' => 'publish',
			'numberposts' => -1,
			'fields'      => 'ids',
		)
	);
	foreach ( $ids as $id ) {
		$last = (int) get_post_meta( $id, 'ga_pick_checked', true );
		$wait = (int) get_post_meta( $id, 'ga_pick_misses', true ) && ! get_post_meta( $id, 'ga_pick_broken', true ) ? GENRE_ATLAS_PICK_CONFIRM : GENRE_ATLAS_PICK_RECHECK;
		if ( $now - $last >= $wait ) {
			$due[ $id ] = $last;
		}
	}
	asort( $due );
	foreach ( array_keys( $due ) as $id ) {
		if ( microtime( true ) - $start > GENRE_ATLAS_PICK_BUDGET ) {
			break;
		}
		genre_atlas_pick_check( $id, false, $now );
	}
}

// Activation is not run by an update from the Plugins screen, so the daily
// run is put in place on the first page after it.
add_action( 'init', 'genre_atlas_schedule_pick_checks' );
function genre_atlas_schedule_pick_checks() {
	if ( ! wp_next_scheduled( 'genre_atlas_check_picks' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'genre_atlas_check_picks' );
	}
}

/** Approved picks whose link no longer answers, as post IDs. */
function genre_atlas_broken_picks() {
	return get_posts(
		array(
			'post_type'   => 'ga_pick',
			'post_status' => 'publish',
			'numberposts' => -1,
			'fields'      => 'ids',
			'meta_key'    => 'ga_pick_broken', // phpcs:ignore WordPress.DB.SlowDBQuery
			'meta_value'  => 1,                // phpcs:ignore WordPress.DB.SlowDBQuery
		)
	);
}

/** The last check of a pick, for the Status column (escaped HTML). */
function genre_atlas_pick_check_label( $id ) {
	$last = (int) get_post_meta( $id, 'ga_pick_checked', true );
	if ( ! $last ) {
		return '<span style="color:#646970">Link not checked yet</span>';
	}
	$code = (int) get_post_meta( $id, 'ga_pick_code', true );
	$when = esc_html( wp_date( 'j M', $last ) );
	if ( get_post_meta( $id, 'ga_pick_broken', true ) ) {
		return '<strong style="color:#d63638">Broken link</strong> <span style="color:#646970">(' . ( $code ? 'HTTP ' . $code : 'no answer' ) . ', ' . $when . ')</span>';
	}
	if ( $code >= 200 && $code < 300 ) {
		return '<span style="color:#008a20">Link OK</span> <span style="color:#646970">(' . $when . ')</span>';
	}
	if ( (int) get_post_meta( $id, 'ga_pick_misses', true ) ) {
		return '<span style="color:#996800">Not found once, checked again tomorrow</span> <span style="color:#646970">(' . $when . ')</span>';
	}
	return '<span style="color:#646970">Could not check (' . ( $code ? 'HTTP ' . $code : 'no answer' ) . ', ' . $when . ')</span>';
}

// The broken ones, named, at the top of Suggestions.
add_action( 'admin_notices', 'genre_atlas_broken_picks_notice' );
function genre_atlas_broken_picks_notice() {
	$screen = get_current_screen();
	if ( ! $screen || 'edit-ga_pick' !== $screen->id ) {
		return;
	}
	$ids = genre_atlas_broken_picks();
	if ( ! $ids ) {
		return;
	}
	$items = array();
	foreach ( $ids as $id ) {
		$genre   = (int) get_post_meta( $id, 'ga_pick_genre', true );
		$items[] = '<li><a href="' . esc_url( get_edit_post_link( $id ) ) . '">' . esc_html( get_the_title( $id ) ) . '</a>'
			. ( $genre ? ' (' . esc_html( get_the_title( $genre ) ) . ')' : '' )
			. ' · <a href="' . esc_url( get_post_meta( $id, 'ga_pick_url', true ) ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( get_post_meta( $id, 'ga_pick_platform', true ) ) . ' ↗</a></li>';
	}
	echo '<div class="notice notice-error"><p><strong>' . count( $ids ) . ' approved ' . _n( 'link no longer answers', 'links no longer answer', count( $ids ) ) . '.</strong> '
		. 'The platform says the page is gone. ' . _n( 'It is', 'They are', count( $ids ) ) . ' still on the dossiers: correct the link, take the suggestion offline, or reject it.</p>'
		. '<ul style="list-style:disc;margin-left:2em">' . implode( '', $items ) . '</ul></div>'; // phpcs:ignore WordPress.Security.EscapeOutput -- built escaped.
}

// A "Broken links" view beside All, Published and Pending.
add_filter( 'views_edit-ga_pick', 'genre_atlas_pick_views' );
function genre_atlas_pick_views( $views ) {
	$n = count( genre_atlas_broken_picks() );
	if ( $n ) {
		$on                 = ! empty( $_GET['ga_broken'] ); // phpcs:ignore WordPress.Security.NonceVerification
		$views['ga_broken'] = '<a href="' . esc_url( admin_url( 'edit.php?post_type=ga_pick&ga_broken=1' ) ) . '"' . ( $on ? ' class="current" aria-current="page"' : '' ) . '>Broken links <span class="count">(' . $n . ')</span></a>';
	}
	return $views;
}

add_action( 'pre_get_posts', 'genre_atlas_pick_broken_filter' );
function genre_atlas_pick_broken_filter( $query ) {
	if ( is_admin() && $query->is_main_query() && 'ga_pick' === $query->get( 'post_type' ) && ! empty( $_GET['ga_broken'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		$query->set( 'post_status', 'publish' );
		$query->set( 'meta_key', 'ga_pick_broken' );
		$query->set( 'meta_value', 1 );
	}
}

/* ---- Edit screen: a suggestion can be corrected before approval ----------- */

add_action( 'add_meta_boxes_ga_pick', 'genre_atlas_add_pick_box' );
function genre_atlas_add_pick_box() {
	add_meta_box( 'genre-atlas-pick', 'Suggestion', 'genre_atlas_render_pick_box', 'ga_pick', 'normal', 'high' );
}

function genre_atlas_render_pick_box( $post ) {
	wp_nonce_field( 'genre_atlas_pick_save', 'genre_atlas_pick_nonce' );
	$genre = (int) get_post_meta( $post->ID, 'ga_pick_genre', true );
	$kind  = get_post_meta( $post->ID, 'ga_pick_kind', true );
	echo '<table class="form-table" role="presentation"><tbody>';
	echo '<tr><th scope="row">Genre</th><td>' . ( $genre ? '<a href="' . esc_url( trailingslashit( get_permalink( $genre ) ) . 'about/' ) . '" target="_blank">' . esc_html( get_the_title( $genre ) ) . '</a>' : '—' ) . '</td></tr>';
	echo '<tr><th scope="row"><label for="ga_pick_kind">Kind</label></th><td><select id="ga_pick_kind" name="ga_pick_kind">';
	foreach ( array( 'artist' => 'Artist', 'playlist' => 'Playlist' ) as $v => $l ) {
		echo '<option value="' . esc_attr( $v ) . '"' . selected( $kind, $v, false ) . '>' . esc_html( $l ) . '</option>';
	}
	echo '</select></td></tr>';
	$fields = array(
		'ga_pick_url'  => 'Link',
		'ga_pick_note' => 'Note (140 characters at most)',
		'ga_pick_by'   => 'Picked by',
	);
	foreach ( $fields as $key => $label ) {
		echo '<tr><th scope="row"><label for="' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td><input class="large-text" id="' . esc_attr( $key ) . '" name="' . esc_attr( $key ) . '" value="' . esc_attr( get_post_meta( $post->ID, $key, true ) ) . '"></td></tr>';
	}
	echo '</tbody></table><p class="description">The title above is the name shown on the dossier. Publish to put the suggestion online; move it to the trash to reject it.</p>';
}

add_action( 'save_post_ga_pick', 'genre_atlas_save_pick_box' );
function genre_atlas_save_pick_box( $post_id ) {
	if ( ! isset( $_POST['genre_atlas_pick_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['genre_atlas_pick_nonce'] ), 'genre_atlas_pick_save' ) ) {
		return;
	}
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	if ( isset( $_POST['ga_pick_kind'] ) ) {
		update_post_meta( $post_id, 'ga_pick_kind', 'playlist' === $_POST['ga_pick_kind'] ? 'playlist' : 'artist' );
	}
	if ( isset( $_POST['ga_pick_url'] ) ) {
		$link = genre_atlas_pick_link( wp_unslash( $_POST['ga_pick_url'] ) ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		if ( $link && get_post_meta( $post_id, 'ga_pick_url', true ) !== $link['url'] ) {
			// A new link starts with a clean slate, and is checked at the next run.
			delete_post_meta( $post_id, 'ga_pick_checked' );
			delete_post_meta( $post_id, 'ga_pick_misses' );
			delete_post_meta( $post_id, 'ga_pick_broken' );
		}
		if ( $link ) { // A link off the list is left as it was.
			update_post_meta( $post_id, 'ga_pick_url', $link['url'] );
			update_post_meta( $post_id, 'ga_pick_platform', $link['platform'] );
		}
	}
	foreach ( array( 'ga_pick_note' => 140, 'ga_pick_by' => 40 ) as $key => $max ) {
		if ( isset( $_POST[ $key ] ) ) {
			update_post_meta( $post_id, $key, mb_substr( sanitize_text_field( wp_unslash( $_POST[ $key ] ) ), 0, $max ) );
		}
	}
}
