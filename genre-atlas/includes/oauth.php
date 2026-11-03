<?php
/**
 * Signing in with Google or Facebook, by plain redirects: no script from
 * either is ever loaded on the site, and nothing reaches them before the
 * visitor presses "Continue with …".
 *
 * /my-atlas/oauth/<provider>/          leaves for the provider (a single-use
 *                                      state, and PKCE for Google);
 * /my-atlas/oauth/<provider>/callback/ comes back: the code is exchanged on
 *                                      the server, the identity read, then
 *   - an account already linked to it is signed in;
 *   - a signed-in member who asked to link it gets it linked;
 *   - a Google address already used by an account is linked to it (Google
 *     vouches for the address; Facebook does not, so it is refused there);
 *   - anyone else chooses a pseudo and accepts the terms on /my-atlas/,
 *     which then creates the account.
 * Facebook also calls POST /wp-json/genre-atlas/v1/oauth/facebook/delete
 * when someone removes the app from their Facebook account, as Meta requires.
 *
 * Keys are set in Genres > Settings; a provider without its keys shows no button.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function genre_atlas_oauth_providers() {
	return array(
		'google'   => array(
			'name'      => 'Google',
			'authorize' => 'https://accounts.google.com/o/oauth2/v2/auth',
			'token'     => 'https://oauth2.googleapis.com/token',
		),
		'facebook' => array(
			'name'      => 'Facebook',
			'authorize' => 'https://www.facebook.com/' . genre_atlas_facebook_version() . '/dialog/oauth',
			'token'     => 'https://graph.facebook.com/' . genre_atlas_facebook_version() . '/oauth/access_token',
		),
	);
}

function genre_atlas_facebook_version() {
	$v = (string) get_option( 'genre_atlas_facebook_version', '' );
	return preg_match( '/^v\d+\.\d+$/', $v ) ? $v : 'v23.0';
}

function genre_atlas_oauth_keys( $provider ) {
	return array( (string) get_option( 'genre_atlas_' . $provider . '_id', '' ), (string) get_option( 'genre_atlas_' . $provider . '_secret', '' ) );
}

/** The providers whose keys are set: the page shows their buttons. */
function genre_atlas_oauth_ready() {
	$out = array();
	foreach ( array_keys( genre_atlas_oauth_providers() ) as $p ) {
		list( $id, $secret ) = genre_atlas_oauth_keys( $p );
		$out[ $p ] = '' !== $id && '' !== $secret;
	}
	return $out;
}

function genre_atlas_oauth_callback_url( $provider ) {
	return home_url( '/my-atlas/oauth/' . $provider . '/callback/' );
}

function genre_atlas_b64url( $raw ) {
	return rtrim( strtr( base64_encode( $raw ), '+/', '-_' ), '=' );
}

function genre_atlas_b64url_decode( $s ) {
	return base64_decode( strtr( $s, '-_', '+/' ) . str_repeat( '=', ( 4 - strlen( $s ) % 4 ) % 4 ) );
}

add_action( 'init', 'genre_atlas_oauth_route', 11 );
function genre_atlas_oauth_route() {
	add_rewrite_rule( '^my-atlas/oauth/(google|facebook)/?$', 'index.php?ga_oauth=$matches[1]', 'top' );
	add_rewrite_rule( '^my-atlas/oauth/(google|facebook)/callback/?$', 'index.php?ga_oauth=$matches[1]&ga_oauth_back=1', 'top' );
}

add_filter( 'query_vars', 'genre_atlas_oauth_query_vars' );
function genre_atlas_oauth_query_vars( $vars ) {
	$vars[] = 'ga_oauth';
	$vars[] = 'ga_oauth_back';
	return $vars;
}

/** Back on /my-atlas/, with what happened in the address for the page to say. */
function genre_atlas_oauth_done( $args ) {
	wp_safe_redirect( add_query_arg( $args, home_url( '/my-atlas/' ) ) );
	exit;
}

