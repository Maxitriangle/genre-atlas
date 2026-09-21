<?php
/**
 * CSV importer. Expected columns (header row, any order):
 * wikidata_id, musicbrainz_id, name, parent_wikidata_id, epoch_year, origin,
 * bpm_min, bpm_max, parent_choice, wikidata_parents_raw
 *
 * Genres are matched on wikidata_id, so the same file can be imported again
 * safely: existing genres are updated, never duplicated. Fields already
 * reviewed by hand (status "reviewed") are left untouched.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Genre_Atlas_Importer {

	const SMALL_WORDS = array( 'and', 'of', 'the', 'n', 'de', 'du', 'la', 'in' );

	public static function nice_title( $label ) {
		$words = preg_split( '/(\s+)/u', trim( $label ), -1, PREG_SPLIT_DELIM_CAPTURE );
		foreach ( $words as $i => $w ) {
			// Only touch fully lower-case words: "UK garage" keeps "UK", "HexD" stays as is.
			if ( $w === mb_strtolower( $w ) && ( 0 === $i || ! in_array( $w, self::SMALL_WORDS, true ) ) ) {
				$words[ $i ] = mb_strtoupper( mb_substr( $w, 0, 1 ) ) . mb_substr( $w, 1 );
			}
		}
		return implode( '', $words );
	}

	/**
	 * @param string $file Path to the CSV.
	 * @return array|WP_Error Stats.
	 */
	public static function import( $file ) {
		global $wpdb;
		if ( ! is_readable( $file ) ) {
			return new WP_Error( 'genre_atlas_file', 'The file cannot be read.' );
		}
		$handle = fopen( $file, 'r' );
		$header = fgetcsv( $handle, 0, ',', '"', '\\' );
		if ( ! $header ) {
			return new WP_Error( 'genre_atlas_header', 'The file is empty.' );
		}
		$header[0] = preg_replace( '/^\xEF\xBB\xBF/', '', $header[0] );
		$header    = array_map( 'trim', $header );
		foreach ( array( 'wikidata_id', 'name', 'parent_wikidata_id' ) as $required ) {
			if ( ! in_array( $required, $header, true ) ) {
				return new WP_Error( 'genre_atlas_columns', 'Missing column: ' . $required );
			}
		}
		$rows = array();
		while ( ( $line = fgetcsv( $handle, 0, ',', '"', '\\' ) ) !== false ) {
			if ( count( $line ) !== count( $header ) ) {
				continue;
			}
			$row = array_combine( $header, $line );
			if ( '' !== trim( $row['wikidata_id'] ) && '' !== trim( $row['name'] ) ) {
				$rows[] = array_map( 'trim', $row );
			}
		}
		fclose( $handle );

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 0 ); // phpcs:ignore
		}
		wp_defer_term_counting( true );
		wp_suspend_cache_invalidation( true );

		// Existing genres, keyed by Wikidata ID.
		$existing = array();
		$found    = $wpdb->get_results( "SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = 'ga_wikidata_id'" );
		foreach ( $found as $f ) {
			if ( 'genre' === get_post_type( (int) $f->post_id ) ) {
				$existing[ $f->meta_value ] = (int) $f->post_id;
			}
		}

		$stats = array( 'rows' => count( $rows ), 'created' => 0, 'updated' => 0, 'skipped_reviewed' => 0, 'parents_set' => 0, 'parents_missing' => 0 );
		$ids   = $existing;

		// Pass 1: create / update the genres.
		foreach ( $rows as $row ) {
			$qid  = $row['wikidata_id'];
			$meta = array(
				'ga_wikidata_id'          => $qid,
				'ga_musicbrainz_id'       => isset( $row['musicbrainz_id'] ) ? $row['musicbrainz_id'] : '',
				'ga_epoch_year'           => isset( $row['epoch_year'] ) && '' !== $row['epoch_year'] ? (int) $row['epoch_year'] : '',
				'ga_origin'               => isset( $row['origin'] ) ? $row['origin'] : '',
				'ga_bpm_min'              => isset( $row['bpm_min'] ) && '' !== $row['bpm_min'] ? (int) $row['bpm_min'] : '',
				'ga_bpm_max'              => isset( $row['bpm_max'] ) && '' !== $row['bpm_max'] ? (int) $row['bpm_max'] : '',
				'ga_parent_choice'        => isset( $row['parent_choice'] ) ? $row['parent_choice'] : '',
				'ga_wikidata_parents_raw' => isset( $row['wikidata_parents_raw'] ) ? $row['wikidata_parents_raw'] : '',
			);
			if ( isset( $ids[ $qid ] ) ) {
				$post_id = $ids[ $qid ];
				if ( 'reviewed' === get_post_meta( $post_id, 'ga_status', true ) ) {
					$stats['skipped_reviewed']++;
					continue;
				}
				foreach ( $meta as $k => $v ) {
					// Never erase a value typed by hand with an empty imported one.
					if ( '' !== $v ) {
						update_post_meta( $post_id, $k, $v );
					}
				}
				$stats['updated']++;
			} else {
				$meta['ga_status'] = 'imported';
				$meta              = array_filter(
					$meta,
					function ( $v ) {
						return '' !== $v;
					}
				);
				$post_id           = wp_insert_post(
					array(
						'post_type'   => 'genre',
						'post_status' => 'publish',
						'post_title'  => self::nice_title( $row['name'] ),
						'meta_input'  => $meta,
					),
					true
				);
				if ( is_wp_error( $post_id ) ) {
					continue;
				}
				$ids[ $qid ] = (int) $post_id;
				$stats['created']++;
				if ( '' === $row['parent_wikidata_id'] && 'electronic music' === strtolower( $row['name'] ) ) {
					update_post_meta( $post_id, 'ga_family_shape', 'circle' );
					update_post_meta( $post_id, 'ga_family_hue', 295 );
				}
			}
		}

		// Pass 2: set the single parent of each genre.
		foreach ( $rows as $row ) {
			$qid = $row['wikidata_id'];
			$pid = $row['parent_wikidata_id'];
			if ( ! isset( $ids[ $qid ] ) || '' === $pid ) {
				continue;
			}
			if ( 'reviewed' === get_post_meta( $ids[ $qid ], 'ga_status', true ) ) {
				continue;
			}
			if ( ! isset( $ids[ $pid ] ) ) {
				$stats['parents_missing']++;
				continue;
			}
			if ( (int) get_post_field( 'post_parent', $ids[ $qid ] ) !== $ids[ $pid ] ) {
				$wpdb->update( $wpdb->posts, array( 'post_parent' => $ids[ $pid ] ), array( 'ID' => $ids[ $qid ] ) );
				clean_post_cache( $ids[ $qid ] );
				$stats['parents_set']++;
			}
		}

		wp_suspend_cache_invalidation( false );
		wp_defer_term_counting( false );
		wp_cache_flush();
		genre_atlas_flush_cache();
		flush_rewrite_rules( false );
		return $stats;
	}
}
