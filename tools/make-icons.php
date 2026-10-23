<?php
/**
 * Draws the site icon into genre-atlas/assets/icons/: the glyph of the atlas
 * itself, a hexagon in a ring of eight dots (the most the map shows around a
 * centre), lavender on the site's near black. Run again after changing it:
 *   php tools/make-icons.php
 */
require __DIR__ . '/../genre-atlas/includes/glyph.php';

$out  = __DIR__ . '/../genre-atlas/assets/icons/';
$bg   = array( 0x12, 0x10, 0x16 );
$spec = array( 'shape' => 'hex', 'kids' => 8, 'depth' => 0, 'color' => array( 0xC2, 0xB0, 0xFB ) );

// The glyph fills the square; thicker strokes keep it readable small.
function icon_png( $file, $px, $spec, $bg, $weight ) {
	$ss  = 8;
	$big = imagecreatetruecolor( $px * $ss, $px * $ss );
	imagefill( $big, 0, 0, imagecolorallocate( $big, $bg[0], $bg[1], $bg[2] ) );
	$pad = $px * $ss * 0.02;
	genre_atlas_glyph_gd( $big, $spec, $pad, $pad, $px * $ss - 2 * $pad, $bg, $weight );
	$img = imagecreatetruecolor( $px, $px );
	imagecopyresampled( $img, $big, 0, 0, 0, 0, $px, $px, $px * $ss, $px * $ss );
	imagepng( $img, $file, 9 );
}
icon_png( $out . 'icon-48.png', 48, $spec, $bg, 1.9 );
icon_png( $out . 'icon-192.png', 192, $spec, $bg, 1.5 );
icon_png( $out . 'apple-touch-icon.png', 180, $spec, $bg, 1.5 );
file_put_contents( $out . 'favicon.svg', genre_atlas_glyph_svg( $spec, 48, 1.9, $bg ) . "\n" );
echo "icons written\n";