add_action( 'template_redirect', 'genre_atlas_oauth' );
function genre_atlas_oauth() {
	$provider = (string) get_query_var( 'ga_oauth' );
	$all      = genre_atlas_oauth_providers();
	if ( ! isset( $all[ $provider ] ) ) {
		return;
	}
	nocache_headers();
	list( $id, $secret ) = genre_atlas_oauth_keys( $provider );
	if ( '' === $id || '' === $secret ) {
		genre_atlas_oauth_done( array( 'sso_error' => 'off' ) );
	}
	if ( get_query_var( 'ga_oauth_back' ) ) {
		genre_atlas_oauth_back( $provider, $id, $secret );
	}
	// Linking to the signed-in account is asked from the page, with a nonce.
	$link = isset( $_GET['link'] ) && is_user_logged_in() && wp_verify_nonce( sanitize_key( wp_unslash( $_GET['link'] ) ), 'genre_atlas_link' ) ? get_current_user_id() : 0; // phpcs:ignore WordPress.Security.NonceVerification
	if ( ! genre_atlas_rate_ok( 'oauth', 30 ) ) {
		genre_atlas_oauth_done( array( 'sso_error' => 'limit' ) );
	}
	$state    = wp_generate_password( 32, false );
	$verifier = wp_generate_password( 64, false );
	$nonce    = wp_generate_password( 24, false );
	set_transient( 'genre_atlas_oauth_' . $state, array( 'provider' => $provider, 'verifier' => $verifier, 'nonce' => $nonce, 'link' => $link ), 15 * MINUTE_IN_SECONDS );
	$args = array(
		'client_id'     => $id,
		'redirect_uri'  => genre_atlas_oauth_callback_url( $provider ),
		'response_type' => 'code',
		'state'         => $state,
	);
	if ( 'google' === $provider ) {
		$args += array(
			'scope'                 => 'openid email profile',
			'nonce'                 => $nonce,
			'code_challenge'        => genre_atlas_b64url( hash( 'sha256', $verifier, true ) ),
			'code_challenge_method' => 'S256',
			'prompt'                => 'select_account',
		);
	} else {
		$args['scope'] = 'email,public_profile';
	}
	wp_redirect( $all[ $provider ]['authorize'] . '?' . http_build_query( $args, '', '&', PHP_QUERY_RFC3986 ) ); // phpcs:ignore WordPress.Security.SafeRedirect
	exit;
}

/** The provider's answer: the identity, or a WP_Error. */
function genre_atlas_oauth_identity( $provider, $id, $secret, $code, $saved ) {
	$all = genre_atlas_oauth_providers();
	$ua  = 'GenreAtlas/' . GENRE_ATLAS_VERSION . ' (+' . home_url( '/' ) . ')';
	if ( 'google' === $provider ) {
		$res  = wp_remote_post(
			$all['google']['token'],
			array(
				'timeout'    => 10,
				'user-agent' => $ua,
				'body'       => array(
					'code'          => $code,
					'client_id'     => $id,
					'client_secret' => $secret,
					'redirect_uri'  => genre_atlas_oauth_callback_url( 'google' ),
					'grant_type'    => 'authorization_code',
					'code_verifier' => $saved['verifier'],
				),
			)
		);
		$data = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
		$jwt  = is_array( $data ) && ! empty( $data['id_token'] ) ? explode( '.', $data['id_token'] ) : array();
		// Read straight from Google's token endpoint over TLS, the ID token
		// needs no signature check of its own; its claims still do.
		$c = 3 === count( $jwt ) ? json_decode( genre_atlas_b64url_decode( $jwt[1] ), true ) : null;
		if ( ! is_array( $c ) || empty( $c['sub'] ) || ( isset( $c['aud'] ) ? $c['aud'] : '' ) !== $id
			|| ! in_array( isset( $c['iss'] ) ? $c['iss'] : '', array( 'https://accounts.google.com', 'accounts.google.com' ), true )
			|| ( isset( $c['exp'] ) ? (int) $c['exp'] : 0 ) < time() || ( isset( $c['nonce'] ) ? $c['nonce'] : '' ) !== $saved['nonce'] ) {
			return new WP_Error( 'genre_atlas_oauth', 'google' );
		}
		return array(
			'id'       => (string) $c['sub'],
			'email'    => isset( $c['email'] ) ? (string) $c['email'] : '',
			'verified' => ! empty( $c['email_verified'] ),
			'name'     => isset( $c['name'] ) ? (string) $c['name'] : '',
		);
	}
	$res   = wp_remote_get(
		add_query_arg(
			array(
				'client_id'     => $id,
				'client_secret' => $secret,
				'redirect_uri'  => rawurlencode( genre_atlas_oauth_callback_url( 'facebook' ) ),
				'code'          => rawurlencode( $code ),
			),
			$all['facebook']['token']
		),
		array( 'timeout' => 10, 'user-agent' => $ua )
	);
	$data  = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	$token = is_array( $data ) && ! empty( $data['access_token'] ) ? (string) $data['access_token'] : '';
	if ( '' === $token ) {
		return new WP_Error( 'genre_atlas_oauth', 'facebook' );
	}
	$res = wp_remote_get(
		add_query_arg(
			array(
				'fields'          => 'id,name,email',
				'access_token'    => rawurlencode( $token ),
				'appsecret_proof' => hash_hmac( 'sha256', $token, $secret ),
			),
			'https://graph.facebook.com/' . genre_atlas_facebook_version() . '/me'
		),
		array( 'timeout' => 10, 'user-agent' => $ua )
	);
	$me  = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( ! is_array( $me ) || empty( $me['id'] ) ) {
		return new WP_Error( 'genre_atlas_oauth', 'facebook' );
	}
	return array(
		'id'       => (string) $me['id'],
		'email'    => isset( $me['email'] ) ? (string) $me['email'] : '',
		'verified' => false,
		'name'     => isset( $me['name'] ) ? (string) $me['name'] : '',
	);
}

