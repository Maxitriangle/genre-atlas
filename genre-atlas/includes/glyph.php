<?php
/**
 * The glyph of a genre, drawn on the server: the same geometry as glyph() in
 * assets/atlas.js, for the pictures shared on social networks and the site
 * icon. A spec carries what the drawing reads from the data:
 *
 *   shape  family shape (circle, hex, pent…)   dbl    double frame (tiles past the ninth)
 *   kids   children on the map (dots)          depth  level below the tile (inner rings)
 *   year   epoch (the arc)                     bpm    [min, max] (spokes), or null
 *   color  [r, g, b]                           group  dashed outer ring
 *
 * Plain PHP and GD: no WordPress call, so tools/ can draw the icons with it.
 */

if ( ! defined( 'ABSPATH' ) && 'cli' !== PHP_SAPI ) {
	exit;
}

/** Polygon frames: sides, start angle, radius factor (as POLY in atlas.js). */
function genre_atlas_glyph_poly( $shape ) {
	$poly = array(
		'tri_up'   => array( 3, -90, 1.18 ),
		'tri_down' => array( 3, 90, 1.18 ),
		'square'   => array( 4, 45, 1.1 ),
		'diamond'  => array( 4, 0, 1.05 ),
		'pent'     => array( 5, -90, 1.04 ),
		'hex'      => array( 6, 0, 1 ),
		'hex_r'    => array( 6, 30, 1 ),
		'oct'      => array( 8, 22.5, 1 ),
	);
	return isset( $poly[ $shape ] ) ? $poly[ $shape ] : null;
}

/**
 * The glyph as a list of marks, in a box of $size: each one a stroked path
 * (points, closed, width, opacity) or a filled dot (x, y, r, opacity).
 * $weight thickens the strokes, for a small icon.
 */
function genre_atlas_glyph_marks( $spec, $size, $weight = 1 ) {
	$spec  = array_merge( array( 'shape' => 'circle', 'dbl' => false, 'kids' => 0, 'depth' => 0, 'year' => 0, 'bpm' => null, 'group' => false ), $spec );
	$c     = $size / 2;
	$r     = $size / 2 - max( 3, $size * 0.07 );
	$sw    = max( 1.1, $size / 44 ) * $weight;
	$marks = array();
	$ring  = function ( $radius, $from = -90, $sweep = 360 ) use ( $c ) {
		$pts   = array();
		$steps = max( 24, (int) ceil( abs( $sweep ) / 2 ) );
		for ( $i = 0; $i <= $steps; $i++ ) {
			$a     = deg2rad( $from + $sweep * $i / $steps );
			$pts[] = array( $c + $radius * cos( $a ), $c + $radius * sin( $a ) );
		}
		return $pts;
	};
	$frame = function ( $f, $w ) use ( $spec, $c, $ring ) {
		$p = genre_atlas_glyph_poly( $spec['shape'] );
		if ( ! $p ) {
			return array( 'path' => $ring( $f ), 'closed' => true, 'w' => $w, 'o' => 1 );
		}
		$pts = array();
		for ( $i = 0; $i < $p[0]; $i++ ) {
			$a     = deg2rad( $p[1] + 360 * $i / $p[0] );
			$pts[] = array( $c + $f * $p[2] * cos( $a ), $c + $f * $p[2] * sin( $a ) );
		}
		return array( 'path' => $pts, 'closed' => true, 'w' => $w, 'o' => 1 );
	};

	$marks[] = array( 'path' => $ring( $r ), 'closed' => true, 'w' => $sw * 0.8, 'o' => 0.22, 'dash' => $spec['group'] );
	if ( $spec['year'] ) {
		$sweep   = max( 8, min( 352, ( $spec['year'] - 1850 ) / 180 * 360 ) );
		$marks[] = array( 'path' => $ring( $r, -90, $sweep ), 'closed' => false, 'w' => $sw * 2.2, 'o' => 1 );
	}
	$k = min( (int) $spec['kids'], 12 );
	for ( $i = 0; $i < $k; $i++ ) {
		$a       = deg2rad( -90 + 360 * $i / $k );
		$marks[] = array( 'dot' => array( $c + $r * 0.8 * cos( $a ), $c + $r * 0.8 * sin( $a ), max( 1.5, $size * 0.035 ) * $weight ), 'o' => 1 );
	}
	$f       = $r * 0.58;
	$marks[] = $frame( $f, $sw );
	if ( $spec['dbl'] ) {
		$marks[] = $frame( $f * 0.78, $sw * 0.7 );
	}
	for ( $i = 0; $i < min( (int) $spec['depth'], 5 ); $i++ ) {
		$marks[] = array( 'path' => $ring( $r * ( 0.2 + 0.08 * $i ) ), 'closed' => true, 'w' => $sw * 0.6, 'o' => 0.7 );
	}
	if ( $spec['bpm'] ) {
		$ns = (int) round( ( $spec['bpm'][0] + $spec['bpm'][1] ) / 2 / 20 );
		for ( $i = 0; $i < $ns; $i++ ) {
			$a       = deg2rad( -90 + 360 * $i / $ns );
			$marks[] = array(
				'path'   => array( array( $c + $r * 0.13 * cos( $a ), $c + $r * 0.13 * sin( $a ) ), array( $c + $r * 0.44 * cos( $a ), $c + $r * 0.44 * sin( $a ) ) ),
				'closed' => false,
				'w'      => $sw * 0.6,
				'o'      => 0.85,
			);
		}
	}
	$marks[] = array( 'dot' => array( $c, $c, max( 1.6, $r * 0.075 ) * $weight ), 'o' => 1 );
	return $marks;
}

