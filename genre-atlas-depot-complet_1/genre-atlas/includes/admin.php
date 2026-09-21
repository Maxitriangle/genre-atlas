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
			$n = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'genre' AND post_status = 'publish'", $post_id ) );
			if ( $n > 40 ) {
				echo '<strong style="color:#b32d2e">' . (int) $n . ' — group needed</strong>';
			} elseif ( $n > 12 ) {
				echo (int) $n . ' (dial)';
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
		echo '<div class="notice notice-success"><p>Settings saved.</p></div>';
	}
	$on = get_option( 'genre_atlas_home', '1' );
	echo '<div class="wrap"><h1>Genre Atlas settings</h1><form method="post">';
	wp_nonce_field( 'genre_atlas_settings', 'genre_atlas_settings_nonce' );
	echo '<p><label><input type="checkbox" name="genre_atlas_home" value="1"' . checked( $on, '1', false ) . '> Show the atlas on the home page of the site</label></p>';
	echo '<p class="description">When ticked, the home page of the site is the atlas index, whatever the theme. The atlas is always available at <code>' . esc_html( get_post_type_archive_link( 'genre' ) ) . '</code>.</p>';
	submit_button( 'Save' );
	echo '</form></div>';
}
