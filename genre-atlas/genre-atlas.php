<?php
/**
 * Plugin Name: Genre Atlas
 * Description: Music genre atlas — "Genre" content type (strict tree), CSV import, JSON tree endpoint and the map / list front end.
 * Version: 0.9.0
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Author: Maxime
 * Update URI: https://github.com/Maxitriangle/genre-atlas
 * Text Domain: genre-atlas
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GENRE_ATLAS_VERSION', '0.9.0' );
define( 'GENRE_ATLAS_DIR', plugin_dir_path( __FILE__ ) );
define( 'GENRE_ATLAS_URL', plugin_dir_url( __FILE__ ) );
define( 'GENRE_ATLAS_CACHE', 'genre_atlas_tree_v1' );

require_once GENRE_ATLAS_DIR . 'includes/class-genre-atlas-importer.php';
require_once GENRE_ATLAS_DIR . 'includes/admin.php';
require_once GENRE_ATLAS_DIR . 'includes/artists.php';
require_once GENRE_ATLAS_DIR . 'includes/updater.php';
if ( defined( 'WP_CLI' ) && WP_CLI ) {
	require_once GENRE_ATLAS_DIR . 'includes/cli.php';
}

/**
 * Meta fields of a genre. All are exposed in the REST API.
 */
function genre_atlas_meta_fields() {
	return array(
		'ga_epoch_year'           => array( 'type' => 'integer', 'label' => 'Epoch (year)' ),
		'ga_origin'               => array( 'type' => 'string', 'label' => 'Origin (place)' ),
		'ga_bpm_min'              => array( 'type' => 'integer', 'label' => 'BPM min' ),
		'ga_bpm_max'              => array( 'type' => 'integer', 'label' => 'BPM max' ),
		'ga_featured'             => array( 'type' => 'integer', 'label' => 'Home page tile (order; blank = no tile)' ),
		'ga_family_shape'         => array( 'type' => 'string', 'label' => 'Family shape (genres with a home page tile)' ),
		'ga_family_hue'           => array( 'type' => 'integer', 'label' => 'Family colour hue 0–360 (genres with a home page tile)' ),
		'ga_group'                => array( 'type' => 'string', 'label' => 'Editorial group (used when the parent has more than 40 subgenres)' ),
		'ga_status'               => array( 'type' => 'string', 'label' => 'Status' ),
		'ga_wikidata_id'          => array( 'type' => 'string', 'label' => 'Wikidata ID' ),
		'ga_musicbrainz_id'       => array( 'type' => 'string', 'label' => 'MusicBrainz ID' ),
		'ga_parent_choice'        => array( 'type' => 'string', 'label' => 'How the parent was chosen' ),
		'ga_wikidata_parents_raw' => array( 'type' => 'string', 'label' => 'Parents listed in Wikidata' ),
	);
}

function genre_atlas_shapes() {
	return array( 'circle', 'hex', 'pent', 'square', 'diamond', 'oct', 'tri_up', 'tri_down', 'hex_r' );
}

