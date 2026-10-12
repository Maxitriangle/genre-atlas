<?php
/**
 * Contact form: /contact/, a message to the address set in Genres → Settings,
 * with a copy kept in WordPress (Messages) so nothing is lost if a mail is.
 *
 * No captcha and no outside service: an invisible field bots fill in, a
 * minimum time between loading the page and sending, and a cap per connection.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GENRE_ATLAS_CONTACT_MIN_SECONDS = 3;  // A person does not write a message faster.
const GENRE_ATLAS_CONTACT_PER_HOUR    = 5;  // Per connection.
const GENRE_ATLAS_CONTACT_MAX_CHARS   = 5000;

function genre_atlas_contact_topics() {
	return array(
		'feedback'   => 'Feedback',
		'correction' => 'Correction',
		'missing'    => 'Missing genre',
		'other'      => 'Other',
	);
}

/** Where messages go: the address set in Settings, else the site admin's. */
function genre_atlas_contact_to() {
	$to = get_option( 'genre_atlas_contact_to', '' );
	return is_email( $to ) ? $to : get_option( 'admin_email' );
}

/* ---- Address ------------------------------------------------------------- */

add_action( 'init', 'genre_atlas_contact_route', 11 );
function genre_atlas_contact_route() {
	// Rendered by the atlas template, like the random draw. The rules are
	// flushed by genre_atlas_dossier_route() when the version changes.
	add_rewrite_rule( '^contact/?$', 'index.php?post_type=genre&ga_contact=1', 'top' );
}

add_filter( 'query_vars', 'genre_atlas_contact_query_var' );
function genre_atlas_contact_query_var( $vars ) {
	$vars[] = 'ga_contact';
	return $vars;
}

function genre_atlas_is_contact() {
	return is_post_type_archive( 'genre' ) && get_query_var( 'ga_contact' );
}

add_filter( 'document_title_parts', 'genre_atlas_contact_title' );
function genre_atlas_contact_title( $parts ) {
	if ( genre_atlas_is_contact() ) {
		$parts['title'] = 'Contact';
	}
	return $parts;
}

/**
 * A token stamped with the time the page was served. It never expires, so a
 * cached page still works; it only tells how long the visitor took.
 */
function genre_atlas_contact_token( $time = null ) {
	$time = null === $time ? time() : (int) $time;
	return $time . '.' . substr( wp_hash( 'genre_atlas_contact|' . $time ), 0, 12 );
}

function genre_atlas_contact_token_age( $token ) {
	$parts = explode( '.', (string) $token );
	if ( 2 !== count( $parts ) || ! ctype_digit( $parts[0] ) || ! hash_equals( genre_atlas_contact_token( $parts[0] ), (string) $token ) ) {
		return -1;
	}
	return time() - (int) $parts[0];
}

/**
 * Counts one more submission from this connection in a bucket, and says
 * whether it is still under the hourly cap. The connection is only kept as a
 * salted hash, for an hour. Shared by the contact form and community picks.
 */
function genre_atlas_rate_ok( $bucket, $per_hour ) {
	$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$key  = 'genre_atlas_' . $bucket . '_' . md5( $ip . wp_salt( 'nonce' ) );
	$sent = (int) get_transient( $key );
	if ( $sent >= $per_hour ) {
		return false;
	}
	set_transient( $key, $sent + 1, HOUR_IN_SECONDS );
	return true;
}

/* ---- Messages, kept in WordPress ---------------------------------------- */

add_action( 'init', 'genre_atlas_register_message' );
function genre_atlas_register_message() {
	register_post_type(
		'ga_message',
		array(
			'labels'        => array(
				'name'          => 'Messages',
				'singular_name' => 'Message',
				'edit_item'     => 'Message',
				'search_items'  => 'Search messages',
				'not_found'     => 'No message yet',
				'all_items'     => 'Messages',
			),
			'public'        => false,
			'show_ui'       => true,
			'show_in_menu'  => true,
			'menu_position' => 26,
			'menu_icon'     => 'dashicons-email-alt',
			'supports'      => array( 'title' ),
			'map_meta_cap'  => true,
			'capabilities'  => array( 'create_posts' => 'do_not_allow' ), // they come from the form only.
		)
	);
}

