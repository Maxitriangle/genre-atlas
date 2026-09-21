<?php
/**
 * Full-screen atlas template (no theme header / footer).
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
genre_atlas_enqueue();
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php wp_head(); ?>
</head>
<body <?php body_class( 'ga-body' ); ?>>
<?php wp_body_open(); ?>
<div id="genre-atlas"><div class="ga-fallback"><?php echo genre_atlas_fallback_html(); // phpcs:ignore WordPress.Security.EscapeOutput ?></div></div>
<?php wp_footer(); ?>
</body>
</html>
