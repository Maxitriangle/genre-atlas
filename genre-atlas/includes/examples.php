<?php
/**
 * Listening examples: one YouTube video for a genre that no key artist lends
 * a song to, such as a tradition or a form (oberek, gamelan degung, Mozarabic
 * chant). The import proposes up to three videos found under the genre's
 * name (data/genre-examples.py); nothing shows on the site until one is
 * accepted in Genres > Listening examples, and a rejected video makes way for
 * the next.
 *
 * Genre meta:
 * - ga_example_youtube, ga_example_title, ga_example_channel: the accepted
 *   example, shown in the dossier's Listen section;
 * - ga_example_candidates: the videos still waiting, as JSON, first one next;
 * - ga_example_rejected: the video IDs turned down, never proposed again.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** The accepted example of a genre, or null. */
function genre_atlas_genre_example( $genre_id ) {
	$id = (string) get_post_meta( $genre_id, 'ga_example_youtube', true );
	if ( ! preg_match( '/^[\w-]{11}$/', $id ) ) {
		return null;
	}
	return array(
		'youtube' => $id,
		'title'   => (string) get_post_meta( $genre_id, 'ga_example_title', true ),
		'channel' => (string) get_post_meta( $genre_id, 'ga_example_channel', true ),
	);
}

/** The videos still waiting for a decision, first one next. */
function genre_atlas_example_candidates( $genre_id ) {
	$list = json_decode( (string) get_post_meta( $genre_id, 'ga_example_candidates', true ), true );
	return is_array( $list ) ? $list : array();
}

function genre_atlas_example_rejected( $genre_id ) {
	return array_filter( explode( ',', (string) get_post_meta( $genre_id, 'ga_example_rejected', true ) ) );
}

/**
 * Offer the imported candidates of a genre (the "examples" column, as JSON).
 * A genre with an accepted example gets none, and a video once rejected is
 * not proposed again, so the file can be imported any number of times.
 *
 * @return int Number of videos now waiting.
 */
function genre_atlas_offer_examples( $genre_id, $json ) {
	$list = json_decode( (string) $json, true );
	if ( ! is_array( $list ) || genre_atlas_genre_example( $genre_id ) ) {
		return 0;
	}
	$rejected = genre_atlas_example_rejected( $genre_id );
	$keep     = array();
	foreach ( $list as $v ) {
		$id = isset( $v['youtube'] ) ? (string) $v['youtube'] : '';
		if ( ! preg_match( '/^[\w-]{11}$/', $id ) || in_array( $id, $rejected, true ) ) {
			continue;
		}
		$keep[] = array(
			'youtube' => $id,
			'title'   => sanitize_text_field( isset( $v['title'] ) ? $v['title'] : '' ),
			'channel' => sanitize_text_field( isset( $v['channel'] ) ? $v['channel'] : '' ),
			'length'  => sanitize_text_field( isset( $v['length'] ) ? $v['length'] : '' ),
		);
	}
	if ( $keep ) {
		update_post_meta( $genre_id, 'ga_example_candidates', wp_slash( wp_json_encode( $keep, JSON_UNESCAPED_UNICODE ) ) );
	} else {
		delete_post_meta( $genre_id, 'ga_example_candidates' );
	}
	return count( $keep );
}

function genre_atlas_set_example( $genre_id, $youtube, $title, $channel ) {
	if ( preg_match( '/^[\w-]{11}$/', $youtube ) ) {
		update_post_meta( $genre_id, 'ga_example_youtube', $youtube );
		update_post_meta( $genre_id, 'ga_example_title', $title );
		update_post_meta( $genre_id, 'ga_example_channel', $channel );
		delete_post_meta( $genre_id, 'ga_example_candidates' );
	} else {
		delete_post_meta( $genre_id, 'ga_example_youtube' );
		delete_post_meta( $genre_id, 'ga_example_title' );
		delete_post_meta( $genre_id, 'ga_example_channel' );
	}
}

/** Genre IDs with a video waiting and no accepted example. */
function genre_atlas_pending_examples() {
	global $wpdb;
	return array_map(
		'intval',
		$wpdb->get_col(
			"SELECT c.post_id FROM {$wpdb->postmeta} c
			JOIN {$wpdb->posts} p ON p.ID = c.post_id AND p.post_type = 'genre' AND p.post_status = 'publish'
			LEFT JOIN {$wpdb->postmeta} y ON y.post_id = c.post_id AND y.meta_key = 'ga_example_youtube'
			WHERE c.meta_key = 'ga_example_candidates' AND c.meta_value <> '' AND ( y.meta_value IS NULL OR y.meta_value = '' )
			ORDER BY p.post_title"
		)
	);
}