/**
 * Validates and records one message, then mails it.
 *
 * @param array $in name, email, topic, message, genre, token, website.
 * @return true|WP_Error The error carries the field at fault and an HTTP status.
 */
function genre_atlas_contact_submit( $in ) {
	$get = function ( $k ) use ( $in ) {
		return isset( $in[ $k ] ) && is_scalar( $in[ $k ] ) ? (string) $in[ $k ] : '';
	};

	// Bots: the hidden field filled in, or sent faster than anyone can type.
	// They are told it worked and nothing is kept.
	$age = genre_atlas_contact_token_age( $get( 'token' ) );
	if ( '' !== trim( $get( 'website' ) ) || ( $age >= 0 && $age < GENRE_ATLAS_CONTACT_MIN_SECONDS ) ) {
		return true;
	}
	if ( $age < 0 ) {
		return new WP_Error( 'genre_atlas_contact_token', 'The page is out of date. Reload it and send again.', array( 'status' => 400 ) );
	}

	$name    = trim( preg_replace( '/[\r\n"<>,;]+/', ' ', sanitize_text_field( $get( 'name' ) ) ) );
	$name    = mb_substr( $name, 0, 100 );
	$email   = sanitize_email( $get( 'email' ) );
	$message = trim( sanitize_textarea_field( $get( 'message' ) ) );
	$topics  = genre_atlas_contact_topics();
	$topic   = isset( $topics[ $get( 'topic' ) ] ) ? $get( 'topic' ) : 'feedback';
	$genre   = get_post( (int) $get( 'genre' ) );
	$genre   = $genre && 'genre' === $genre->post_type && 'publish' === $genre->post_status ? $genre : null;

	if ( ! is_email( $email ) ) {
		return new WP_Error( 'genre_atlas_contact_email', 'Enter a valid e-mail address, so the reply can reach you.', array( 'status' => 400, 'field' => 'email' ) );
	}
	if ( mb_strlen( $message ) < 10 ) {
		return new WP_Error( 'genre_atlas_contact_message', 'Write a little more: ten characters at least.', array( 'status' => 400, 'field' => 'message' ) );
	}
	if ( mb_strlen( $message ) > GENRE_ATLAS_CONTACT_MAX_CHARS ) {
		return new WP_Error( 'genre_atlas_contact_message', 'The message is too long: ' . GENRE_ATLAS_CONTACT_MAX_CHARS . ' characters at most.', array( 'status' => 400, 'field' => 'message' ) );
	}

	if ( ! genre_atlas_rate_ok( 'contact', GENRE_ATLAS_CONTACT_PER_HOUR ) ) {
		return new WP_Error( 'genre_atlas_contact_limit', 'Too many messages from this connection. Try again in an hour.', array( 'status' => 429 ) );
	}

	$id = wp_insert_post(
		array(
			'post_type'    => 'ga_message',
			'post_status'  => 'publish',
			'post_title'   => $topics[ $topic ] . ' — ' . ( $name ? $name : $email ) . ( $genre ? ' — ' . get_the_title( $genre ) : '' ),
			'post_content' => $message,
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return new WP_Error( 'genre_atlas_contact_store', 'The message could not be sent. Try again in a moment.', array( 'status' => 500 ) );
	}
	update_post_meta( $id, 'ga_msg_email', $email );
	update_post_meta( $id, 'ga_msg_name', $name );
	update_post_meta( $id, 'ga_msg_topic', $topic );
	if ( $genre ) {
		update_post_meta( $id, 'ga_msg_genre', $genre->ID );
	}
	update_post_meta( $id, 'ga_msg_mailed', genre_atlas_contact_mail( $id ) ? 1 : 0 );
	return true;
}

function genre_atlas_contact_mail( $id ) {
	$post   = get_post( $id );
	$site   = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
	$to     = genre_atlas_contact_to();
	$email  = get_post_meta( $id, 'ga_msg_email', true );
	$name   = get_post_meta( $id, 'ga_msg_name', true );
	$topics = genre_atlas_contact_topics();
	$topic  = $topics[ get_post_meta( $id, 'ga_msg_topic', true ) ];
	$genre  = (int) get_post_meta( $id, 'ga_msg_genre', true );

	$lines = array( 'From: ' . ( $name ? $name . ' <' . $email . '>' : $email ), 'Topic: ' . $topic );
	if ( $genre ) {
		$lines[] = 'Genre: ' . get_the_title( $genre ) . ' — ' . trailingslashit( get_permalink( $genre ) ) . 'about/';
	}
	$body = implode( "\n", $lines ) . "\n\n" . $post->post_content . "\n\n—\n" .
		'Sent from the contact form of ' . $site . '. Reply to this e-mail to answer ' . ( $name ? $name : 'the sender' ) . ".\n" .
		'Also kept in WordPress: ' . admin_url( 'edit.php?post_type=ga_message' ) . "\n";

	$headers = array( 'Content-Type: text/plain; charset=UTF-8', 'Reply-To: ' . ( $name ? $name . ' <' . $email . '>' : $email ) );
	// Sent from the receiving address when it belongs to the site's own domain:
	// that is the address the domain vouches for, and mail from it is not
	// taken for spam. Anything else keeps WordPress's own sender.
	$host = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
	if ( $host && strtolower( substr( strrchr( $to, '@' ), 1 ) ) === strtolower( $host ) ) {
		$headers[] = 'From: ' . $site . ' <' . $to . '>';
	}
	$subject = '[' . $site . '] ' . $topic . ( $genre ? ': ' . get_the_title( $genre ) : '' );
	return wp_mail( $to, $subject, $body, $headers );
}

/* ---- Entry points: the script posts to the REST API, and the page works
 * without it through admin-post.php. --------------------------------------- */

add_action( 'rest_api_init', 'genre_atlas_contact_rest' );
function genre_atlas_contact_rest() {
	register_rest_route(
		'genre-atlas/v1',
		'/contact',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => function ( $request ) {
				$r = genre_atlas_contact_submit( $request->get_params() );
				return is_wp_error( $r ) ? $r : rest_ensure_response( array( 'ok' => true ) );
			},
		)
	);
}

