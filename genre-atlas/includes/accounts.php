<?php
/**
 * Accounts: a visitor's own atlas, kept on the site.
 *
 * WordPress users with the "subscriber" role, created from /my-atlas/ and
 * never let into the admin. A pseudo (the login, unique, shown on a public
 * profile) and an e-mail address, confirmed by a link before the first sign
 * in; a password, hashed by WordPress, or a Google or Facebook sign-in
 * (includes/oauth.php). What an account keeps:
 * - its atlas (user meta ga_atlas, JSON): favourite genres, favourite songs,
 *   and the genres heard with the day each was first heard;
 * - its listening history, only when the member turns it on (table
 *   {prefix}ga_history), erased when it is turned off;
 * - whether its profile is public (/atlas/<pseudo>/, never indexed).
 * Every member can download all of it and delete the account. An account
 * left unconfirmed for 7 days is deleted, and so is one unused for 3 years,
 * after an e-mail warning a month before (/legal/ states all of this).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GENRE_ATLAS_DB             = '1';      // the history table's shape
const GENRE_ATLAS_MAX_SONGS      = 500;      // favourite songs per account
const GENRE_ATLAS_VERIFY_DAYS    = 2;        // a confirmation link lasts this long
const GENRE_ATLAS_UNCONFIRMED    = 7;        // days before an unconfirmed account goes
const GENRE_ATLAS_INACTIVE_YEARS = 3;        // unused this long, an account goes

function genre_atlas_history_table() {
	global $wpdb;
	return $wpdb->prefix . 'ga_history';
}

add_action( 'init', 'genre_atlas_history_install' );
function genre_atlas_history_install() {
	if ( get_option( 'genre_atlas_db' ) === GENRE_ATLAS_DB ) {
		return;
	}
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta(
		'CREATE TABLE ' . genre_atlas_history_table() . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint(20) unsigned NOT NULL,
			genre_id bigint(20) unsigned NOT NULL,
			title varchar(191) NOT NULL DEFAULT '',
			artist varchar(191) NOT NULL DEFAULT '',
			youtube varchar(16) NOT NULL DEFAULT '',
			heard_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY user_id (user_id)
		) " . $wpdb->get_charset_collate() . ';'
	);
	update_option( 'genre_atlas_db', GENRE_ATLAS_DB );
}

/* ---- Pages: /my-atlas/ and /atlas/<pseudo>/ ------------------------------ */

add_action( 'init', 'genre_atlas_profile_route', 11 );
function genre_atlas_profile_route() {
	add_rewrite_rule( '^atlas/([a-z0-9_-]+)/?$', 'index.php?post_type=genre&ga_profile=$matches[1]', 'top' );
}

add_filter( 'query_vars', 'genre_atlas_profile_query_var' );
function genre_atlas_profile_query_var( $vars ) {
	$vars[] = 'ga_profile';
	return $vars;
}

function genre_atlas_profile_pseudo() {
	return is_post_type_archive( 'genre' ) ? sanitize_key( (string) get_query_var( 'ga_profile' ) ) : '';
}

function genre_atlas_profile_url( $pseudo ) {
	return home_url( '/atlas/' . rawurlencode( $pseudo ) . '/' );
}

/* ---- Members stay out of the admin --------------------------------------- */

add_action( 'admin_init', 'genre_atlas_members_out' );
function genre_atlas_members_out() {
	if ( wp_doing_ajax() || ! is_user_logged_in() || current_user_can( 'edit_posts' ) ) {
		return;
	}
	if ( isset( $GLOBALS['pagenow'] ) && 'admin-post.php' === $GLOBALS['pagenow'] ) {
		return;
	}
	wp_safe_redirect( home_url( '/my-atlas/' ) );
	exit;
}

add_filter( 'show_admin_bar', 'genre_atlas_members_bar' );
function genre_atlas_members_bar( $show ) {
	return $show && current_user_can( 'edit_posts' );
}

/* ---- Reading and writing an account ------------------------------------- */

function genre_atlas_user_atlas( $uid ) {
	$a = json_decode( (string) get_user_meta( $uid, 'ga_atlas', true ), true );
	$a = is_array( $a ) ? $a : array();
	return array(
		'heard'  => isset( $a['heard'] ) && is_array( $a['heard'] ) ? $a['heard'] : array(),
		'genres' => isset( $a['genres'] ) && is_array( $a['genres'] ) ? array_values( array_map( 'intval', $a['genres'] ) ) : array(),
		'tracks' => isset( $a['tracks'] ) && is_array( $a['tracks'] ) ? array_values( $a['tracks'] ) : array(),
	);
}

