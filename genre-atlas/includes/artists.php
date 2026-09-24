<?php
/**
 * Key artists: the "ga_artist" content type, the artists of each genre, and
 * what the dossier gets from them.
 *
 * An artist has no page of its own: it shows on the dossier of its genres.
 * The genres list their artists (meta "ga_artists", artist post IDs in
 * order), so the list is edited where it is read, in the genre's "Key
 * artists" box. Once edited there, a re-import leaves it alone.
 *
 * Photos are 1-bit masks shipped in assets/masks/<wikidata_id>.png, coloured
 * by the family in CSS. A photo is shown only with its credit.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GENRE_ATLAS_MAX_ARTISTS = 8; // The same limit as the map's ring.

function genre_atlas_artist_fields() {
	return array(
		'ga_wikidata_id'       => 'Wikidata ID',
		'ga_kind'              => 'Kind (person or group)',
		'ga_start'             => 'Active since (year)',
		'ga_country'           => 'Country',
		'ga_photo_file'        => 'Photo: Wikimedia Commons file name',
		'ga_photo_author'      => 'Photo: author',
		'ga_photo_license'     => 'Photo: licence',
		'ga_photo_license_url' => 'Photo: licence URL',
	);
}

add_action( 'init', 'genre_atlas_register_artist' );
function genre_atlas_register_artist() {
	register_post_type(
		'ga_artist',
		array(
			'labels'       => array(
				'name'          => 'Artists',
				'singular_name' => 'Artist',
				'add_new_item'  => 'Add an artist',
				'edit_item'     => 'Edit artist',
				'search_items'  => 'Search artists',
				'not_found'     => 'No artist found',
				'all_items'     => 'Artists',
			),
			'public'       => false,
			'show_ui'      => true,
			'show_in_menu' => 'edit.php?post_type=genre',
			'supports'     => array( 'title' ),
		)
	);
}

/* ---- Reading ------------------------------------------------------------- */

/** Artist post IDs of a genre, in stored order. */
function genre_atlas_genre_artist_ids( $genre_id ) {
	$raw = (string) get_post_meta( $genre_id, 'ga_artists', true );
	return array_values( array_filter( array_map( 'intval', explode( ',', $raw ) ) ) );
}

/** "The Cure" sorts under C, as it does in a record shop. */
function genre_atlas_artist_sort_key( $name ) {
	return strtolower( remove_accents( preg_replace( '/^the\s+/i', '', $name ) ) );
}

/** The artists of a genre as the dossier shows them, A to Z. */
function genre_atlas_dossier_artists( $genre_id ) {
	$out = array();
	foreach ( genre_atlas_genre_artist_ids( $genre_id ) as $id ) {
		$p = get_post( $id );
		if ( ! $p || 'ga_artist' !== $p->post_type || 'publish' !== $p->post_status ) {
			continue;
		}
		$qid    = (string) get_post_meta( $id, 'ga_wikidata_id', true );
		$author = (string) get_post_meta( $id, 'ga_photo_author', true );
		$lic    = (string) get_post_meta( $id, 'ga_photo_license', true );
		$file   = (string) get_post_meta( $id, 'ga_photo_file', true );
		$a      = array(
			'name'    => get_the_title( $p ),
			'kind'    => (string) get_post_meta( $id, 'ga_kind', true ),
			'start'   => (string) get_post_meta( $id, 'ga_start', true ),
			'country' => (string) get_post_meta( $id, 'ga_country', true ),
		);
		// No credit, no photo: the licences ask for one.
		if ( $qid && $author && $lic && $file && preg_match( '/^Q\d+$/', $qid ) && file_exists( GENRE_ATLAS_DIR . 'assets/masks/' . $qid . '.png' ) ) {
			$a['mask']       = GENRE_ATLAS_URL . 'assets/masks/' . $qid . '.png?v=' . GENRE_ATLAS_VERSION;
			$a['author']     = $author;
			$a['license']    = $lic;
			$a['licenseUrl'] = (string) get_post_meta( $id, 'ga_photo_license_url', true );
			$a['source']     = 'https://commons.wikimedia.org/wiki/File:' . rawurlencode( str_replace( ' ', '_', $file ) );
		}
		$out[] = $a;
	}
	usort(
		$out,
		function ( $x, $y ) {
			return strcmp( genre_atlas_artist_sort_key( $x['name'] ), genre_atlas_artist_sort_key( $y['name'] ) );
		}
	);
	return array_slice( $out, 0, GENRE_ATLAS_MAX_ARTISTS );
}

/* ---- "Key artists" box on the genre edit screen --------------------------- */

add_action( 'add_meta_boxes_genre', 'genre_atlas_add_artists_box' );
function genre_atlas_add_artists_box() {
	add_meta_box( 'genre-atlas-artists', 'Key artists', 'genre_atlas_render_artists_box', 'genre', 'normal', 'default' );
}