add_action( 'admin_post_nopriv_genre_atlas_contact', 'genre_atlas_contact_post' );
add_action( 'admin_post_genre_atlas_contact', 'genre_atlas_contact_post' );
function genre_atlas_contact_post() {
	$r = genre_atlas_contact_submit( wp_unslash( $_POST ) ); // phpcs:ignore WordPress.Security.NonceVerification
	wp_safe_redirect( home_url( '/contact/' ) . ( is_wp_error( $r ) ? '?error=' . rawurlencode( $r->get_error_message() ) : '?sent=1' ) );
	exit;
}

/** The form as plain HTML, before the script takes over or without it. */
function genre_atlas_contact_fallback_html() {
	// phpcs:disable WordPress.Security.NonceVerification
	$out = '<h1>Contact</h1>';
	if ( isset( $_GET['sent'] ) ) {
		return $out . '<p>Thank you. Your message has been sent.</p>';
	}
	if ( isset( $_GET['error'] ) ) {
		$out .= '<p><strong>' . esc_html( sanitize_text_field( wp_unslash( $_GET['error'] ) ) ) . '</strong></p>';
	}
	// phpcs:enable
	$out .= '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">' .
		'<input type="hidden" name="action" value="genre_atlas_contact"><input type="hidden" name="token" value="' . esc_attr( genre_atlas_contact_token() ) . '">' .
		'<p><label>Topic <select name="topic">';
	foreach ( genre_atlas_contact_topics() as $k => $label ) {
		$out .= '<option value="' . esc_attr( $k ) . '">' . esc_html( $label ) . '</option>';
	}
	return $out . '</select></label></p>' .
		'<p><label>Message <textarea name="message" rows="8" cols="60" required></textarea></label></p>' .
		'<p><label>Name (optional) <input name="name" maxlength="100"></label></p>' .
		'<p><label>E-mail <input type="email" name="email" required></label></p>' .
		'<p style="position:absolute;left:-9999px" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></p>' .
		'<p><button type="submit">Send</button></p></form>';
}

