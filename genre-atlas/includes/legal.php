<?php
/**
 * /legal/: legal notice, privacy and credits, on one page. French law asks a
 * website for a legal notice; a private individual publishing a non-commercial
 * site may give the host's details instead of their own (LCEN, art. 6-III-2).
 *
 * The text is written here, once: the server prints it in the page, and the
 * script lifts it into the atlas's own layout.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const GENRE_ATLAS_LEGAL_UPDATED = '2026-10-29'; // Change it with the text.

add_action( 'init', 'genre_atlas_legal_route', 11 );
function genre_atlas_legal_route() {
	// Rendered by the atlas template, like /contact/. The rules are flushed by
	// genre_atlas_dossier_route() when the version changes.
	add_rewrite_rule( '^legal/?$', 'index.php?post_type=genre&ga_legal=1', 'top' );
}

add_filter( 'query_vars', 'genre_atlas_legal_query_var' );
function genre_atlas_legal_query_var( $vars ) {
	$vars[] = 'ga_legal';
	return $vars;
}

function genre_atlas_is_legal() {
	return is_post_type_archive( 'genre' ) && get_query_var( 'ga_legal' );
}

/**
 * Whether the site counts its visits with Matomo (the "Matomo Analytics"
 * plugin, which keeps everything on the site). The page says so only then.
 */
function genre_atlas_matomo_active() {
	return defined( 'MATOMO_ANALYTICS_FILE' ) || class_exists( 'WpMatomo' );
}

/** The text of the page, as sections: a heading and its paragraphs (HTML). */
function genre_atlas_legal_sections() {
	$contact = '<a href="' . esc_url( home_url( '/contact/' ) ) . '">contact page</a>';
	$site    = esc_html( get_bloginfo( 'name' ) );
	$matomo  = genre_atlas_matomo_active();
	return array(
		'Publisher'                 => array(
			$site . ' is a personal, non-commercial website, published by a private individual who is also its director of publication. As French law allows (article 6-III-2 of law no. 2004-575 of 21 June 2004, “LCEN”), the publisher’s identity is not shown here: it has been given to the host, who keeps it.',
			'To write to the publisher, use the ' . $contact . '. Every message is read by a person.',
		),
		'Host'                      => array(
			'o2switch SAS, Chemin des Pardiaux, 63000 Clermont-Ferrand, France. Phone +33 4 44 44 60 40. <a href="https://www.o2switch.fr/">o2switch.fr</a>. The site and its data are hosted in France.',
		),
		'What this site keeps'      => array(
			'<b>The contact form</b> sends the topic, the genre, your name if you give one, your e-mail address and your message. They go to the publisher’s inbox and a copy is kept on the site, to answer you and to fix what you point out. Your address is used for nothing else and given to no one. Messages are deleted once they no longer serve, or as soon as you ask.',
			'<b>Community picks</b> keep the link, the name, the note and the nickname you type, and no e-mail address. A pick is shown on the genre’s page, with your nickname, only once it has been approved by hand. By sending one, you agree that it may be shown, corrected or declined.',
			'<b>Against spam</b>, both forms count the messages sent from one connection in an hour. Your IP address is never stored as such: only a scrambled fingerprint of it is kept, for one hour.',
			$matomo
				? '<b>Audience measurement</b>: the site counts its visits with Matomo, which runs on the site itself. The figures stay on the host’s servers, in France, and go to no one else. The counter sets no cookie, shortens IP addresses before storing them, and keeps its figures for 25 months at most. They only tell which pages are read, to know what to improve. You can choose not to be counted:<span id="ga-optout"><span>Turn JavaScript on to make this choice.</span></span>'
				: 'There is no audience measurement.',
			'<b>Your sound choice</b>: when you switch SOUND ON, your browser remembers it in its own storage (local storage, not a cookie), so the map stays audible on your next visit. It never leaves your device; switching SOUND OFF erases it.',
			'There is no account, no newsletter and no advertising.',
		),
		'Cookies'                   => array(
			$matomo
				? 'This site sets no cookie on your device, which is why it asks for no consent. The one exception is a cookie you ask for: if you choose not to be counted, a cookie named mtm_consent_removed remembers that choice. (WordPress uses cookies for the publisher’s own login, never for visitors.)'
				: 'This site sets no cookie on your device and uses no tracker, which is why it asks for no consent. (WordPress uses cookies for the publisher’s own login, never for visitors.)',
			'Previews of 30 seconds play from Deezer’s servers only once you switch SOUND ON or press HEAR: from then on, Deezer sees your IP address when a preview loads, under its own privacy policy, and sets no cookie through this site. Songs play in full from YouTube only when you press PLAY, in YouTube’s privacy-enhanced mode (youtube-nocookie.com). From then on, Google’s privacy policy applies to the player. The links to Spotify, Deezer, Wikipedia and the other platforms take you to those sites, under their own rules.',
			'The site’s font is stored on the site itself: no request goes to Google Fonts.',
		),
		'Your rights'               => array(
			'Under the GDPR and the French data protection act, you can see, correct or have deleted what the site keeps about you, and object to its use' . ( $matomo ? ' (for the visit counter, the button above is enough)' : '' ) . '. Write through the ' . $contact . '. If you think your rights have not been respected, you can complain to the CNIL (<a href="https://www.cnil.fr/">cnil.fr</a>).',
		),
		'Sources and credits'       => array(
			'<b>Genres</b>, their lineage, origin and epoch come from <a href="https://www.wikidata.org/">Wikidata</a> (CC0), checked and arranged by hand; genre identifiers also link to <a href="https://musicbrainz.org/">MusicBrainz</a>. Some key artists were found through MusicBrainz’s genre tags (<a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</a>).',
			'<b>Texts</b> marked “Text from Wikipedia” are the introductions of the English <a href="https://en.wikipedia.org/">Wikipedia</a> articles, under the <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> licence, linked to their article on every page.',
			'<b>Artist photos</b> come from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, reworked as halftone pictures; each one names its author and licence beside it. <b>Songs</b> are the artists’ most played tracks on Deezer, or a track from an album MusicBrainz files under the genre; previews are Deezer’s. <b>Listening examples</b> are YouTube videos chosen by hand for genres no key artist gives a song to.',
			'<b>The font</b> is Azeret Mono, under the SIL Open Font License.',
			'The rest, the tree as it is arranged, its editorial groups, the glyphs drawn from the data and the code, is the publisher’s own work. Found a mistake, or a credit that is missing? The ' . $contact . ' is the place.',
		),
	);
}

/** The text as HTML, for the page as served and for the script to lift. */
function genre_atlas_legal_html() {
	$out = '<h1>Legal notice and privacy</h1><div class="ga-legal-text">';
	foreach ( genre_atlas_legal_sections() as $title => $paras ) {
		$out .= '<section id="' . esc_attr( sanitize_title( $title ) ) . '"><h2>' . esc_html( $title ) . '</h2>';
		foreach ( $paras as $p ) {
			$out .= '<p>' . wp_kses( $p, array( 'a' => array( 'href' => true ), 'b' => array(), 'span' => array( 'id' => true ) ) ) . '</p>';
		}
		$out .= '</section>';
	}
	$date = date_create( GENRE_ATLAS_LEGAL_UPDATED );
	return $out . '<p class="ga-legal-date">Last updated ' . esc_html( $date ? $date->format( 'j F Y' ) : GENRE_ATLAS_LEGAL_UPDATED ) . '.</p></div>';
}