/** The glyph as SVG markup (the site icon). */
function genre_atlas_glyph_svg( $spec, $size, $weight = 1, $background = null ) {
	$hex = vsprintf( '#%02X%02X%02X', $spec['color'] );
	$svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' . $size . '" height="' . $size . '" viewBox="0 0 ' . $size . ' ' . $size . '">';
	if ( $background ) {
		$svg .= '<rect width="' . $size . '" height="' . $size . '" fill="' . vsprintf( '#%02X%02X%02X', $background ) . '"/>';
	}
	foreach ( genre_atlas_glyph_marks( $spec, $size, $weight ) as $m ) {
		$op = $m['o'] < 1 ? ' opacity="' . $m['o'] . '"' : '';
		if ( isset( $m['dot'] ) ) {
			$svg .= sprintf( '<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s"%s/>', $m['dot'][0], $m['dot'][1], $m['dot'][2], $hex, $op );
			continue;
		}
		$pts = implode( ' ', array_map( function ( $p ) { return sprintf( '%.2f,%.2f', $p[0], $p[1] ); }, $m['path'] ) );
		$svg .= sprintf( '<%s points="%s" fill="none" stroke="%s" stroke-width="%.2f" stroke-linejoin="round" stroke-linecap="round"%s%s/>', $m['closed'] ? 'polygon' : 'polyline', $pts, $hex, $m['w'], ! empty( $m['dash'] ) ? ' stroke-dasharray="3 5"' : '', $op );
	}
	return $svg . '</svg>';
}

/**
 * Draws the glyph on a GD image, with its top left corner at ($x, $y). GD
 * strokes are not antialiased: the caller draws on a canvas $ss times larger
 * and shrinks it. Opacity is mixed with the flat background beforehand, so
 * strokes stamped over themselves do not darken.
 */
function genre_atlas_glyph_gd( $img, $spec, $x, $y, $size, $background, $weight = 1 ) {
	$colors = array();
	$ink    = function ( $o ) use ( $img, $spec, $background, &$colors ) {
		$key = (string) $o;
		if ( ! isset( $colors[ $key ] ) ) {
			$mix            = array();
			for ( $i = 0; $i < 3; $i++ ) {
				$mix[ $i ] = (int) round( $background[ $i ] + ( $spec['color'][ $i ] - $background[ $i ] ) * $o );
			}
			$colors[ $key ] = imagecolorallocate( $img, $mix[0], $mix[1], $mix[2] );
		}
		return $colors[ $key ];
	};
	foreach ( genre_atlas_glyph_marks( $spec, $size, $weight ) as $m ) {
		if ( isset( $m['dot'] ) ) {
			$d = $m['dot'][2] * 2;
			imagefilledellipse( $img, (int) round( $x + $m['dot'][0] ), (int) round( $y + $m['dot'][1] ), (int) round( $d ), (int) round( $d ), $ink( $m['o'] ) );
			continue;
		}
		$pts = $m['path'];
		if ( $m['closed'] ) {
			$pts[] = $pts[0];
		}
		$col  = $ink( $m['o'] );
		$w    = max( 1, $m['w'] );
		$step = max( 0.5, $w / 3 );
		$run  = 0; // distance along the path, for the dashes (3 on, 5 off, scaled).
		$unit = $size / 100;
		for ( $i = 1; $i < count( $pts ); $i++ ) {
			list( $x0, $y0 ) = $pts[ $i - 1 ];
			list( $x1, $y1 ) = $pts[ $i ];
			$len = hypot( $x1 - $x0, $y1 - $y0 );
			$n   = max( 1, (int) ceil( $len / $step ) );
			for ( $j = 0; $j <= $n; $j++ ) {
				$t = $j / $n;
				if ( ! empty( $m['dash'] ) && fmod( ( $run + $len * $t ) / ( $unit * 2 ), 8 ) >= 3 ) {
					continue;
				}
				imagefilledellipse( $img, (int) round( $x + $x0 + ( $x1 - $x0 ) * $t ), (int) round( $y + $y0 + ( $y1 - $y0 ) * $t ), (int) round( $w ), (int) round( $w ), $col );
			}
			$run += $len;
		}
	}
}

/** oklch(L C h) to sRGB, as the browser turns the family colours into pixels. */
function genre_atlas_oklch( $l, $c, $h ) {
	$a  = $c * cos( deg2rad( $h ) );
	$b  = $c * sin( deg2rad( $h ) );
	$l_ = pow( $l + 0.3963377774 * $a + 0.2158037573 * $b, 3 );
	$m_ = pow( $l - 0.1055613458 * $a - 0.0638541728 * $b, 3 );
	$s_ = pow( $l - 0.0894841775 * $a - 1.2914855480 * $b, 3 );
	$lin = array(
		4.0767416621 * $l_ - 3.3077115913 * $m_ + 0.2309699292 * $s_,
		-1.2684380046 * $l_ + 2.6097574011 * $m_ - 0.3413193965 * $s_,
		-0.0041960863 * $l_ - 0.7034186147 * $m_ + 1.7076147010 * $s_,
	);
	return array_map(
		function ( $v ) {
			$v = $v <= 0.0031308 ? 12.92 * $v : 1.055 * pow( max( 0, $v ), 1 / 2.4 ) - 0.055;
			return (int) round( 255 * max( 0, min( 1, $v ) ) );
		},
		$lin
	);
}