/* ---- Messages screen ----------------------------------------------------- */

add_filter( 'manage_ga_message_posts_columns', 'genre_atlas_message_columns' );
function genre_atlas_message_columns( $columns ) {
	return array(
		'cb'           => $columns['cb'],
		'title'        => 'Message',
		'ga_msg_text'  => 'Text',
		'ga_msg_from'  => 'From',
		'ga_msg_genre' => 'Genre',
		'ga_msg_mail'  => 'E-mail',
		'date'         => $columns['date'],
	);
}

add_action( 'manage_ga_message_posts_custom_column', 'genre_atlas_message_column', 10, 2 );
function genre_atlas_message_column( $column, $id ) {
	if ( 'ga_msg_text' === $column ) {
		echo esc_html( wp_html_excerpt( get_post_field( 'post_content', $id ), 140, '…' ) );
	} elseif ( 'ga_msg_from' === $column ) {
		$email = get_post_meta( $id, 'ga_msg_email', true );
		echo '<a href="mailto:' . esc_attr( $email ) . '">' . esc_html( $email ) . '</a>';
	} elseif ( 'ga_msg_genre' === $column ) {
		$genre = (int) get_post_meta( $id, 'ga_msg_genre', true );
		echo $genre ? '<a href="' . esc_url( trailingslashit( get_permalink( $genre ) ) . 'about/' ) . '">' . esc_html( get_the_title( $genre ) ) . '</a>' : '—';
	} elseif ( 'ga_msg_mail' === $column ) {
		echo get_post_meta( $id, 'ga_msg_mailed', true ) ? 'Sent' : '<strong style="color:#b32d2e">Not sent</strong>';
	}
}

add_action( 'add_meta_boxes_ga_message', 'genre_atlas_add_message_box' );
function genre_atlas_add_message_box() {
	add_meta_box( 'genre-atlas-message', 'Message', 'genre_atlas_render_message_box', 'ga_message', 'normal', 'high' );
}

function genre_atlas_render_message_box( $post ) {
	$email  = get_post_meta( $post->ID, 'ga_msg_email', true );
	$name   = get_post_meta( $post->ID, 'ga_msg_name', true );
	$topics = genre_atlas_contact_topics();
	$topic  = get_post_meta( $post->ID, 'ga_msg_topic', true );
	$genre  = (int) get_post_meta( $post->ID, 'ga_msg_genre', true );
	$rows   = array(
		'From'  => ( $name ? esc_html( $name ) . ' ' : '' ) . '&lt;<a href="mailto:' . esc_attr( $email ) . '">' . esc_html( $email ) . '</a>&gt;',
		'Topic' => esc_html( isset( $topics[ $topic ] ) ? $topics[ $topic ] : $topic ),
		'Genre' => $genre ? '<a href="' . esc_url( trailingslashit( get_permalink( $genre ) ) . 'about/' ) . '">' . esc_html( get_the_title( $genre ) ) . '</a>' : '—',
		'Sent'  => esc_html( get_the_date( 'j F Y, H:i', $post ) ),
		'Mail'  => get_post_meta( $post->ID, 'ga_msg_mailed', true ) ? 'Delivered to ' . esc_html( genre_atlas_contact_to() ) . ' (or to the address set at the time).' : '<strong>The e-mail could not be sent.</strong> The message is only here.',
	);
	echo '<table class="form-table" role="presentation"><tbody>';
	foreach ( $rows as $label => $html ) {
		echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td>' . $html . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput
	}
	echo '</tbody></table><div style="white-space:pre-wrap;padding:12px 16px;background:#f6f7f7;border-left:4px solid #2271b1;font-size:14px;line-height:1.6">' . esc_html( $post->post_content ) . '</div>';
	echo '<p><a class="button button-primary" href="mailto:' . esc_attr( $email ) . '?subject=' . rawurlencode( 'Re: ' . $post->post_title ) . '">Reply by e-mail</a></p>';
}
