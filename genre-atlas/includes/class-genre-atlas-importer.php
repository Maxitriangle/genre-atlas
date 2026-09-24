<?php
/**
 * CSV importer. Expected columns (header row, any order):
 * wikidata_id, musicbrainz_id, name, parent_wikidata_id, epoch_year, origin,
 * bpm_min, bpm_max, parent_choice, wikidata_parents_raw, featured,
 * family_shape, family_hue, group, wikipedia_title, description
 *
 * Genres are matched on wikidata_id, so the same file can be imported again
 * safely: existing genres are updated, never duplicated. Fields already
 * reviewed by hand (status "reviewed") are left untouched. The description
 * (the lead of the Wikipedia article) only fills a genre that has no text:
 * a text written or edited in WordPress is never replaced.
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
		// The artist file goes through the same screen.
		if ( in_array( 'genres', $header, true ) && ! in_array( 'parent_wikidata_id', $header, true ) ) {
			fclose( $handle );
			return self::import_artists( $file );
		}
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

		$stats = array( 'rows' => count( $rows ), 'created' => 0, 'updated' => 0, 'skipped_reviewed' => 0, 'parents_set' => 0, 'parents_missing' => 0, 'texts' => 0 );
		$ids   = $existing;

		// Pass 1: create / update the genres.
		foreach ( $rows as $row ) {
			$qid  = $row['wikidata_id'];
			$meta = array(
				'ga_wikidata_id'          => $qid,
				'ga_musicbrainz_id'       => isset( $row['musicbrainz_id'] ) ? $row['musicbrainz_id'] : '',
				'ga_epoch_year'           => isset( $row['epoch_year'] ) && '' !== $row['epoch_year'] ? (int) $row['epoch_year'] : '',
				'ga_origin'               => isset( $row['origin'] ) ? $row['origin'] : '',
				// Editorial group for the branches too wide to read one genre at a
				// time. Empty leaves the genre on its decade fallback.
				'ga_group'                => isset( $row['group'] ) ? $row['group'] : '',
				'ga_bpm_min'              => isset( $row['bpm_min'] ) && '' !== $row['bpm_min'] ? (int) $row['bpm_min'] : '',
				'ga_bpm_max'              => isset( $row['bpm_max'] ) && '' !== $row['bpm_max'] ? (int) $row['bpm_max'] : '',
				'ga_parent_choice'        => isset( $row['parent_choice'] ) ? $row['parent_choice'] : '',
				'ga_wikidata_parents_raw' => isset( $row['wikidata_parents_raw'] ) ? $row['wikidata_parents_raw'] : '',
				// A tile on the home page, and the shape and colour that go with it.
				// Set on families and on the territories that are not roots.
				'ga_featured'             => isset( $row['featured'] ) && '' !== $row['featured'] ? (int) $row['featured'] : '',
				'ga_family_shape'         => isset( $row['family_shape'] ) ? $row['family_shape'] : '',
				'ga_family_hue'           => isset( $row['family_hue'] ) && '' !== $row['family_hue'] ? (int) $row['family_hue'] : '',
				'ga_wikipedia'            => isset( $row['wikipedia_title'] ) ? $row['wikipedia_title'] : '',
			);
			$lead = isset( $row['description'] ) ? $row['description'] : '';
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
				if ( '' !== $lead && '' === trim( get_post_field( 'post_content', $post_id ) ) ) {
					$wpdb->update( $wpdb->posts, array( 'post_content' => $lead ), array( 'ID' => $post_id ) );
					clean_post_cache( $post_id );
					// The dossier credits Wikipedia while this mark is there.
					update_post_meta( $post_id, 'ga_text_source', 'wikipedia' );
					$stats['texts']++;
				}
				$stats['updated']++;
			} else {
				$meta['ga_status'] = 'imported';
				if ( '' !== $lead ) {
					$meta['ga_text_source'] = 'wikipedia';
					$stats['texts']++;
				}
				$meta              = array_filter(
					$meta,
					function ( $v ) {
						return '' !== $v;
					}
				);
				$post_id           = wp_insert_post(
					array(
						'post_type'    => 'genre',
						'post_status'  => 'publish',
						'post_title'   => self::nice_title( $row['name'] ),
						// wp_insert_post() unslashes what it is given.
						'post_content' => wp_slash( $lead ),
						'meta_input'   => $meta,
					),
					true
				);
				if ( is_wp_error( $post_id ) ) {
					continue;
				}
				$ids[ $qid ] = (int) $post_id;
				$stats['created']++;
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
	/**
	 * Artist file (data/artist-import.csv): wikidata_id, name, kind, start,
	 * country, genres ("|"-separated Wikidata IDs of genres), photo_file,
	 * photo_author, photo_license, photo_license_url. Import it after the
	 * genres. Artists are matched on wikidata_id; an artist saved by hand
	 * keeps its fields, and a genre whose "Key artists" list was edited by
	 * hand keeps its list.
	 *
	 * @param string $file Path to the CSV.
	 * @return array|WP_Error Stats.
	 */
	public static function import_artists( $file ) {
		global $wpdb;
		$handle    = fopen( $file, 'r' );
		$header    = array_map( 'trim', fgetcsv( $handle, 0, ',', '"', '\\' ) );
		$header[0] = preg_replace( '/^\xEF\xBB\xBF/', '', $header[0] );
		foreach ( array( 'wikidata_id', 'name', 'genres' ) as $required ) {
			if ( ! in_array( $required, $header, true ) ) {
				fclose( $handle );
				return new WP_Error( 'genre_atlas_columns', 'Missing column: ' . $required );
			}
		}
		$rows = array();
		while ( ( $line = fgetcsv( $handle, 0, ',', '"', '\\' ) ) !== false ) {
			if ( count( $line ) === count( $header ) ) {
				$row = array_map( 'trim', array_combine( $header, $line ) );
				if ( '' !== $row['wikidata_id'] && '' !== $row['name'] ) {
					$rows[] = $row;
				}
			}
		}
		fclose( $handle );

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 0 ); // phpcs:ignore
		}
		wp_suspend_cache_invalidation( true );

		// Genres and artists already there, keyed by Wikidata ID.
		$genres  = array();
		$artists = array();
		$found   = $wpdb->get_results( "SELECT m.post_id, m.meta_value, p.post_type FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE m.meta_key = 'ga_wikidata_id' AND p.post_type IN ( 'genre', 'ga_artist' )" );
		foreach ( $found as $f ) {
			if ( 'genre' === $f->post_type ) {
				$genres[ $f->meta_value ] = (int) $f->post_id;
			} else {
				$artists[ $f->meta_value ] = (int) $f->post_id;
			}
		}

		$stats = array( 'artists' => count( $rows ), 'created' => 0, 'updated' => 0, 'kept' => 0, 'genres' => 0, 'genres_kept' => 0, 'genres_missing' => 0 );
		$lists = array();
		foreach ( $rows as $row ) {
			$qid  = $row['wikidata_id'];
			$meta = array( 'ga_wikidata_id' => $qid );
			foreach ( array( 'kind', 'start', 'country', 'photo_file', 'photo_author', 'photo_license', 'photo_license_url' ) as $k ) {
				$meta[ 'ga_' . $k ] = isset( $row[ $k ] ) ? $row[ $k ] : '';
			}
			if ( isset( $artists[ $qid ] ) ) {
				$id = $artists[ $qid ];
				if ( 'reviewed' === get_post_meta( $id, 'ga_status', true ) ) {
					$stats['kept']++;
				} else {
					$wpdb->update( $wpdb->posts, array( 'post_title' => $row['name'] ), array( 'ID' => $id ) );
					foreach ( $meta as $k => $v ) {
						if ( '' === $v ) {
							delete_post_meta( $id, $k );
						} else {
							update_post_meta( $id, $k, $v );
						}
					}
					clean_post_cache( $id );
					$stats['updated']++;
				}
			} else {
				$meta['ga_status'] = 'imported';
				$id                = wp_insert_post(
					array(
						'post_type'   => 'ga_artist',
						'post_status' => 'publish',
						'post_title'  => wp_slash( $row['name'] ),
						'meta_input'  => array_filter(
							$meta,
							function ( $v ) {
								return '' !== $v;
							}
						),
					),
					true
				);
				if ( is_wp_error( $id ) ) {
					continue;
				}
				$artists[ $qid ] = (int) $id;
				$stats['created']++;
			}
			foreach ( explode( '|', $row['genres'] ) as $g ) {
				$g = trim( $g );
				if ( '' !== $g ) {
					$lists[ $g ][] = $artists[ $qid ];
				}
			}
		}

		// The artists of each genre, unless the list was edited by hand.
		foreach ( $lists as $g => $ids ) {
			if ( ! isset( $genres[ $g ] ) ) {
				$stats['genres_missing']++;
				continue;
			}
			if ( get_post_meta( $genres[ $g ], 'ga_artists_edited', true ) ) {
				$stats['genres_kept']++;
				continue;
			}
			update_post_meta( $genres[ $g ], 'ga_artists', implode( ',', array_slice( array_unique( $ids ), 0, GENRE_ATLAS_MAX_ARTISTS ) ) );
			$stats['genres']++;
		}

		wp_suspend_cache_invalidation( false );
		wp_cache_flush();
		return $stats;
	}
}