function genre_atlas_render_artists_box( $post ) {
	wp_nonce_field( 'genre_atlas_artists', 'genre_atlas_artists_nonce' );
	$ids = genre_atlas_genre_artist_ids( $post->ID );
	echo '<p class="description">Shown on the genre\'s dossier, A to Z, ' . (int) GENRE_ATLAS_MAX_ARTISTS . ' at most. Once this list is saved, re-importing the artist file leaves it as it is.</p>';
	if ( $ids ) {
		echo '<ul>';
		foreach ( $ids as $id ) {
			$title = get_the_title( $id );
			echo '<li><label><input type="checkbox" name="ga_artists_remove[]" value="' . (int) $id . '"> Remove</label> &nbsp; <a href="' . esc_url( get_edit_post_link( $id ) ) . '">' . esc_html( $title ? $title : '#' . $id ) . '</a></li>';
		}
		echo '</ul>';
	} else {
		echo '<p><em>No artist yet.</em></p>';
	}
	// Every known artist, so the browser can complete the name as it is typed.
	global $wpdb;
	$names = $wpdb->get_col( "SELECT post_title FROM {$wpdb->posts} WHERE post_type = 'ga_artist' AND post_status = 'publish' ORDER BY post_title" );
	echo '<p><label for="ga_artists_add">Add an artist</label><br><input class="regular-text" type="text" id="ga_artists_add" name="ga_artists_add" list="ga-artist-names" autocomplete="off"> ';
	echo '<span class="description">Type an existing name, or a new one to create the artist. With 8 already listed, tick one to remove in the same save.</span></p><datalist id="ga-artist-names">';
	foreach ( $names as $n ) {
		echo '<option value="' . esc_attr( $n ) . '">';
	}
	echo '</datalist>';
}

add_action( 'save_post_genre', 'genre_atlas_save_artists_box' );
function genre_atlas_save_artists_box( $post_id ) {
	if ( ! isset( $_POST['genre_atlas_artists_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['genre_atlas_artists_nonce'] ), 'genre_atlas_artists' ) ) {
		return;
	}
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	$ids     = genre_atlas_genre_artist_ids( $post_id );
	$remove  = isset( $_POST['ga_artists_remove'] ) ? array_map( 'intval', (array) wp_unslash( $_POST['ga_artists_remove'] ) ) : array();
	$new_ids = array_values( array_diff( $ids, $remove ) );
	$name    = isset( $_POST['ga_artists_add'] ) ? sanitize_text_field( wp_unslash( $_POST['ga_artists_add'] ) ) : '';
	if ( '' !== $name && count( $new_ids ) < GENRE_ATLAS_MAX_ARTISTS ) {
		$found = get_posts(
			array(
				'post_type'   => 'ga_artist',
				'post_status' => 'publish',
				'title'       => $name,
				'numberposts' => 1,
				'fields'      => 'ids',
			)
		);
		$id    = $found ? (int) $found[0] : (int) wp_insert_post(
			array(
				'post_type'   => 'ga_artist',
				'post_status' => 'publish',
				'post_title'  => $name,
			)
		);
		if ( $id && ! in_array( $id, $new_ids, true ) ) {
			$new_ids[] = $id;
		}
	}
	if ( $new_ids !== $ids ) {
		update_post_meta( $post_id, 'ga_artists', implode( ',', $new_ids ) );
		update_post_meta( $post_id, 'ga_artists_edited', 1 );
	}
}

/* ---- "Artist data" box on the artist edit screen --------------------------- */

add_action( 'add_meta_boxes_ga_artist', 'genre_atlas_add_artist_box' );
function genre_atlas_add_artist_box() {
	add_meta_box( 'genre-atlas-artist', 'Artist data', 'genre_atlas_render_artist_box', 'ga_artist', 'normal', 'high' );
}

function genre_atlas_render_artist_box( $post ) {
	wp_nonce_field( 'genre_atlas_artist', 'genre_atlas_artist_nonce' );
	echo '<table class="form-table" role="presentation"><tbody>';
	foreach ( genre_atlas_artist_fields() as $key => $label ) {
		echo '<tr><th scope="row"><label for="' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td><input class="regular-text" type="text" id="' . esc_attr( $key ) . '" name="' . esc_attr( $key ) . '" value="' . esc_attr( get_post_meta( $post->ID, $key, true ) ) . '"></td></tr>';
	}
	echo '</tbody></table><p class="description">The photo shows only when it has an author and a licence, and when the plugin ships its screened version. Emptying the file name hides it.</p>';
}

add_action( 'save_post_ga_artist', 'genre_atlas_save_artist_box' );
function genre_atlas_save_artist_box( $post_id ) {
	if ( ! isset( $_POST['genre_atlas_artist_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['genre_atlas_artist_nonce'] ), 'genre_atlas_artist' ) ) {
		return;
	}
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	foreach ( array_keys( genre_atlas_artist_fields() ) as $key ) {
		if ( ! isset( $_POST[ $key ] ) ) {
			continue;
		}
		$value = 'ga_photo_license_url' === $key ? esc_url_raw( wp_unslash( $_POST[ $key ] ) ) : sanitize_text_field( wp_unslash( $_POST[ $key ] ) );
		if ( '' === $value ) {
			delete_post_meta( $post_id, $key );
		} else {
			update_post_meta( $post_id, $key, $value );
		}
	}
	update_post_meta( $post_id, 'ga_status', 'reviewed' ); // A re-import no longer overwrites it.
}