function genre_atlas_save_atlas( $uid, $atlas ) {
	update_user_meta( $uid, 'ga_atlas', wp_slash( wp_json_encode( $atlas, JSON_UNESCAPED_UNICODE ) ) );
}

function genre_atlas_is_genre( $id ) {
	$p = get_post( (int) $id );
	return $p && 'genre' === $p->post_type && 'publish' === $p->post_status;
}

/** A song as a member keeps it: a few short fields, nothing else. */
function genre_atlas_clean_song( $t ) {
	$t  = is_array( $t ) ? $t : array();
	$yt = isset( $t['youtube'] ) ? (string) $t['youtube'] : '';
	$dz = isset( $t['deezer'] ) ? (string) $t['deezer'] : '';
	return array(
		'title'   => mb_substr( sanitize_text_field( isset( $t['title'] ) ? $t['title'] : '' ), 0, 191 ),
		'artist'  => mb_substr( sanitize_text_field( isset( $t['artist'] ) ? $t['artist'] : '' ), 0, 191 ),
		'genre'   => isset( $t['genre'] ) ? (int) $t['genre'] : 0,
		'youtube' => preg_match( '/^[\w-]{11}$/', $yt ) ? $yt : '',
		'deezer'  => preg_match( '~^https://www\.deezer\.com/track/\d+$~', $dz ) ? $dz : '',
	);
}

function genre_atlas_song_key( $t ) {
	return '' !== $t['youtube'] ? $t['youtube'] : ( '' !== $t['deezer'] ? $t['deezer'] : $t['title'] );
}

function genre_atlas_has_password( $uid ) {
	return '1' === (string) get_user_meta( $uid, 'ga_password', true );
}

/** What the page shows of the signed-in member. */
function genre_atlas_account_payload( $uid ) {
	$u = get_userdata( $uid );
	return array(
		'pseudo'    => $u->user_login,
		'email'     => $u->user_email,
		'since'     => mysql2date( 'Y-m-d', $u->user_registered ),
		'public'    => '1' === (string) get_user_meta( $uid, 'ga_public', true ),
		'history'   => '1' === (string) get_user_meta( $uid, 'ga_history', true ),
		'password'  => genre_atlas_has_password( $uid ),
		'pending'   => (string) get_user_meta( $uid, 'ga_new_email', true ),
		'providers' => array(
			'google'   => '' !== (string) get_user_meta( $uid, 'ga_google', true ),
			'facebook' => '' !== (string) get_user_meta( $uid, 'ga_facebook', true ),
		),
		'profile'   => genre_atlas_profile_url( $u->user_login ),
		'atlas'     => genre_atlas_user_atlas( $uid ),
		'played'    => genre_atlas_history( $uid, 50 ),
	);
}

function genre_atlas_history( $uid, $limit = 0 ) {
	global $wpdb;
	$sql = $wpdb->prepare( 'SELECT genre_id AS genre, title, artist, youtube, heard_at AS at FROM ' . genre_atlas_history_table() . ' WHERE user_id = %d ORDER BY id DESC', $uid );
	if ( $limit ) {
		$sql .= ' LIMIT ' . (int) $limit;
	}
	$rows = $wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
	foreach ( $rows as &$r ) {
		$r['genre'] = (int) $r['genre'];
	}
	return $rows;
}

/** Marks the member as seen today: an account unused for 3 years is deleted. */
function genre_atlas_seen( $uid ) {
	$today = gmdate( 'Y-m-d' );
	if ( get_user_meta( $uid, 'ga_seen', true ) !== $today ) {
		update_user_meta( $uid, 'ga_seen', $today );
		delete_user_meta( $uid, 'ga_warned' );
	}
}

/* ---- Rules for pseudos and passwords ------------------------------------- */

function genre_atlas_pseudo_error( $pseudo ) {
	if ( ! preg_match( '/^[a-z0-9_-]{3,24}$/', $pseudo ) ) {
		return 'A pseudo is 3 to 24 characters: lowercase letters, digits, - or _.';
	}
	$reserved = array( 'admin', 'administrator', 'root', 'genre', 'genres', 'atlas', 'every-genre', 'everygenre', 'support', 'contact', 'legal', 'moderator', 'staff', 'webmaster', 'null', 'undefined' );
	if ( in_array( $pseudo, $reserved, true ) || username_exists( $pseudo ) ) {
		return 'This pseudo is taken. Try another one.';
	}
	return '';
}

