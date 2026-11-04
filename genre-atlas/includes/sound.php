<?php
/**
 * Sound: the songs of a genre, played whole in YouTube's player.
 *
 * GET /wp-json/genre-atlas/v1/sound/<genre id>?i=<n> answers with the n-th
 * song of the genre's artists that has a YouTube video (in the dossier's
 * order, round and round). The browser loads YouTube's player only when the
 * visitor asks for a song, or points at a genre once SOUND ON is chosen
 * (see /legal/).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** The genre's songs that have a YouTube video, in the dossier's order. */
function genre_atlas_sound_tracks( $genre_id ) {
	$out = array();
	foreach ( genre_atlas_dossier_artists( $genre_id ) as $a ) {
		if ( ! empty( $a['song']['youtube'] ) ) {
			$out[] = array(
				'title'   => $a['song']['title'],
				'artist'  => $a['name'],
				'deezer'  => isset( $a['song']['deezer'] ) ? $a['song']['deezer'] : '',
				'youtube' => $a['song']['youtube'],
			);
		}
	}
	return $out;
}

/** Artist post IDs whose song has a YouTube video: one query for the tree. */
function genre_atlas_sounding_artists() {
	global $wpdb;
	$ids = $wpdb->get_col( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = 'ga_song_youtube' AND meta_value <> ''" );
	return array_fill_keys( array_map( 'intval', $ids ), true );
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
	if ( ! $tracks ) {
		return new WP_Error( 'genre_atlas_no_sound', 'No song for this genre.', array( 'status' => 404 ) );
	}
	$i = max( 0, (int) $request['i'] ) % count( $tracks );
	return rest_ensure_response( array_merge( $tracks[ $i ], array( 'genre' => (int) $post->ID, 'i' => $i, 'count' => count( $tracks ) ) ) );
}

// The tree says which genres can be heard, and that hangs on the artists' songs.
add_action( 'save_post_ga_artist', 'genre_atlas_flush_cache' );
