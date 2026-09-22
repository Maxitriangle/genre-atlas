<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* ---- Fields box on the genre edit screen -------------------------------- */

add_action( 'add_meta_boxes_genre', 'genre_atlas_add_box' );
function genre_atlas_add_box() {
	add_meta_box( 'genre-atlas-fields', 'Genre data', 'genre_atlas_render_box', 'genre', 'normal', 'high' );
}

function genre_atlas_render_box( $post ) {
	wp_nonce_field( 'genre_atlas_save', 'genre_atlas_nonce' );
	$readonly = array( 'ga_parent_choice', 'ga_wikidata_parents_raw' );
	echo '<table class="form-table" role="presentation"><tbody>';
	foreach ( genre_atlas_meta_fields() as $key => $def ) {
		$value = get_post_meta( $post->ID, $key, true );
		echo '<tr><th scope="row"><label for="' . esc_attr( $key ) . '">' . esc_html( $def['label'] ) . '</label></th><td>';
		if ( 'ga_status' === $key ) {
			echo '<select id="ga_status" name="ga_status">';
			foreach ( array( 'imported' => 'Imported (not checked)', 'reviewed' => 'Reviewed (protected from re-import)' ) as $v => $l ) {
				echo '<option value="' . esc_attr( $v ) . '"' . selected( $value, $v, false ) . '>' . esc_html( $l ) . '</option>';
			}
			echo '</select>';
		} elseif ( 'ga_family_shape' === $key ) {
			echo '<select id="ga_family_shape" name="ga_family_shape"><option value="">— automatic —</option>';
			foreach ( genre_atlas_shapes() as $shape ) {
				echo '<option value="' . esc_attr( $shape ) . '"' . selected( $value, $shape, false ) . '>' . esc_html( $shape ) . '</option>';
			}
			echo '</select>';
		} elseif ( in_array( $key, $readonly, true ) ) {
			echo '<code>' . esc_html( $value ? $value : '—' ) . '</code>';
		} else {
			$type = 'integer' === $def['type'] ? 'number' : 'text';
			echo '<input class="regular-text" type="' . esc_attr( $type ) . '" id="' . esc_attr( $key ) . '" name="' . esc_attr( $key ) . '" value="' . esc_attr( $value ) . '">';
		}
		echo '</td></tr>';
	}
	echo '</tbody></table><p class="description">The parent genre is set in the "Page attributes" box. One parent only.</p>';
}