function genre_atlas_password_error( $password, $pseudo, $email ) {
	if ( strlen( $password ) < 10 ) {
		return 'Choose a password of 10 characters or more.';
	}
	if ( strlen( $password ) > 200 ) {
		return 'This password is too long.';
	}
	$low = strtolower( $password );
	if ( ( $pseudo && false !== strpos( $low, strtolower( $pseudo ) ) ) || strtolower( $email ) === $low ) {
		return 'The password must not contain your pseudo or your e-mail address.';
	}
	return '';
}

/* ---- E-mails ------------------------------------------------------------- */

function genre_atlas_account_mail( $to, $subject, $lines ) {
	$site    = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
	$body    = implode( "\n\n", $lines ) . "\n\n— " . $site . "\n" . home_url( '/' );
	$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
	// As for the contact form: sent from the contact address when it is on the
	// site's own domain, which vouches for it, so it is not taken for spam.
	$from = genre_atlas_contact_to();
	$host = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
	if ( $host && strtolower( substr( (string) strrchr( $from, '@' ), 1 ) ) === strtolower( $host ) ) {
		$headers[] = 'From: ' . $site . ' <' . $from . '>';
	}
	return wp_mail( $to, '[' . $site . '] ' . $subject, $body, $headers );
}

/** A one-time link for an e-mail address: confirming an account, or a new address. */
function genre_atlas_send_verification( $uid, $email, $kind = 'account' ) {
	$key = wp_generate_password( 32, false );
	update_user_meta( $uid, 'ga_verify', hash_hmac( 'sha256', $kind . '|' . $key, wp_salt( 'auth' ) ) . '|' . $kind . '|' . ( time() + GENRE_ATLAS_VERIFY_DAYS * DAY_IN_SECONDS ) );
	$link = add_query_arg( 'verify', $uid . '-' . $key, home_url( '/my-atlas/' ) );
	$u    = get_userdata( $uid );
	if ( 'email' === $kind ) {
		return genre_atlas_account_mail( $email, 'Confirm your new e-mail address', array( 'Hello ' . $u->user_login . ',', 'To use this address for your atlas, open this link within ' . GENRE_ATLAS_VERIFY_DAYS . ' days:', $link, 'If you did not ask for it, ignore this message: nothing changes.' ) );
	}
	return genre_atlas_account_mail( $email, 'Confirm your account', array( 'Hello ' . $u->user_login . ',', 'To confirm your account and sign in, open this link within ' . GENRE_ATLAS_VERIFY_DAYS . ' days:', $link, 'If you did not create this account, ignore this message: it will be deleted in ' . GENRE_ATLAS_UNCONFIRMED . ' days.' ) );
}

/* ---- Signing in ---------------------------------------------------------- */

// A cookie set during a REST request is only sent back on the next one: put
// it where the nonce below looks for it, so the page gets a working nonce.
add_action( 'set_logged_in_cookie', 'genre_atlas_cookie_now' );
function genre_atlas_cookie_now( $cookie ) {
	if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
		$_COOKIE[ LOGGED_IN_COOKIE ] = $cookie;
	}
}

function genre_atlas_sign_in( $uid ) {
	wp_set_auth_cookie( $uid, true, is_ssl() );
	wp_set_current_user( $uid );
	genre_atlas_seen( $uid );
	return array(
		'account' => genre_atlas_account_payload( $uid ),
		'nonce'   => wp_create_nonce( 'wp_rest' ),
	);
}

function genre_atlas_err( $code, $message, $status = 400 ) {
	return new WP_Error( 'genre_atlas_' . $code, $message, array( 'status' => $status ) );
}

/** Members only: the cookie and the page's nonce (WordPress checks both). */
function genre_atlas_member() {
	return is_user_logged_in();
}

/* ---- REST: genre-atlas/v1/account/... ------------------------------------ */