function genre_atlas_accepted_examples() {
	global $wpdb;
	return array_map(
		'intval',
		$wpdb->get_col(
			"SELECT y.post_id FROM {$wpdb->postmeta} y
			JOIN {$wpdb->posts} p ON p.ID = y.post_id AND p.post_type = 'genre' AND p.post_status = 'publish'
			WHERE y.meta_key = 'ga_example_youtube' AND y.meta_value <> ''
			ORDER BY p.post_title"
		)
	);
}

/* ---- Genres > Listening examples ----------------------------------------- */

add_action( 'admin_menu', 'genre_atlas_examples_menu' );
function genre_atlas_examples_menu() {
	$n     = count( genre_atlas_pending_examples() );
	$badge = $n ? ' <span class="awaiting-mod count-' . $n . '"><span class="pending-count">' . number_format_i18n( $n ) . '</span></span>' : '';
	add_submenu_page( 'edit.php?post_type=genre', 'Listening examples', 'Listening examples' . $badge, 'edit_posts', 'genre-atlas-examples', 'genre_atlas_examples_page' );
}

function genre_atlas_examples_url( $args = array() ) {
	return add_query_arg( $args, admin_url( 'edit.php?post_type=genre&page=genre-atlas-examples' ) );
}

function genre_atlas_examples_page() {
	$view    = isset( $_GET['view'] ) && 'accepted' === $_GET['view'] ? 'accepted' : 'pending'; // phpcs:ignore WordPress.Security.NonceVerification
	$paged   = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore WordPress.Security.NonceVerification
	$pending = genre_atlas_pending_examples();
	$done    = genre_atlas_accepted_examples();
	$ids     = 'accepted' === $view ? $done : $pending;
	$only    = isset( $_GET['genre'] ) ? (int) $_GET['genre'] : 0; // phpcs:ignore WordPress.Security.NonceVerification
	if ( $only ) {
		$ids = array_values( array_intersect( $ids, array( $only ) ) );
	}
	$per     = 20;
	$pages   = max( 1, (int) ceil( count( $ids ) / $per ) );
	$paged   = min( $paged, $pages );
	echo '<div class="wrap"><h1>Listening examples</h1>';
	echo '<p>For the genres no key artist gives a sound to, a YouTube video found under the genre\'s name. Listen, then accept it or reject it: a rejected video makes way for the next one found, and is never proposed again. Nothing shows on the site before you accept. An example can also be pasted or changed by hand on the genre\'s edit screen (box "Listening example").</p>';
	if ( isset( $_GET['done'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		$msg = array(
			'accepted' => 'Accepted: the video now plays on the genre\'s dossier.',
			'rejected' => 'Rejected.',
			'removed'  => 'Removed from the dossier.',
		);
		$key = sanitize_key( $_GET['done'] ); // phpcs:ignore WordPress.Security.NonceVerification
		if ( isset( $msg[ $key ] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( $msg[ $key ] ) . '</p></div>';
		}
	}
	echo '<ul class="subsubsub"><li><a href="' . esc_url( genre_atlas_examples_url() ) . '"' . ( 'pending' === $view ? ' class="current"' : '' ) . '>To review <span class="count">(' . count( $pending ) . ')</span></a> |</li>';
	echo '<li><a href="' . esc_url( genre_atlas_examples_url( array( 'view' => 'accepted' ) ) ) . '"' . ( 'accepted' === $view ? ' class="current"' : '' ) . '>Accepted <span class="count">(' . count( $done ) . ')</span></a></li></ul>';
	echo '<table class="widefat striped ga-examples" style="clear:both"><thead><tr><th style="width:18%">Genre</th><th>Video</th><th style="width:22%">Decision</th></tr></thead><tbody>';
	$slice = array_slice( $ids, ( $paged - 1 ) * $per, $per );
	if ( ! $slice ) {
		echo '<tr><td colspan="3"><em>' . ( 'accepted' === $view ? 'No example accepted yet.' : 'Nothing to review.' ) . '</em></td></tr>';
	}
	foreach ( $slice as $id ) {
		$parent = wp_get_post_parent_id( $id );
		echo '<tr><td><strong><a href="' . esc_url( trailingslashit( get_permalink( $id ) ) . 'about/' ) . '" target="_blank" rel="noopener">' . esc_html( get_the_title( $id ) ) . '</a></strong>';
		echo $parent ? '<br><span class="description">in ' . esc_html( get_the_title( $parent ) ) . '</span>' : '';
		echo '<br><a href="' . esc_url( get_edit_post_link( $id ) ) . '">Edit</a></td>';
		if ( 'accepted' === $view ) {
			$v = genre_atlas_genre_example( $id );
			echo '<td>' . genre_atlas_example_video( $v ) . '</td><td>';
			genre_atlas_example_button( $id, 'remove', 'Remove from the dossier', 'button' );
			echo '</td></tr>';
			continue;
		}
		$list = genre_atlas_example_candidates( $id );
		$v    = $list[0];
		echo '<td>' . genre_atlas_example_video( $v ) . '<br><span class="description">Proposal 1 of ' . count( $list ) . ( count( $list ) > 1 ? ' left' : ', the last one' ) . '</span></td><td>';
		genre_atlas_example_button( $id, 'accept', 'Accept', 'button button-primary' );
		echo ' ';
		genre_atlas_example_button( $id, 'reject', 'Reject', 'button' );
		echo '</td></tr>';
	}
	echo '</tbody></table>';
	if ( $pages > 1 ) {
		echo '<p class="tablenav-pages">';
		for ( $p = 1; $p <= $pages; $p++ ) {
			echo $p === $paged ? '<strong>' . (int) $p . '</strong> ' : '<a href="' . esc_url( genre_atlas_examples_url( array( 'view' => $view, 'paged' => $p ) ) ) . '">' . (int) $p . '</a> ';
		}
		echo '</p>';
	}
	// The player loads only when asked for, one at a time.
	echo '<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-ga-watch]");if(!b)return;e.preventDefault();var f=document.createElement("iframe");f.src="https://www.youtube-nocookie.com/embed/"+b.getAttribute("data-ga-watch")+"?autoplay=1&rel=0";f.width=400;f.height=225;f.allow="autoplay; encrypted-media";f.setAttribute("allowfullscreen","");b.replaceWith(f);});</script></div>';
}

function genre_atlas_example_video( $v ) {
	$watch = 'https://www.youtube.com/watch?v=' . $v['youtube'];
	return '<button type="button" class="button" data-ga-watch="' . esc_attr( $v['youtube'] ) . '">▶ Play here</button> &nbsp; <strong>' . esc_html( $v['title'] ) . '</strong>' .
		'<br><span class="description">' . esc_html( trim( $v['channel'] . ( ! empty( $v['length'] ) ? ' · ' . $v['length'] : '' ), ' ·' ) ) . ' · <a href="' . esc_url( $watch ) . '" target="_blank" rel="noopener">Open on YouTube</a></span>';
}

function genre_atlas_example_button( $id, $act, $label, $class ) {
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:inline">';
	echo '<input type="hidden" name="action" value="genre_atlas_example"><input type="hidden" name="genre" value="' . (int) $id . '"><input type="hidden" name="act" value="' . esc_attr( $act ) . '">';
	wp_nonce_field( 'genre_atlas_example_' . $id );
	echo '<button type="submit" class="' . esc_attr( $class ) . '" data-ga-act="' . esc_attr( $act ) . '">' . esc_html( $label ) . '</button></form>';
}

add_action( 'admin_post_genre_atlas_example', 'genre_atlas_example_action' );
function genre_atlas_example_action() {
	$id  = isset( $_POST['genre'] ) ? (int) $_POST['genre'] : 0;
	$act = isset( $_POST['act'] ) ? sanitize_key( $_POST['act'] ) : '';
	check_admin_referer( 'genre_atlas_example_' . $id );
	if ( ! current_user_can( 'edit_post', $id ) || 'genre' !== get_post_type( $id ) ) {
		wp_die( 'Not allowed.' );
	}
	$list = genre_atlas_example_candidates( $id );
	$back = array();
	if ( 'accept' === $act && $list ) {
		genre_atlas_set_example( $id, $list[0]['youtube'], $list[0]['title'], $list[0]['channel'] );
		$back = array( 'done' => 'accepted' );
	} elseif ( 'reject' === $act && $list ) {
		$rejected   = genre_atlas_example_rejected( $id );
		$rejected[] = $list[0]['youtube'];
		update_post_meta( $id, 'ga_example_rejected', implode( ',', array_unique( $rejected ) ) );
		array_shift( $list );
		if ( $list ) {
			update_post_meta( $id, 'ga_example_candidates', wp_slash( wp_json_encode( $list, JSON_UNESCAPED_UNICODE ) ) );
		} else {
			delete_post_meta( $id, 'ga_example_candidates' );
		}
		$back = array( 'done' => 'rejected' );
	} elseif ( 'remove' === $act ) {
		$v = genre_atlas_genre_example( $id );
		if ( $v ) {
			$rejected   = genre_atlas_example_rejected( $id );
			$rejected[] = $v['youtube'];
			update_post_meta( $id, 'ga_example_rejected', implode( ',', array_unique( $rejected ) ) );
		}
		genre_atlas_set_example( $id, '', '', '' );
		$back = array( 'done' => 'removed', 'view' => 'accepted' );
	}
	$ref = wp_get_referer();
	wp_safe_redirect( add_query_arg( $back, $ref ? remove_query_arg( 'done', $ref ) : genre_atlas_examples_url() ) );
	exit;
}

/* ---- "Listening example" box on the genre edit screen --------------------- */

add_action( 'add_meta_boxes_genre', 'genre_atlas_add_example_box' );
function genre_atlas_add_example_box() {
	add_meta_box( 'genre-atlas-example', 'Listening example', 'genre_atlas_render_example_box', 'genre', 'normal', 'default' );
}

function genre_atlas_render_example_box( $post ) {
	wp_nonce_field( 'genre_atlas_example_box', 'genre_atlas_example_nonce' );
	$v = genre_atlas_genre_example( $post->ID );
	$fields = array(
		'ga_example_youtube' => array( 'YouTube video (link or ID)', $v ? 'https://www.youtube.com/watch?v=' . $v['youtube'] : '' ),
		'ga_example_title'   => array( 'Title shown', $v ? $v['title'] : '' ),
		'ga_example_channel' => array( 'Performer or channel', $v ? $v['channel'] : '' ),
	);
	echo '<p class="description">A piece that lets one hear the genre, in the Listen section of its dossier, for a genre whose key artists have no song. Empty the video to remove it.';
	$n = count( genre_atlas_example_candidates( $post->ID ) );
	if ( ! $v && $n ) {
		echo ' ' . (int) $n . ' proposal(s) waiting: <a href="' . esc_url( genre_atlas_examples_url( array( 'genre' => $post->ID ) ) ) . '">review them</a>.';
	}
	echo '</p><table class="form-table" role="presentation"><tbody>';
	foreach ( $fields as $key => $f ) {
		echo '<tr><th scope="row"><label for="' . esc_attr( $key ) . '">' . esc_html( $f[0] ) . '</label></th><td><input class="regular-text" type="text" id="' . esc_attr( $key ) . '" name="' . esc_attr( $key ) . '" value="' . esc_attr( $f[1] ) . '"></td></tr>';
	}
	echo '</tbody></table>';
}

add_action( 'save_post_genre', 'genre_atlas_save_example_box' );
function genre_atlas_save_example_box( $post_id ) {
	if ( ! isset( $_POST['genre_atlas_example_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['genre_atlas_example_nonce'] ), 'genre_atlas_example_box' ) ) {
		return;
	}
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	$get = function ( $k ) {
		return isset( $_POST[ $k ] ) ? sanitize_text_field( wp_unslash( $_POST[ $k ] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	};
	$was = genre_atlas_genre_example( $post_id );
	$id  = genre_atlas_song_id( 'ga_song_youtube', $get( 'ga_example_youtube' ) );
	if ( $was && '' === $id ) {
		update_post_meta( $post_id, 'ga_example_rejected', implode( ',', array_unique( array_merge( genre_atlas_example_rejected( $post_id ), array( $was['youtube'] ) ) ) ) );
	}
	genre_atlas_set_example( $post_id, $id, $get( 'ga_example_title' ), $get( 'ga_example_channel' ) );
}
