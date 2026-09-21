<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
/**
 * wp genre-atlas import <file.csv>
 */
WP_CLI::add_command(
	'genre-atlas import',
	function ( $args ) {
		$stats = Genre_Atlas_Importer::import( $args[0] );
		if ( is_wp_error( $stats ) ) {
			WP_CLI::error( $stats->get_error_message() );
		}
		foreach ( $stats as $k => $v ) {
			WP_CLI::log( str_pad( $k, 18 ) . $v );
		}
		WP_CLI::success( 'Import finished.' );
	}
);