add_action( 'rest_api_init', 'genre_atlas_account_rest' );
function genre_atlas_account_rest() {
	$open = function () {
		return true;
	};
	$routes = array(
		array( 'account', 'GET', 'genre_atlas_rest_account', $open ),
		array( 'account/register', 'POST', 'genre_atlas_rest_register', $open ),
		array( 'account/verify', 'POST', 'genre_atlas_rest_verify', $open ),
		array( 'account/resend', 'POST', 'genre_atlas_rest_resend', $open ),
		array( 'account/login', 'POST', 'genre_atlas_rest_login', $open ),
		array( 'account/forgot', 'POST', 'genre_atlas_rest_forgot', $open ),
		array( 'account/reset', 'POST', 'genre_atlas_rest_reset', $open ),
		array( 'account/logout', 'POST', 'genre_atlas_rest_logout', 'genre_atlas_member' ),
		array( 'account/fav', 'POST', 'genre_atlas_rest_fav', 'genre_atlas_member' ),
		array( 'account/like', 'POST', 'genre_atlas_rest_like', 'genre_atlas_member' ),
		array( 'account/heard', 'POST', 'genre_atlas_rest_heard', 'genre_atlas_member' ),
		array( 'account/settings', 'POST', 'genre_atlas_rest_settings', 'genre_atlas_member' ),
		array( 'account/password', 'POST', 'genre_atlas_rest_password', 'genre_atlas_member' ),
		array( 'account/email', 'POST', 'genre_atlas_rest_email', 'genre_atlas_member' ),
		array( 'account/export', 'GET', 'genre_atlas_rest_export', 'genre_atlas_member' ),
		array( 'account/delete', 'POST', 'genre_atlas_rest_delete', 'genre_atlas_member' ),
		array( 'profile/(?P<pseudo>[a-z0-9_-]+)', 'GET', 'genre_atlas_rest_profile', $open ),
	);
	foreach ( $routes as $r ) {
		register_rest_route(
			'genre-atlas/v1',
			'/' . $r[0],
			array(
				'methods'             => $r[1],
				'permission_callback' => $r[3],
				'callback'            => $r[2],
			)
		);
	}
}

function genre_atlas_rest_account() {
	$uid = get_current_user_id();
	if ( ! $uid ) {
		return rest_ensure_response( array( 'account' => null ) );
	}
	genre_atlas_seen( $uid );
	return rest_ensure_response( array( 'account' => genre_atlas_account_payload( $uid ) ) );
}

function genre_atlas_rest_register( $request ) {
	$pseudo = strtolower( trim( (string) $request['pseudo'] ) );
	$email  = trim( (string) $request['email'] );
	$pass   = (string) $request['password'];
	if ( '' !== (string) $request['website'] || genre_atlas_contact_token_age( (string) $request['token'] ) < 3 ) {
		return genre_atlas_err( 'spam', 'Something went wrong. Reload the page and try again.' );
	}
	if ( ! genre_atlas_rate_ok( 'register', 5 ) ) {
		return genre_atlas_err( 'limit', 'Too many accounts created from this connection. Try again in an hour.', 429 );
	}
	if ( empty( $request['terms'] ) ) {
		return genre_atlas_err( 'terms', 'To create an account, accept the terms of use and confirm you are 15 or older.' );
	}
	$bad = genre_atlas_pseudo_error( $pseudo );
	if ( $bad ) {
		return genre_atlas_err( 'pseudo', $bad );
	}
	if ( ! is_email( $email ) ) {
		return genre_atlas_err( 'email', 'Enter a valid e-mail address.' );
	}
	$bad = genre_atlas_password_error( $pass, $pseudo, $email );
	if ( $bad ) {
		return genre_atlas_err( 'password', $bad );
	}
	$done = array( 'sent' => true, 'message' => 'Almost there: open the link we sent to ' . $email . ' to confirm your account.' );
	// The answer is the same whether or not the address has an account, so
	// the form cannot be used to find out who has one.
	$known = get_user_by( 'email', $email );
	if ( $known ) {
		genre_atlas_account_mail( $email, 'Someone tried to create an account with your address', array( 'Hello ' . $known->user_login . ',', 'Someone, maybe you, tried to create an account with this address, which already has one. To sign in, or to choose a new password, go to:', home_url( '/my-atlas/' ), 'If it was not you, you can ignore this message.' ) );
		return rest_ensure_response( $done );
	}
	$uid = wp_insert_user(
		array(
			'user_login'   => $pseudo,
			'user_email'   => $email,
			'user_pass'    => $pass,
			'display_name' => $pseudo,
			'nickname'     => $pseudo,
			'role'         => 'subscriber',
		)
	);
	if ( is_wp_error( $uid ) ) {
		return genre_atlas_err( 'create', 'The account could not be created. Try another pseudo.' );
	}
	update_user_meta( $uid, 'ga_verified', '0' );
	update_user_meta( $uid, 'ga_password', '1' );
	update_user_meta( $uid, 'ga_terms', gmdate( 'c' ) );
	update_user_meta( $uid, 'show_admin_bar_front', 'false' );
	genre_atlas_send_verification( $uid, $email );
	return rest_ensure_response( $done );
}

