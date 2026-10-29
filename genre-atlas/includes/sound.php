<?php
/**
 * Sound previews: the 30-second extract Deezer gives of every track, so a
 * genre can be heard by pointing at it on the map, or by pressing ▶.
 *
 * GET /wp-json/genre-atlas/v1/sound/<genre id>?i=<n>[&full=1] answers with the n-th
 * song of the genre's key artists that Deezer knows (A to Z, as the dossier
 * lists them, round and round), and the address of its preview. Deezer signs
 * that address for 15 minutes, so it is asked on demand and kept 10.
 *
 * The browser plays the preview from Deezer's servers: nothing is asked of
 * them before the visitor switches the sound on or presses ▶ (see /legal/).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** The genre's songs that have a Deezer track, in the dossier's order. */
function genre_atlas_sound_tracks( $genre_id ) {
	$out = array();
	foreach ( genre_atlas_dossier_artists( $genre_id ) as $a ) {
		if ( ! empty( $a['song']['deezer'] ) && preg_match( '~/track/(\d+)$~', $a['song']['deezer'], $m ) ) {
			$out[] = array(
				'track'   => $m[1],
				'title'   => $a['song']['title'],
				'artist'  => $a['name'],
				'deezer'  => $a['song']['deezer'],
				'youtube' => isset( $a['song']['youtube'] ) ? $a['song']['youtube'] : '',
			);
		}
	}
	return $out;
}

/** Artist post IDs whose song has a Deezer track: one query for the tree. */
function genre_atlas_sounding_artists() {
	global $wpdb;
	$ids = $wpdb->get_col( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = 'ga_song_deezer' AND meta_value <> ''" );
	return array_fill_keys( array_map( 'intval', $ids ), true );
}

/** The signed address of a track's preview, or '' when Deezer has none. */
function genre_atlas_deezer_preview( $track ) {
	$key    = 'ga_dz_' . $track;
	$cached = get_transient( $key );
	if ( false !== $cached ) {
		return $cached;
	}
	// Deezer answers a "WordPress/…" user agent with its home page instead of
	// the track: the plugin introduces itself under its own name.
	$res  = wp_remote_get(
		'https://api.deezer.com/track/' . rawurlencode( $track ),
		array(
			'timeout'    => 6,
			'user-agent' => 'GenreAtlas/' . GENRE_ATLAS_VERSION . ' (+' . home_url( '/' ) . ')',
		)
	);
	$data = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	$url  = is_array( $data ) && ! empty( $data['preview'] ) && 0 === strpos( $data['preview'], 'https://' ) ? $data['preview'] : '';
	if ( is_array( $data ) ) {
		// A failed request is not kept: the next visitor tries again.
		set_transient( $key, $url, 10 * MINUTE_IN_SECONDS );
	}
	return $url;
}

add_action( 'rest_api_init', 'genre_atlas_sound_rest' );
function genre_atlas_sound_rest() {
	register_rest_route(
		'genre-atlas/v1',
		'/sound/(?P<id>\d+)',
		array(
			'methods'             => 'GET',
			'permission_callback' => '__return_true',
			'callback'            => 'genre_atlas_sound',
		)
	);
}

function genre_atlas_sound( $request ) {
	$post = get_post( (int) $request['id'] );
	if ( ! $post || 'genre' !== $post->post_type || 'publish' !== $post->post_status ) {
		return new WP_Error( 'genre_atlas_not_found', 'No such genre.', array( 'status' => 404 ) );
	}
	$tracks = genre_atlas_sound_tracks( $post->ID );
	// Full tracks play on YouTube: the songs that have a video, in turn, with
	// no need to ask Deezer. A genre with none falls back on its previews.
	if ( ! empty( $request['full'] ) ) {
		$videos = array_values( array_filter( $tracks, function ( $t ) { return '' !== $t['youtube']; } ) );
		if ( $videos ) {
			$i = max( 0, (int) $request['i'] ) % count( $videos );
			$t = $videos[ $i ];
			unset( $t['track'] );
			return rest_ensure_response( array_merge( $t, array( 'genre' => (int) $post->ID, 'i' => $i, 'count' => count( $videos ), 'preview' => '' ) ) );
		}
	}
	$n      = count( $tracks );
	// A track Deezer no longer has is skipped, up to the whole list once.
	for ( $k = 0; $k < $n; $k++ ) {
		$i       = ( max( 0, (int) $request['i'] ) + $k ) % $n;
		$t       = $tracks[ $i ];
		$preview = genre_atlas_deezer_preview( $t['track'] );
		if ( $preview ) {
			unset( $t['track'] );
			return rest_ensure_response( array_merge( $t, array( 'genre' => (int) $post->ID, 'i' => $i, 'count' => $n, 'preview' => $preview ) ) );
		}
	}
	return new WP_Error( 'genre_atlas_no_sound', 'No preview for this genre.', array( 'status' => 404 ) );
}

// The tree says which genres have a preview, and that hangs on the artists' songs.
add_action( 'save_post_ga_artist', 'genre_atlas_flush_cache' );