add_action( 'save_post_genre', 'genre_atlas_save_box' );
function genre_atlas_save_box( $post_id ) {
	if ( ! isset( $_POST['genre_atlas_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['genre_atlas_nonce'] ), 'genre_atlas_save' ) ) {
		return;
	}
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	$readonly = array( 'ga_parent_choice', 'ga_wikidata_parents_raw' );
	foreach ( genre_atlas_meta_fields() as $key => $def ) {
		if ( in_array( $key, $readonly, true ) || ! isset( $_POST[ $key ] ) ) {
			continue;
		}
		$value = sanitize_text_field( wp_unslash( $_POST[ $key ] ) );
		if ( '' === $value ) {
			delete_post_meta( $post_id, $key );
		} else {
			update_post_meta( $post_id, $key, 'integer' === $def['type'] ? (int) $value : $value );
		}
	}
}

/* ---- List table columns -------------------------------------------------- */

add_filter( 'manage_genre_posts_columns', 'genre_atlas_columns' );
function genre_atlas_columns( $columns ) {
	$date = isset( $columns['date'] ) ? $columns['date'] : null;
	unset( $columns['date'] );
	$columns['ga_parent']   = 'Parent';
	$columns['ga_children'] = 'Subgenres';
	$columns['ga_epoch']    = 'Epoch';
	$columns['ga_bpm']      = 'BPM';
	$columns['ga_status']   = 'Status';
	if ( $date ) {
		$columns['date'] = $date;
	}
	return $columns;
}

add_action( 'manage_genre_posts_custom_column', 'genre_atlas_column', 10, 2 );
function genre_atlas_column( $column, $post_id ) {
	global $wpdb;
	switch ( $column ) {
		case 'ga_parent':
			$parent = wp_get_post_parent_id( $post_id );
			echo $parent ? esc_html( get_the_title( $parent ) ) : '<strong>Family</strong>';
			break;
		case 'ga_children':
			$n = count( genre_atlas_ring_children( $post_id ) );
			if ( $n > 8 ) {
				$groups = genre_atlas_group_count( $post_id );
				$link   = '<a href="' . esc_url( admin_url( 'edit.php?post_type=genre&page=genre-atlas-groups&branch=' . $post_id ) ) . '">';
				// No group count means at least one child has none, and the map
				// cuts the whole branch alphabetically instead.
				echo (int) $n . ' → ' . $link . ( $groups ? (int) $groups . ' groups' : 'no group yet' ) . '</a>';
			} else {
				echo $n ? (int) $n : '—';
			}
			break;
		case 'ga_epoch':
			echo esc_html( get_post_meta( $post_id, 'ga_epoch_year', true ) ?: '—' );
			break;
		case 'ga_bpm':
			$a = get_post_meta( $post_id, 'ga_bpm_min', true );
			$b = get_post_meta( $post_id, 'ga_bpm_max', true );
			echo ( $a || $b ) ? esc_html( trim( $a . '–' . $b, '–' ) ) : '—';
			break;
		case 'ga_status':
			echo esc_html( get_post_meta( $post_id, 'ga_status', true ) ?: '—' );
			break;
	}
}

/* ---- Import screen: Genres → Import CSV --------------------------------- */

add_action( 'admin_menu', 'genre_atlas_import_menu' );
function genre_atlas_import_menu() {
	add_submenu_page( 'edit.php?post_type=genre', 'Import genres', 'Import CSV', 'manage_options', 'genre-atlas-import', 'genre_atlas_import_page' );
}

function genre_atlas_import_page() {
	echo '<div class="wrap"><h1>Import genres</h1>';
	if ( isset( $_POST['genre_atlas_import_nonce'] ) && wp_verify_nonce( sanitize_key( $_POST['genre_atlas_import_nonce'] ), 'genre_atlas_import' ) && current_user_can( 'manage_options' ) ) {
		if ( empty( $_FILES['genre_csv']['tmp_name'] ) || ! is_uploaded_file( $_FILES['genre_csv']['tmp_name'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-error"><p>No file received.</p></div>';
		} else {
			$stats = Genre_Atlas_Importer::import( $_FILES['genre_csv']['tmp_name'] ); // phpcs:ignore
			if ( is_wp_error( $stats ) ) {
				echo '<div class="notice notice-error"><p>' . esc_html( $stats->get_error_message() ) . '</p></div>';
			} else {
				echo '<div class="notice notice-success"><p>Import finished — ' . (int) $stats['created'] . ' created, ' . (int) $stats['updated'] . ' updated, ' . (int) $stats['skipped_reviewed'] . ' protected (reviewed), ' . (int) $stats['parents_set'] . ' parents set, ' . (int) $stats['parents_missing'] . ' parents not found.</p></div>';
			}
		}
	}
	echo '<p>Upload a CSV produced by the Wikidata script. Genres are matched on their Wikidata ID: importing the same file twice never creates duplicates, and genres marked <em>Reviewed</em> are left untouched.</p>';
	echo '<form method="post" enctype="multipart/form-data">';
	wp_nonce_field( 'genre_atlas_import', 'genre_atlas_import_nonce' );
	echo '<input type="file" name="genre_csv" accept=".csv" required> ';
	submit_button( 'Import', 'primary', 'submit', false );
	echo '</form></div>';
}

/* ---- Settings: Genres → Settings ---------------------------------------- */

add_action( 'admin_menu', 'genre_atlas_settings_menu' );
function genre_atlas_settings_menu() {
	add_submenu_page( 'edit.php?post_type=genre', 'Genre Atlas settings', 'Settings', 'manage_options', 'genre-atlas-settings', 'genre_atlas_settings_page' );
}

function genre_atlas_settings_page() {
	if ( isset( $_POST['genre_atlas_settings_nonce'] ) && wp_verify_nonce( sanitize_key( $_POST['genre_atlas_settings_nonce'] ), 'genre_atlas_settings' ) && current_user_can( 'manage_options' ) ) {
		update_option( 'genre_atlas_home', empty( $_POST['genre_atlas_home'] ) ? '0' : '1' );
		update_option( 'genre_atlas_groups', empty( $_POST['genre_atlas_groups'] ) ? '0' : '1' );
		delete_transient( GENRE_ATLAS_CACHE ); // the tree carries the group labels.
		echo '<div class="notice notice-success"><p>Settings saved.</p></div>';
	}
	$on     = get_option( 'genre_atlas_home', '1' );
	$groups = get_option( 'genre_atlas_groups', '1' );
	echo '<div class="wrap"><h1>Genre Atlas settings</h1><form method="post">';
	wp_nonce_field( 'genre_atlas_settings', 'genre_atlas_settings_nonce' );
	echo '<p><label><input type="checkbox" name="genre_atlas_home" value="1"' . checked( $on, '1', false ) . '> Show the atlas on the home page of the site</label></p>';
	echo '<p class="description">When ticked, the home page of the site is the atlas index, whatever the theme. The atlas is always available at <code>' . esc_html( get_post_type_archive_link( 'genre' ) ) . '</code>.</p>';
	echo '<p><label><input type="checkbox" name="genre_atlas_groups" value="1"' . checked( $groups, '1', false ) . '> Use the editorial group names on wide branches</label></p>';
	echo '<p class="description">A branch with more than 8 subgenres is shown as groups rather than genre by genre. Ticked, the groups are the ones named in Genres &rarr; Groups. Unticked, the atlas ignores them and cuts those branches into alphabetical ranges instead. Nothing is lost either way: the names stay stored.</p>';
	submit_button( 'Save' );
	echo '</form></div>';
}

/* ---- Wide branches: Genres → Groups -------------------------------------
 * Past 8 subgenres the map cannot show a branch one genre at a time, so it
 * shows editorial groups instead. A group is a path — "EUROPE > IBERIA" — cut
 * one segment at a time; this screen is where those labels are edited.
 * ---------------------------------------------------------------------- */

add_action( 'admin_menu', 'genre_atlas_groups_menu' );
function genre_atlas_groups_menu() {
	add_submenu_page( 'edit.php?post_type=genre', 'Group wide branches', 'Groups', 'manage_options', 'genre-atlas-groups', 'genre_atlas_groups_page' );
}

/**
 * Genres with more subgenres than the map can show one by one.
 *
 * @return array Post ID => number of children.
 */
/**
 * SQL fragment: a genre that stays on its parent's ring. A tile leaves it, so
 * Metal and Punk are not counted among Rock's children and need no group.
 */
function genre_atlas_on_ring_sql( $alias ) {
	global $wpdb;
	return "$alias.post_type = 'genre' AND $alias.post_status = 'publish'
		AND NOT EXISTS ( SELECT 1 FROM {$wpdb->postmeta} ga
		                  WHERE ga.post_id = $alias.ID AND ga.meta_key = 'ga_featured'
		                    AND TRIM( ga.meta_value ) <> '' )";
}

function genre_atlas_wide_branches() {
	global $wpdb;
	$on_ring = genre_atlas_on_ring_sql( 'p' );
	$rows = $wpdb->get_results(
		"SELECT p.post_parent AS id, COUNT(*) AS n FROM {$wpdb->posts} p
		 WHERE $on_ring AND p.post_parent > 0
		 GROUP BY p.post_parent HAVING n > 8 ORDER BY n DESC"
	);
	$wide = array();
	foreach ( $rows as $row ) {
		$wide[ (int) $row->id ] = (int) $row->n;
	}
	return $wide;
}

/**
 * How many groups the atlas draws for a branch. A group is a path
 * ("EUROPE > IBERIA") cut one segment at a time, so what the ring shows is the
 * number of distinct first segments. A genre with no group at all is counted
 * apart: the map falls back on alphabetical ranges for the whole branch.
 */
function genre_atlas_group_count( $parent_id ) {
	$children = genre_atlas_ring_children( $parent_id );
	$labels   = array();
	foreach ( $children as $child_id ) {
		$label = trim( (string) get_post_meta( $child_id, 'ga_group', true ) );
		if ( '' === $label ) {
			return 0; // one genre without a group and the whole branch goes alphabetical.
		}
		$first = explode( '>', $label );
		$labels[ mb_strtoupper( trim( $first[0] ) ) ] = true;
	}
	return count( $labels );
}

/**
 * Genres sitting under a branch too wide to show one by one, with no group of
 * their own. The map has nothing to cut them on and falls back on alphabetical
 * ranges, which is what a stale import file looks like from the front end.
 */
/** The children of a branch that the map actually draws around it. */
function genre_atlas_ring_children( $parent_id ) {
	global $wpdb;
	$on_ring = genre_atlas_on_ring_sql( 'c' );
	return array_map(
		'intval',
		$wpdb->get_col( $wpdb->prepare( "SELECT c.ID FROM {$wpdb->posts} c WHERE $on_ring AND c.post_parent = %d", $parent_id ) )
	);
}

function genre_atlas_ungrouped_under_wide() {
	global $wpdb;
	$child  = genre_atlas_on_ring_sql( 'c' );
	$parent = genre_atlas_on_ring_sql( 'p' );
	return (int) $wpdb->get_var(
		"SELECT COUNT(*) FROM {$wpdb->posts} c
		  JOIN ( SELECT p.post_parent FROM {$wpdb->posts} p
		          WHERE $parent AND p.post_parent > 0
		          GROUP BY p.post_parent HAVING COUNT(*) > 8 ) w ON w.post_parent = c.post_parent
		  LEFT JOIN {$wpdb->postmeta} m ON m.post_id = c.ID AND m.meta_key = 'ga_group'
		 WHERE $child AND ( m.meta_value IS NULL OR TRIM( m.meta_value ) = '' )"
	);
}

add_action( 'admin_notices', 'genre_atlas_stale_groups_notice' );
function genre_atlas_stale_groups_notice() {
	$screen = get_current_screen();
	if ( ! $screen || 'genre' !== $screen->post_type || ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$n = genre_atlas_ungrouped_under_wide();
	if ( ! $n ) {
		return;
	}
	echo '<div class="notice notice-warning"><p><strong>' . (int) $n . ' genres have no group</strong> and sit under a branch with more than 8 subgenres. '
		. 'The map cannot cut those branches by scene or region, so it falls back on alphabetical ranges such as "S–W". '
		. 'This is what an out-of-date import file looks like: import the latest <code>genre-import.csv</code> from Genres &rarr; Import CSV, '
		. 'or name the groups yourself in <a href="' . esc_url( admin_url( 'edit.php?post_type=genre&page=genre-atlas-groups' ) ) . '">Genres &rarr; Groups</a>.</p></div>';
}

function genre_atlas_groups_page() {
	$wide   = genre_atlas_wide_branches();
	$branch = isset( $_GET['branch'] ) ? (int) $_GET['branch'] : 0; // phpcs:ignore WordPress.Security.NonceVerification

	echo '<div class="wrap"><h1>Group wide branches</h1>';

	if ( ! $wide ) {
		echo '<p>No genre has more than 8 subgenres. Nothing to group.</p></div>';
		return;
	}

	if ( isset( $_POST['genre_atlas_groups_nonce'] ) && wp_verify_nonce( sanitize_key( $_POST['genre_atlas_groups_nonce'] ), 'genre_atlas_groups' ) && current_user_can( 'manage_options' ) ) {
		$saved  = 0;
		$groups = isset( $_POST['ga_group'] ) && is_array( $_POST['ga_group'] ) ? wp_unslash( $_POST['ga_group'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		foreach ( $groups as $child_id => $label ) {
			$child_id = (int) $child_id;
			$label    = sanitize_text_field( $label );
			if ( ! $child_id || 'genre' !== get_post_type( $child_id ) ) {
				continue;
			}
			$before = (string) get_post_meta( $child_id, 'ga_group', true );
			if ( $before === $label ) {
				continue;
			}
			if ( '' === $label ) {
				delete_post_meta( $child_id, 'ga_group' );
			} else {
				update_post_meta( $child_id, 'ga_group', $label );
			}
			++$saved;
		}
		genre_atlas_flush_cache();
		echo '<div class="notice notice-success"><p>' . (int) $saved . ' genre(s) regrouped.</p></div>';
	}

	echo '<p>A branch wider than 8 subgenres is shown on the map as groups. Name a group after a scene, a style or a region ("Chicago", "UK hardcore", "Iberia"). Genres sharing a name end up in the same group. Use <code>&gt;</code> to nest one group inside another ("Europe &gt; Iberia"), which is how a very wide branch narrows twice. Leaving a field empty drops the whole branch onto alphabetical ranges, so it is better to name every genre of a branch or none.</p>';

	echo '<h2 class="screen-reader-text">Wide branches</h2><ul class="subsubsub" style="float:none">';
	foreach ( $wide as $id => $count ) {
		echo '<li><a href="' . esc_url( admin_url( 'edit.php?post_type=genre&page=genre-atlas-groups&branch=' . $id ) ) . '"' . ( $branch === $id ? ' class="current"' : '' ) . '>' .
			esc_html( get_the_title( $id ) ) . ' <span class="count">(' . (int) $count . ')</span></a></li>';
	}
	echo '</ul><br class="clear">';

	if ( ! $branch || ! isset( $wide[ $branch ] ) ) {
		echo '<p>Pick a branch above.</p></div>';
		return;
	}

	// Tiles leave their parent's ring, so they are not part of the branch to
	// group. Alphabetical, like the atlas itself.
	$children = array_map( 'get_post', genre_atlas_ring_children( $branch ) );
	usort(
		$children,
		function ( $a, $b ) {
			return strcmp( mb_strtolower( get_the_title( $a ) ), mb_strtolower( get_the_title( $b ) ) );
		}
	);


	// What the atlas would show right now, so the effect of a change is visible.
	$preview = array();
	foreach ( $children as $child ) {
		$label = (string) get_post_meta( $child->ID, 'ga_group', true );
		$label = trim( $label );
		$key   = '' !== $label ? mb_strtoupper( explode( '>', $label )[0] ) : '(no group — alphabetical)';
		$key   = trim( $key );
		$preview[ $key ] = isset( $preview[ $key ] ) ? $preview[ $key ] + 1 : 1;
	}
	echo '<p><strong>' . count( $children ) . ' subgenres</strong> currently shown as <strong>' . count( $preview ) . ' groups</strong>: ';
	$parts = array();
	foreach ( $preview as $label => $n ) {
		$parts[] = esc_html( $label ) . ' (' . (int) $n . ')';
	}
	echo wp_kses_post( implode( ' · ', $parts ) ) . '</p>';

	echo '<form method="post">';
	wp_nonce_field( 'genre_atlas_groups', 'genre_atlas_groups_nonce' );
	echo '<table class="wp-list-table widefat striped"><thead><tr><th>Genre</th><th style="width:6em">Epoch</th><th style="width:20em">Group</th></tr></thead><tbody>';
	foreach ( $children as $child ) {
		$label = (string) get_post_meta( $child->ID, 'ga_group', true );
		$year  = get_post_meta( $child->ID, 'ga_epoch_year', true );
		echo '<tr><td><a href="' . esc_url( get_edit_post_link( $child->ID ) ) . '">' . esc_html( get_the_title( $child ) ) . '</a></td>' .
			'<td>' . esc_html( $year ? $year : '—' ) . '</td>' .
			'<td><input type="text" class="regular-text" name="ga_group[' . (int) $child->ID . ']" value="' . esc_attr( $label ) . '" placeholder="Scene, style or region — use &gt; to nest"></td></tr>';
	}
	echo '</tbody></table>';
	submit_button( 'Save groups' );
	echo '</form></div>';
}