/** Checks a link from an e-mail, once. Returns [uid, kind] or a WP_Error. */
function genre_atlas_check_link( $code ) {
	if ( ! preg_match( '/^(\d+)-([A-Za-z0-9]{32})$/', (string) $code, $m ) ) {
		return genre_atlas_err( 'link', 'This link is not valid. Ask for a new one.' );
	}
	$uid   = (int) $m[1];
	$saved = explode( '|', (string) get_user_meta( $uid, 'ga_verify', true ) );
	if ( 3 !== count( $saved ) || time() > (int) $saved[2] || ! hash_equals( $saved[0], hash_hmac( 'sha256', $saved[1] . '|' . $m[2], wp_salt( 'auth' ) ) ) ) {
		return genre_atlas_err( 'link', 'This link is not valid any more: links last ' . GENRE_ATLAS_VERIFY_DAYS . ' days and work once. Sign in to get a new one.' );
	}
	delete_user_meta( $uid, 'ga_verify' );
	return array( $uid, $saved[1] );
}

function genre_atlas_rest_verify( $request ) {
	$ok = genre_atlas_check_link( $request['code'] );
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	list( $uid, $kind ) = $ok;
	if ( 'email' === $kind ) {
		$new = (string) get_user_meta( $uid, 'ga_new_email', true );
		if ( ! is_email( $new ) || email_exists( $new ) ) {
			return genre_atlas_err( 'email', 'This address is already used by another account.' );
		}
		wp_update_user( array( 'ID' => $uid, 'user_email' => $new ) );
		delete_user_meta( $uid, 'ga_new_email' );
	}
	update_user_meta( $uid, 'ga_verified', '1' );
	return rest_ensure_response( genre_atlas_sign_in( $uid ) );
}

function genre_atlas_rest_resend( $request ) {
	$email = trim( (string) $request['email'] );
	if ( genre_atlas_rate_ok( 'resend', 5 ) ) {
		$u = is_email( $email ) ? get_user_by( 'email', $email ) : false;
		if ( $u && '0' === (string) get_user_meta( $u->ID, 'ga_verified', true ) ) {
			genre_atlas_send_verification( $u->ID, $email );
		}
	}
	return rest_ensure_response( array( 'sent' => true, 'message' => 'If this address has an account waiting, a new link is on its way.' ) );
}

function genre_atlas_rest_login( $request ) {
	$login = trim( (string) $request['login'] );
	$pass  = (string) $request['password'];
	if ( ! genre_atlas_rate_ok( 'login', 30 ) ) {
		return genre_atlas_err( 'limit', 'Too many attempts from this connection. Try again in an hour.', 429 );
	}
	$u = is_email( $login ) ? get_user_by( 'email', $login ) : get_user_by( 'login', strtolower( $login ) );
	$wrong = genre_atlas_err( 'wrong', 'Wrong e-mail, pseudo or password.', 403 );
	if ( ! $u ) {
		return $wrong;
	}
	// Eight wrong passwords lock the account for a quarter of an hour, so
	// a password cannot be guessed from many connections either.
	$fails = (int) get_transient( 'genre_atlas_fails_' . $u->ID );
	if ( $fails >= 8 ) {
		return genre_atlas_err( 'locked', 'Too many wrong passwords. Wait a quarter of an hour, or choose a new password.', 429 );
	}
	if ( ! wp_check_password( $pass, $u->user_pass, $u->ID ) ) {
		set_transient( 'genre_atlas_fails_' . $u->ID, $fails + 1, 15 * MINUTE_IN_SECONDS );
		return $wrong;
	}
	delete_transient( 'genre_atlas_fails_' . $u->ID );
	if ( user_can( $u, 'edit_posts' ) ) {
		// The administrator keeps WordPress's own login page, and its protections.
		return genre_atlas_err( 'staff', 'The administrator signs in from the admin.', 403 );
	}
	if ( '0' === (string) get_user_meta( $u->ID, 'ga_verified', true ) ) {
		return genre_atlas_err( 'unconfirmed', 'Confirm your e-mail address first: open the link we sent you.', 403 );
	}
	return rest_ensure_response( genre_atlas_sign_in( $u->ID ) );
}

