<?php
/**
 * Self-update from GitHub releases.
 * A release tagged vX.Y.Z carrying an asset named genre-atlas.zip is offered
 * in Plugins like any other update.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GENRE_ATLAS_REPO', 'Maxitriangle/genre-atlas' );
define( 'GENRE_ATLAS_BASENAME', plugin_basename( GENRE_ATLAS_DIR . 'genre-atlas.php' ) );

function genre_atlas_latest_release( $force = false ) {
	$cached = get_transient( 'genre_atlas_release' );
	if ( ! $force && is_array( $cached ) ) {
		return $cached;
	}
	$release  = array();
	$response = wp_remote_get(
		'https://api.github.com/repos/' . GENRE_ATLAS_REPO . '/releases/latest',
		array(
			'timeout' => 10,
			'headers' => array( 'Accept' => 'application/vnd.github+json', 'User-Agent' => 'genre-atlas-updater' ),
		)
	);
	if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( is_array( $data ) && ! empty( $data['tag_name'] ) && ! empty( $data['assets'] ) ) {
			foreach ( $data['assets'] as $asset ) {
				if ( 'genre-atlas.zip' === $asset['name'] ) {
					$release = array(
						'version' => ltrim( $data['tag_name'], 'vV' ),
						'package' => $asset['browser_download_url'],
						'url'     => $data['html_url'],
						'notes'   => isset( $data['body'] ) ? (string) $data['body'] : '',
						'date'    => isset( $data['published_at'] ) ? $data['published_at'] : '',
					);
					break;
				}
			}
		}
	}
	// Cache failures too (shorter), so a GitHub outage never slows the dashboard down.
	set_transient( 'genre_atlas_release', $release, $release ? 6 * HOUR_IN_SECONDS : HOUR_IN_SECONDS );
	return $release;
}

add_filter( 'pre_set_site_transient_update_plugins', 'genre_atlas_check_update' );
function genre_atlas_check_update( $transient ) {
	if ( ! is_object( $transient ) ) {
		return $transient;
	}
	$release = genre_atlas_latest_release();
	$item    = (object) array(
		'id'          => 'github.com/' . GENRE_ATLAS_REPO,
		'slug'        => 'genre-atlas',
		'plugin'      => GENRE_ATLAS_BASENAME,
		'new_version' => $release ? $release['version'] : GENRE_ATLAS_VERSION,
		'url'         => 'https://github.com/' . GENRE_ATLAS_REPO,
		'package'     => $release ? $release['package'] : '',
	);
	if ( $release && version_compare( $release['version'], GENRE_ATLAS_VERSION, '>' ) ) {
		$transient->response[ GENRE_ATLAS_BASENAME ] = $item;
		unset( $transient->no_update[ GENRE_ATLAS_BASENAME ] );
	} else {
		// Listing it under no_update is what lets "Enable auto-updates" appear.
		$transient->no_update[ GENRE_ATLAS_BASENAME ] = $item;
		unset( $transient->response[ GENRE_ATLAS_BASENAME ] );
	}
	return $transient;
}

// "View details" window.
add_filter( 'plugins_api', 'genre_atlas_plugin_info', 20, 3 );
function genre_atlas_plugin_info( $result, $action, $args ) {
	if ( 'plugin_information' !== $action || empty( $args->slug ) || 'genre-atlas' !== $args->slug ) {
		return $result;
	}
	$release = genre_atlas_latest_release();
	return (object) array(
		'name'          => 'Genre Atlas',
		'slug'          => 'genre-atlas',
		'version'       => $release ? $release['version'] : GENRE_ATLAS_VERSION,
		'author'        => 'Maxime',
		'homepage'      => 'https://github.com/' . GENRE_ATLAS_REPO,
		'last_updated'  => $release ? $release['date'] : '',
		'download_link' => $release ? $release['package'] : '',
		'sections'      => array(
			'changelog' => $release && $release['notes'] ? wpautop( esc_html( $release['notes'] ) ) : 'See the releases on GitHub.',
		),
	);
}

// Forget the cached release after an update, and when "Check again" is clicked.
add_action( 'upgrader_process_complete', function () {
	delete_transient( 'genre_atlas_release' );
} );
// Priority 1 matters: core hooks wp_update_plugins() on this same action at 10
// and registers it first, so anything later than that reads the stale cache and
// "Check again" only takes effect on the following visit.
add_action( 'load-update-core.php', function () {
	if ( isset( $_GET['force-check'] ) ) { // phpcs:ignore
		delete_transient( 'genre_atlas_release' );
	}
}, 1 );