function genre_atlas_oauth_user( $provider, $pid ) {
	$found = get_users( array( 'meta_key' => 'ga_' . $provider, 'meta_value' => $pid, 'number' => 1, 'fields' => 'ID' ) );
	return $found ? (int) $found[0] : 0;
}

function genre_atlas_oauth_back( $provider, $id, $secret ) {
	$state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	$code  = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	$saved = preg_match( '/^[A-Za-z0-9]{32}$/', $state ) ? get_transient( 'genre_atlas_oauth_' . $state ) : false;
	if ( $saved ) {
		delete_transient( 'genre_atlas_oauth_' . $state ); // a state works once
	}
	if ( ! is_array( $saved ) || $saved['provider'] !== $provider ) {
		genre_atlas_oauth_done( array( 'sso_error' => 'state' ) );
	}
	if ( '' === $code ) {
		genre_atlas_oauth_done( array( 'sso_error' => 'cancelled' ) ); // the visitor said no
	}
	$who = genre_atlas_oauth_identity( $provider, $id, $secret, $code, $saved );
	if ( is_wp_error( $who ) ) {
		genre_atlas_oauth_done( array( 'sso_error' => 'failed' ) );
	}
	$uid = genre_atlas_oauth_user( $provider, $who['id'] );
	if ( $saved['link'] ) {
		if ( $uid && $uid !== (int) $saved['link'] ) {
			genre_atlas_oauth_done( array( 'sso_error' => 'taken' ) );
		}
		update_user_meta( (int) $saved['link'], 'ga_' . $provider, $who['id'] );
		genre_atlas_oauth_done( array( 'linked' => $provider ) );
	}
	if ( ! $uid && $who['email'] && is_email( $who['email'] ) ) {
		$known = get_user_by( 'email', $who['email'] );
		if ( $known ) {
			if ( ! $who['verified'] || user_can( $known, 'edit_posts' ) ) {
				genre_atlas_oauth_done( array( 'sso_error' => 'exists' ) );
			}
			$uid = (int) $known->ID;
			update_user_meta( $uid, 'ga_' . $provider, $who['id'] );
			update_user_meta( $uid, 'ga_verified', '1' );
		}
	}
	if ( $uid ) {
		if ( user_can( $uid, 'edit_posts' ) ) {
			genre_atlas_oauth_done( array( 'sso_error' => 'staff' ) );
		}
		wp_set_auth_cookie( $uid, true, is_ssl() );
		genre_atlas_seen( $uid );
		genre_atlas_oauth_done( array( 'signed' => $provider ) );
	}
	// Someone new: the pseudo and the terms come first, on /my-atlas/.
	$token = wp_generate_password( 32, false );
	set_transient( 'genre_atlas_sso_' . $token, array( 'provider' => $provider ) + $who, 30 * MINUTE_IN_SECONDS );
	genre_atlas_oauth_done( array( 'sso' => $token ) );
}

add_action( 'rest_api_init', 'genre_atlas_oauth_rest' );
function genre_atlas_oauth_rest() {
	register_rest_route(
		'genre-atlas/v1',
		'/account/sso',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => 'genre_atlas_rest_sso',
		)
	);
	register_rest_route(
		'genre-atlas/v1',
		'/account/sso/(?P<token>[A-Za-z0-9]{32})',
		array(
			'methods'             => 'GET',
			'permission_callback' => '__return_true',
			'callback'            => 'genre_atlas_rest_sso_peek',
		)
	);
	register_rest_route(
		'genre-atlas/v1',
		'/oauth/facebook/delete',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => 'genre_atlas_rest_facebook_delete',
		)
	);
}