function genre_atlas_rest_forgot( $request ) {
	$email = trim( (string) $request['email'] );
	if ( genre_atlas_rate_ok( 'forgot', 5 ) ) {
		$u = is_email( $email ) ? get_user_by( 'email', $email ) : false;
		if ( $u && ! user_can( $u, 'edit_posts' ) ) {
			$key = get_password_reset_key( $u );
			if ( ! is_wp_error( $key ) ) {
				$link = add_query_arg( array( 'reset' => $key, 'login' => rawurlencode( $u->user_login ) ), home_url( '/my-atlas/' ) );
				genre_atlas_account_mail( $email, 'Choose a new password', array( 'Hello ' . $u->user_login . ',', 'To choose a new password, open this link within a day:', $link, 'If you did not ask for it, ignore this message: your password stays as it is.' ) );
			}
		}
	}
	return rest_ensure_response( array( 'sent' => true, 'message' => 'If this address has an account, a link to choose a new password is on its way.' ) );
}

function genre_atlas_rest_reset( $request ) {
	$u = check_password_reset_key( (string) $request['key'], sanitize_user( (string) $request['login'] ) );
	if ( is_wp_error( $u ) ) {
		return genre_atlas_err( 'link', 'This link is not valid any more. Ask for a new one.' );
	}
	$bad = genre_atlas_password_error( (string) $request['password'], $u->user_login, $u->user_email );
	if ( $bad ) {
		return genre_atlas_err( 'password', $bad );
	}
	reset_password( $u, (string) $request['password'] );
	update_user_meta( $u->ID, 'ga_password', '1' );
	update_user_meta( $u->ID, 'ga_verified', '1' ); // the link proved the address
	delete_transient( 'genre_atlas_fails_' . $u->ID );
	return rest_ensure_response( genre_atlas_sign_in( $u->ID ) );
}

function genre_atlas_rest_logout() {
	wp_logout();
	wp_set_current_user( 0 );
	return rest_ensure_response( array( 'account' => null ) );
}

function genre_atlas_rest_fav( $request ) {
	$uid = get_current_user_id();
	$id  = (int) $request['genre'];
	if ( ! genre_atlas_is_genre( $id ) ) {
		return genre_atlas_err( 'genre', 'No such genre.', 404 );
	}
	$a   = genre_atlas_user_atlas( $uid );
	$a['genres'] = array_values( array_diff( $a['genres'], array( $id ) ) );
	if ( ! empty( $request['on'] ) ) {
		$a['genres'][] = $id;
	}
	genre_atlas_save_atlas( $uid, $a );
	return rest_ensure_response( array( 'atlas' => $a ) );
}

function genre_atlas_rest_like( $request ) {
	$uid  = get_current_user_id();
	$song = genre_atlas_clean_song( $request['track'] );
	if ( '' === $song['title'] || ! genre_atlas_is_genre( $song['genre'] ) ) {
		return genre_atlas_err( 'song', 'No such song.' );
	}
	$a   = genre_atlas_user_atlas( $uid );
	$key = genre_atlas_song_key( $song );
	$a['tracks'] = array_values(
		array_filter(
			$a['tracks'],
			function ( $t ) use ( $key ) {
				return genre_atlas_song_key( genre_atlas_clean_song( $t ) ) !== $key;
			}
		)
	);
	if ( ! empty( $request['on'] ) ) {
		if ( count( $a['tracks'] ) >= GENRE_ATLAS_MAX_SONGS ) {
			return genre_atlas_err( 'full', 'Your atlas keeps ' . GENRE_ATLAS_MAX_SONGS . ' songs at most: remove one first.' );
		}
		$a['tracks'][] = $song + array( 'added' => gmdate( 'Y-m-d' ) );
	}
	genre_atlas_save_atlas( $uid, $a );
	return rest_ensure_response( array( 'atlas' => $a ) );
}

/**
 * A song played long enough to count (20 seconds): the genre is heard, and
 * the song goes into the history when the member keeps one.
 */