add_action( 'init', 'genre_atlas_register' );
function genre_atlas_register() {
	register_post_type(
		'genre',
		array(
			'labels'       => array(
				'name'               => 'Genres',
				'singular_name'      => 'Genre',
				'add_new_item'       => 'Add a genre',
				'edit_item'          => 'Edit genre',
				'search_items'       => 'Search genres',
				'parent_item_colon'  => 'Parent genre:',
				'not_found'          => 'No genre found',
				'all_items'          => 'All genres',
			),
			'public'       => true,
			'hierarchical' => true, // strict tree: one parent per genre (post_parent).
			'has_archive'  => true,
			'show_in_rest' => true,
			'menu_icon'    => 'dashicons-networking',
			'supports'     => array( 'title', 'editor', 'page-attributes', 'custom-fields', 'revisions' ),
			'rewrite'      => array( 'slug' => 'genre', 'with_front' => false ),
		)
	);

	foreach ( genre_atlas_meta_fields() as $key => $def ) {
		register_post_meta(
			'genre',
			$key,
			array(
				'type'              => $def['type'],
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => 'integer' === $def['type'] ? 'genre_atlas_sanitize_int' : 'sanitize_text_field',
				'auth_callback'     => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}
}

/*
 * The dossier of a genre lives at its own address, one segment under the genre:
 * /genre/rock-music/alternative-rock/about/. The rule has to come before the
 * post type's own, which would read "about" as the slug of a child genre.
 */
add_action( 'init', 'genre_atlas_dossier_route', 11 );
function genre_atlas_dossier_route() {
	add_rewrite_rule( '^genre/(.+?)/about/?$', 'index.php?genre=$matches[1]&ga_about=1', 'top' );
	// Activation is the only time WordPress rebuilds its rules on its own, and
	// an update from the Plugins screen is not an activation.
	if ( get_option( 'genre_atlas_rules' ) !== GENRE_ATLAS_VERSION ) {
		flush_rewrite_rules( false );
		update_option( 'genre_atlas_rules', GENRE_ATLAS_VERSION );
	}
}

add_filter( 'query_vars', 'genre_atlas_query_vars' );
function genre_atlas_query_vars( $vars ) {
	$vars[] = 'ga_about';
	return $vars;
}

function genre_atlas_sanitize_int( $value ) {
	return ( '' === $value || null === $value ) ? '' : (int) $value;
}

register_activation_hook( __FILE__, 'genre_atlas_activate' );
function genre_atlas_activate() {
	genre_atlas_register();
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );

/* -------------------------------------------------------------------------
 * JSON tree: one compact, cached payload for the whole atlas.
 * GET /wp-json/genre-atlas/v1/tree
 * ---------------------------------------------------------------------- */

add_action( 'rest_api_init', 'genre_atlas_rest' );
function genre_atlas_rest() {
	register_rest_route(
		'genre-atlas/v1',
		'/tree',
		array(
			'methods'             => 'GET',
			'permission_callback' => '__return_true',
			'callback'            => function () {
				return rest_ensure_response( genre_atlas_tree() );
			},
		)
	);
	// What a dossier shows beyond the tree. Kept out of the tree, which every
	// visitor downloads whole, and fetched only when a dossier opens.
	register_rest_route(
		'genre-atlas/v1',
		'/genre/(?P<id>\d+)',
		array(
			'methods'             => 'GET',
			'permission_callback' => '__return_true',
			'callback'            => 'genre_atlas_dossier',
		)
	);
}

function genre_atlas_dossier( $request ) {
	$post = get_post( (int) $request['id'] );
	if ( ! $post || 'genre' !== $post->post_type || 'publish' !== $post->post_status ) {
		return new WP_Error( 'genre_atlas_not_found', 'No such genre.', array( 'status' => 404 ) );
	}
	$text  = trim( wp_strip_all_tags( $post->post_content ) );
	$paras = $text ? array_values( array_filter( array_map( 'trim', preg_split( '/\n\s*\n/', $text ) ) ) ) : array();
	return rest_ensure_response(
		array(
			'id'          => (int) $post->ID,
			'description' => $paras,
			'wikidata'    => (string) get_post_meta( $post->ID, 'ga_wikidata_id', true ),
			'musicbrainz' => (string) get_post_meta( $post->ID, 'ga_musicbrainz_id', true ),
			'wikipedia'   => (string) get_post_meta( $post->ID, 'ga_wikipedia', true ),
			'textSource'  => (string) get_post_meta( $post->ID, 'ga_text_source', true ),
			'artists'     => genre_atlas_dossier_artists( $post->ID ),
		)
	);
}

function genre_atlas_tree() {
	$cached = get_transient( GENRE_ATLAS_CACHE );
	if ( is_array( $cached ) ) {
		return $cached;
	}
	$posts = get_posts(
		array(
			'post_type'              => 'genre',
			'post_status'            => 'publish',
			'numberposts'            => -1,
			'orderby'                => array( 'menu_order' => 'ASC', 'title' => 'ASC' ),
			'update_post_term_cache' => false,
			'suppress_filters'       => true,
		)
	);
	$editorial_groups = '1' === get_option( 'genre_atlas_groups', '1' );
	$nodes            = array();
	foreach ( $posts as $p ) {
		$node = array(
			'id'   => (int) $p->ID,
			'p'    => (int) $p->post_parent,
			'slug' => $p->post_name,
			'name' => html_entity_decode( get_the_title( $p ), ENT_QUOTES, 'UTF-8' ),
		);
		$year = get_post_meta( $p->ID, 'ga_epoch_year', true );
		if ( '' !== $year && null !== $year ) {
			$node['y'] = (int) $year;
		}
		$origin = get_post_meta( $p->ID, 'ga_origin', true );
		if ( $origin ) {
			$node['o'] = $origin;
		}
		// Editorial groups can be switched off from the settings screen, which
		// puts every wide branch back on its decade fallback without touching
		// what has been typed in Genres > Groups.
		if ( $editorial_groups ) {
			$group = get_post_meta( $p->ID, 'ga_group', true );
			if ( $group ) {
				$node['g'] = $group;
			}
		}
		$bmin = (int) get_post_meta( $p->ID, 'ga_bpm_min', true );
		$bmax = (int) get_post_meta( $p->ID, 'ga_bpm_max', true );
		if ( $bmin || $bmax ) {
			$node['b'] = array( $bmin ? $bmin : $bmax, $bmax ? $bmax : $bmin );
		}
		// A tile on the home page and having no parent are two different things:
		// Metal is a child of Rock and still a place a visitor enters the atlas
		// from. So the shape and colour of a branch hang off the tile, not the root.
		$featured = get_post_meta( $p->ID, 'ga_featured', true );
		if ( '' !== $featured && null !== $featured && (int) $featured > 0 ) {
			$node['f'] = (int) $featured;
		}
		if ( ! $p->post_parent || isset( $node['f'] ) ) {
			$shape = get_post_meta( $p->ID, 'ga_family_shape', true );
			$hue   = get_post_meta( $p->ID, 'ga_family_hue', true );
			if ( $shape ) {
				$node['shape'] = $shape;
			}
			if ( '' !== $hue && null !== $hue ) {
				$node['hue'] = (int) $hue;
			}
		}
		$desc = trim( wp_strip_all_tags( $p->post_content ) );
		if ( $desc ) {
			// A teaser for the panel, loaded with the whole tree on every page:
			// the full text is on the dossier, fetched on demand.
			$node['d'] = wp_html_excerpt( $desc, 160, '…' );
		}
		$nodes[] = $node;
	}
	$tree = array(
		'generated' => gmdate( 'c' ),
		'count'     => count( $nodes ),
		'nodes'     => $nodes,
	);
	set_transient( GENRE_ATLAS_CACHE, $tree, DAY_IN_SECONDS );
	return $tree;
}

function genre_atlas_flush_cache() {
	delete_transient( GENRE_ATLAS_CACHE );
}
add_action( 'save_post_genre', 'genre_atlas_flush_cache' );
add_action( 'deleted_post', 'genre_atlas_flush_cache' );
add_action( 'trashed_post', 'genre_atlas_flush_cache' );
add_action( 'untrashed_post', 'genre_atlas_flush_cache' );

/* -------------------------------------------------------------------------
 * Front end: every genre URL (and the /genre/ archive) renders the atlas,
 * focused on that genre. Also available as a page template and a shortcode.
 * ---------------------------------------------------------------------- */

add_filter( 'theme_page_templates', 'genre_atlas_page_templates' );
function genre_atlas_page_templates( $templates ) {
	$templates['genre-atlas-full'] = 'Genre Atlas (full screen)';
	return $templates;
}

add_filter( 'template_include', 'genre_atlas_template', 99 );
function genre_atlas_template( $template ) {
	$is_atlas_page = is_page() && 'genre-atlas-full' === get_page_template_slug( get_queried_object_id() );
	$is_atlas_home = is_front_page() && get_option( 'genre_atlas_home', '1' );
	if ( is_singular( 'genre' ) || is_post_type_archive( 'genre' ) || $is_atlas_page || $is_atlas_home ) {
		return GENRE_ATLAS_DIR . 'templates/atlas.php';
	}
	return $template;
}

function genre_atlas_enqueue() {
	wp_enqueue_style( 'genre-atlas', GENRE_ATLAS_URL . 'assets/atlas.css', array(), GENRE_ATLAS_VERSION );
	wp_enqueue_script( 'genre-atlas', GENRE_ATLAS_URL . 'assets/atlas.js', array(), GENRE_ATLAS_VERSION, true );
	wp_localize_script(
		'genre-atlas',
		'GENRE_ATLAS',
		array(
			'treeUrl'  => esc_url_raw( rest_url( 'genre-atlas/v1/tree' ) ),
			'genreUrl' => esc_url_raw( rest_url( 'genre-atlas/v1/genre/' ) ),
			'base'     => trailingslashit( get_post_type_archive_link( 'genre' ) ),
			'start'    => is_singular( 'genre' ) ? (int) get_queried_object_id() : 0,
			'about'    => is_singular( 'genre' ) && get_query_var( 'ga_about' ) ? 1 : 0,
			'title'    => get_bloginfo( 'name' ),
		)
	);
}

add_shortcode( 'genre_atlas', 'genre_atlas_shortcode' );
function genre_atlas_shortcode() {
	genre_atlas_enqueue();
	return '<div id="genre-atlas" class="ga-embedded"></div>';
}

/**
 * Plain HTML shown before the script takes over (and to search engines).
 */
function genre_atlas_fallback_html() {
	$out = '';
	if ( is_singular( 'genre' ) ) {
		$post = get_queried_object();
		$out .= '<h1>' . esc_html( get_the_title( $post ) ) . '</h1>';
		if ( $post->post_parent ) {
			$out .= '<p>Subgenre of <a href="' . esc_url( get_permalink( $post->post_parent ) ) . '">' . esc_html( get_the_title( $post->post_parent ) ) . '</a></p>';
		}
		$out .= wp_kses_post( wpautop( $post->post_content ) );
		$children = get_posts(
			array(
				'post_type'   => 'genre',
				'post_parent' => $post->ID,
				'numberposts' => 200,
				'orderby'     => 'title',
				'order'       => 'ASC',
			)
		);
	} else {
		$out     .= '<h1>' . esc_html( get_bloginfo( 'name' ) ) . '</h1>';
		$children = get_posts(
			array(
				'post_type'   => 'genre',
				'post_parent' => 0,
				'numberposts' => 200,
				'orderby'     => 'title',
				'order'       => 'ASC',
			)
		);
	}
	if ( $children ) {
		$out .= '<ul>';
		foreach ( $children as $c ) {
			$out .= '<li><a href="' . esc_url( get_permalink( $c ) ) . '">' . esc_html( get_the_title( $c ) ) . '</a></li>';
		}
		$out .= '</ul>';
	}
	return $out;
}