/** What the pseudo form shows: the provider and a suggested pseudo. */
function genre_atlas_rest_sso_peek( $request ) {
	$who = get_transient( 'genre_atlas_sso_' . $request['token'] );
	if ( ! is_array( $who ) ) {
		return genre_atlas_err( 'sso', 'This sign-in has expired. Start again.', 404 );
	}
	$base = substr( preg_replace( '/[^a-z0-9_-]+/', '', strtolower( remove_accents( str_replace( ' ', '-', $who['name'] ) ) ) ), 0, 20 );
	return rest_ensure_response( array( 'provider' => $who['provider'], 'suggest' => strlen( $base ) >= 3 && ! genre_atlas_pseudo_error( $base ) ? $base : '' ) );
}

function genre_atlas_rest_sso( $request ) {
	$token = (string) $request['token'];
	$who   = preg_match( '/^[A-Za-z0-9]{32}$/', $token ) ? get_transient( 'genre_atlas_sso_' . $token ) : false;
	if ( ! is_array( $who ) ) {
		return genre_atlas_err( 'sso', 'This sign-in has expired. Start again.', 404 );
	}
	if ( empty( $request['terms'] ) ) {
		return genre_atlas_err( 'terms', 'To create an account, accept the terms of use and confirm you are 15 or older.' );
	}
	$pseudo = strtolower( trim( (string) $request['pseudo'] ) );
	$bad    = genre_atlas_pseudo_error( $pseudo );
	if ( $bad ) {
		return genre_atlas_err( 'pseudo', $bad );
	}
	if ( genre_atlas_oauth_user( $who['provider'], $who['id'] ) ) {
		return genre_atlas_err( 'sso', 'This account already exists. Sign in again.' );
	}
	$email = is_email( $who['email'] ) && ! email_exists( $who['email'] ) ? $who['email'] : '';
	$uid   = wp_insert_user(
		array(
			'user_login'   => $pseudo,
			'user_email'   => $email,
			'user_pass'    => wp_generate_password( 32, true, true ), // never shown: the provider signs in
			'display_name' => $pseudo,
			'nickname'     => $pseudo,
			'role'         => 'subscriber',
		)
	);
	if ( is_wp_error( $uid ) ) {
		return genre_atlas_err( 'create', 'The account could not be created. Try another pseudo.' );
	}
	delete_transient( 'genre_atlas_sso_' . $token );
	update_user_meta( $uid, 'ga_' . $who['provider'], $who['id'] );
	update_user_meta( $uid, 'ga_verified', '1' );
	update_user_meta( $uid, 'ga_password', '0' );
	update_user_meta( $uid, 'ga_terms', gmdate( 'c' ) );
	update_user_meta( $uid, 'show_admin_bar_front', 'false' );
	return rest_ensure_response( genre_atlas_sign_in( $uid ) );
}

/**
 * Meta's data deletion callback: someone removed the app from their Facebook
 * account. The Facebook link goes; an account that only Facebook could open
 * goes entirely.
 */
function genre_atlas_rest_facebook_delete( $request ) {
	list( , $secret ) = genre_atlas_oauth_keys( 'facebook' );
	$parts = explode( '.', (string) $request['signed_request'], 2 );
	if ( '' === $secret || 2 !== count( $parts ) || ! hash_equals( genre_atlas_b64url( hash_hmac( 'sha256', $parts[1], $secret, true ) ), $parts[0] ) ) {
		return genre_atlas_err( 'signed', 'Bad signature.', 403 );
	}
	$data = json_decode( genre_atlas_b64url_decode( $parts[1] ), true );
	$fbid = is_array( $data ) && ! empty( $data['user_id'] ) ? (string) $data['user_id'] : '';
	$uid  = $fbid ? genre_atlas_oauth_user( 'facebook', $fbid ) : 0;
	$code = wp_generate_password( 12, false );
	if ( $uid && ! user_can( $uid, 'edit_posts' ) ) {
		if ( genre_atlas_has_password( $uid ) || get_user_meta( $uid, 'ga_google', true ) ) {
			delete_user_meta( $uid, 'ga_facebook' );
		} else {
			genre_atlas_delete_member( $uid );
		}
	}
	set_transient( 'genre_atlas_deletion_' . $code, 1, 90 * DAY_IN_SECONDS );
	return rest_ensure_response( array( 'url' => add_query_arg( 'deletion', $code, home_url( '/my-atlas/' ) ), 'confirmation_code' => $code ) );
}

/** Whether a deletion code from Meta's callback is known (for /my-atlas/?deletion=). */
function genre_atlas_deletion_known( $code ) {
	return preg_match( '/^[A-Za-z0-9]{12}$/', $code ) && get_transient( 'genre_atlas_deletion_' . $code );
}