function genre_atlas_rest_heard( $request ) {
	$uid  = get_current_user_id();
	$song = genre_atlas_clean_song( $request['track'] );
	$id   = (int) $request['genre'];
	if ( ! genre_atlas_is_genre( $id ) ) {
		return genre_atlas_err( 'genre', 'No such genre.', 404 );
	}
	$a = genre_atlas_user_atlas( $uid );
	if ( empty( $a['heard'][ $id ] ) ) {
		$a['heard'][ $id ] = gmdate( 'Y-m-d' );
		genre_atlas_save_atlas( $uid, $a );
	}
	if ( '1' === (string) get_user_meta( $uid, 'ga_history', true ) ) {
		global $wpdb;
		$wpdb->insert(
			genre_atlas_history_table(),
			array(
				'user_id'  => $uid,
				'genre_id' => $id,
				'title'    => $song['title'],
				'artist'   => $song['artist'],
				'youtube'  => $song['youtube'],
				'heard_at' => gmdate( 'Y-m-d H:i:s' ),
			)
		);
	}
	genre_atlas_seen( $uid );
	return rest_ensure_response( array( 'atlas' => $a ) );
}

function genre_atlas_rest_settings( $request ) {
	$uid = get_current_user_id();
	if ( null !== $request['public'] ) {
		update_user_meta( $uid, 'ga_public', $request['public'] ? '1' : '0' );
	}
	if ( null !== $request['history'] ) {
		update_user_meta( $uid, 'ga_history', $request['history'] ? '1' : '0' );
		if ( ! $request['history'] ) {
			// Turned off, the history is erased: nothing is kept "just in case".
			global $wpdb;
			$wpdb->delete( genre_atlas_history_table(), array( 'user_id' => $uid ) );
		}
	}
	return rest_ensure_response( array( 'account' => genre_atlas_account_payload( $uid ) ) );
}

function genre_atlas_rest_password( $request ) {
	$uid = get_current_user_id();
	$u   = get_userdata( $uid );
	if ( genre_atlas_has_password( $uid ) && ! wp_check_password( (string) $request['current'], $u->user_pass, $uid ) ) {
		return genre_atlas_err( 'wrong', 'Your current password is not this one.', 403 );
	}
	$bad = genre_atlas_password_error( (string) $request['password'], $u->user_login, $u->user_email );
	if ( $bad ) {
		return genre_atlas_err( 'password', $bad );
	}
	wp_set_password( (string) $request['password'], $uid ); // signs out every session…
	update_user_meta( $uid, 'ga_password', '1' );
	return rest_ensure_response( genre_atlas_sign_in( $uid ) ); // …so this one signs in again
}

function genre_atlas_rest_email( $request ) {
	$uid   = get_current_user_id();
	$email = trim( (string) $request['email'] );
	if ( ! is_email( $email ) ) {
		return genre_atlas_err( 'email', 'Enter a valid e-mail address.' );
	}
	if ( ! genre_atlas_rate_ok( 'email', 5 ) ) {
		return genre_atlas_err( 'limit', 'Too many changes from this connection. Try again in an hour.', 429 );
	}
	// An address already in use is not revealed: the link just will not work.
	update_user_meta( $uid, 'ga_new_email', $email );
	if ( ! email_exists( $email ) ) {
		genre_atlas_send_verification( $uid, $email, 'email' );
	}
	return rest_ensure_response( array( 'sent' => true, 'message' => 'Open the link we sent to ' . $email . ' to start using it. Until then, your account keeps its current address.', 'account' => genre_atlas_account_payload( $uid ) ) );
}

function genre_atlas_rest_export() {
	$uid  = get_current_user_id();
	$data = genre_atlas_account_payload( $uid );
	unset( $data['played'] );
	$data['history']  = genre_atlas_history( $uid );
	$data['exported'] = gmdate( 'c' );
	$data['site']     = home_url( '/' );
	return rest_ensure_response( $data );
}

/** Everything goes: the account, its atlas, its history, its sign-in links. */
function genre_atlas_delete_member( $uid ) {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/user.php';
	$wpdb->delete( genre_atlas_history_table(), array( 'user_id' => $uid ) );
	return wp_delete_user( $uid );
}

function genre_atlas_rest_delete( $request ) {
	$uid = get_current_user_id();
	$u   = get_userdata( $uid );
	if ( user_can( $u, 'edit_posts' ) ) {
		return genre_atlas_err( 'staff', 'An administrator account is not deleted from here.', 403 );
	}
	if ( strtolower( (string) $request['confirm'] ) !== $u->user_login ) {
		return genre_atlas_err( 'confirm', 'Type your pseudo to confirm.' );
	}
	if ( genre_atlas_has_password( $uid ) && ! wp_check_password( (string) $request['password'], $u->user_pass, $uid ) ) {
		return genre_atlas_err( 'wrong', 'Your password is not this one.', 403 );
	}
	wp_logout();
	genre_atlas_delete_member( $uid );
	return rest_ensure_response( array( 'deleted' => true, 'account' => null ) );
}

/** What a public profile shows: the atlas, never the e-mail nor the history. */
function genre_atlas_rest_profile( $request ) {
	$u = get_user_by( 'login', sanitize_key( $request['pseudo'] ) );
	if ( ! $u || '1' !== (string) get_user_meta( $u->ID, 'ga_public', true ) || '1' !== (string) get_user_meta( $u->ID, 'ga_verified', true ) ) {
		return genre_atlas_err( 'profile', 'This atlas is private, or does not exist.', 404 );
	}
	$a = genre_atlas_user_atlas( $u->ID );
	return rest_ensure_response(
		array(
			'pseudo' => $u->user_login,
			'since'  => mysql2date( 'Y-m-d', $u->user_registered ),
			'heard'  => array_map( 'intval', array_keys( $a['heard'] ) ),
			'genres' => $a['genres'],
			'tracks' => array_map(
				function ( $t ) {
					return genre_atlas_clean_song( $t );
				},
				$a['tracks']
			),
		)
	);
}

/** The private or missing profile answers 404, so its page does too. */
add_action( 'template_redirect', 'genre_atlas_profile_404' );
function genre_atlas_profile_404() {
	$pseudo = genre_atlas_profile_pseudo();
	if ( ! $pseudo ) {
		return;
	}
	$u = get_user_by( 'login', $pseudo );
	if ( ! $u || '1' !== (string) get_user_meta( $u->ID, 'ga_public', true ) ) {
		status_header( 404 );
	}
}

/* ---- Housekeeping, once a day -------------------------------------------- */

add_action( 'init', 'genre_atlas_schedule_accounts' );
function genre_atlas_schedule_accounts() {
	if ( ! wp_next_scheduled( 'genre_atlas_accounts_daily' ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'genre_atlas_accounts_daily' );
	}
}

add_action( 'genre_atlas_accounts_daily', 'genre_atlas_accounts_daily' );
/**
 * Unconfirmed accounts go after 7 days. An account unused for 3 years is
 * warned by e-mail, then deleted a month later unless its owner signs in.
 *
 * @param int|null $now A clock, for the test bench.
 */
function genre_atlas_accounts_daily( $now = null ) {
	$now     = $now ? (int) $now : time();
	// Only the accounts made here (they accepted the terms): never another
	// subscriber the site may have had before.
	$members = get_users( array( 'role' => 'subscriber', 'meta_key' => 'ga_terms', 'fields' => 'ID', 'number' => -1 ) );
	foreach ( $members as $uid ) {
		$u = get_userdata( $uid );
		if ( '0' === (string) get_user_meta( $uid, 'ga_verified', true ) ) {
			if ( $now - strtotime( $u->user_registered . ' UTC' ) > GENRE_ATLAS_UNCONFIRMED * DAY_IN_SECONDS ) {
				genre_atlas_delete_member( $uid );
			}
			continue;
		}
		$seen   = (string) get_user_meta( $uid, 'ga_seen', true );
		$last   = $seen ? strtotime( $seen . ' 00:00:00 UTC' ) : strtotime( $u->user_registered . ' UTC' );
		$idle   = $now - $last;
		$limit  = GENRE_ATLAS_INACTIVE_YEARS * YEAR_IN_SECONDS;
		$warned = (int) get_user_meta( $uid, 'ga_warned', true );
		if ( $warned && $now - $warned > 30 * DAY_IN_SECONDS && $idle > $limit ) {
			genre_atlas_delete_member( $uid );
		} elseif ( ! $warned && $idle > $limit - 30 * DAY_IN_SECONDS ) {
			genre_atlas_account_mail( $u->user_email, 'Your atlas will be deleted in a month', array( 'Hello ' . $u->user_login . ',', 'You have not used your account for nearly ' . GENRE_ATLAS_INACTIVE_YEARS . ' years. As our privacy notice says, it will be deleted in a month, with everything it keeps. To keep it, just sign in:', home_url( '/my-atlas/' ) ) );
			update_user_meta( $uid, 'ga_warned', $now );
		}
	}
}

/** The page as served, before the script draws it. */
function genre_atlas_profile_html( $pseudo ) {
	return '<h1>' . esc_html( $pseudo ) . '’s atlas</h1><p>The genres ' . esc_html( $pseudo ) . ' has heard and their favourites, on ' . esc_html( get_bloginfo( 'name' ) ) . '. This page needs JavaScript.</p>';
}
