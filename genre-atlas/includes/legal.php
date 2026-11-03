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

const GENRE_ATLAS_LEGAL_UPDATED = '2026-11-04'; // Change it with the text.

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
	// Sign-in with Google or Facebook is only described once its keys are set.
	$sso     = function_exists( 'genre_atlas_oauth_ready' ) && in_array( true, genre_atlas_oauth_ready(), true );
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
			'<b>Suggesting an artist</b> keeps the link, the name, the note and the nickname you type, and no e-mail address. An approved suggestion joins the genre’s artists, with your nickname, only once it has been checked by hand. By sending one, you agree that it may be shown, corrected or declined.',
			'<b>Against spam</b>, both forms count the messages sent from one connection in an hour. Your IP address is never stored as such: only a scrambled fingerprint of it is kept, for one hour.',
			$matomo
				? '<b>Audience measurement</b>: the site counts its visits with Matomo, which runs on the site itself. The figures stay on the host’s servers, in France, and go to no one else. The counter sets no cookie, shortens IP addresses before storing them, and keeps its figures for 25 months at most. They only tell which pages are read, to know what to improve. You can choose not to be counted:<span id="ga-optout"><span>Turn JavaScript on to make this choice.</span></span>'
				: 'There is no audience measurement.',
			'<b>Your settings</b> (SOUND ON, MY MAP, having read the note on YouTube) are kept by your browser in its own storage (local storage, not a cookie), so they hold on your next visit. They never leave your device.',
			'<b>Accounts</b> are optional: everything they keep is described in the next section.',
			'There is no newsletter and no advertising.',
		),
		'Accounts'                  => array(
			'An account keeps your atlas, so you find it on any device. To create one, you choose a pseudo and give an e-mail address, then a password' . ( $sso ? ' or your Google or Facebook account' : '' ) . '. What it keeps: your <b>pseudo</b>; your <b>e-mail address</b>, used only to confirm it, to send you a new password when you ask, and to warn you before an unused account is deleted; your <b>password</b>, stored only in a scrambled form that cannot be read back; the <b>date</b> you accepted these terms; your <b>favourite genres and songs</b>; the <b>genres you have heard</b>, each with the day you first heard it (a genre counts once 20 seconds of one of its songs have played); whether your <b>profile is public</b>; and, only if you turn it on, your <b>listening history</b>: each song you heard for 20 seconds or more, with its genre and the time. Turning the history off erases it.',
			'<b>Why</b>: to give you the service you asked for by creating an account (article 6.1.b of the GDPR). Nothing is used for anything else: no advertising, no profiling, no sale, no sharing. The data stays on the host’s servers in France, and only the publisher can reach it.',
			$sso ? '<b>Google and Facebook</b>: if you choose to continue with one of them, you are sent to its site, which tells us your account identifier, your name and your e-mail address; we keep the identifier (to recognise you next time) and the address, not the name. Nothing reaches Google or Facebook before you press that button, and the site loads none of their scripts. Removing the site from your Facebook account deletes what came from it.' : '',
			'<b>How long</b>: as long as the account exists. An account left unconfirmed is deleted after 7 days. An account unused for 3 years is deleted, after an e-mail warning a month before. Deleting your account erases all of it at once.',
			'<b>Public profile</b>: off by default. Turned on, the page <code>/atlas/your-pseudo/</code> shows your pseudo, the date you joined, the genres you have heard and your favourites, to anyone who has the link; never your e-mail address nor your history. Search engines are asked not to list it. Turned off, it disappears at once.',
			'<b>Security</b>: the site is served over HTTPS; repeated wrong passwords lock an account for a quarter of an hour; confirmation links work once and expire. Should the data ever leak, members would be told, and the CNIL within 72 hours, as the law requires.',
		),
		'Cookies'                   => array(
			'This site sets no cookie on your device while you browse it, and uses no tracker, which is why it asks for no consent. It sets cookies only when you ask for them:',
			'<b>Signing in</b> sets the sign-in cookies of WordPress (named wordpress_logged_in_… and wordpress_sec_…), which keep you signed in for 14 days, or until you sign out. They are needed for the account to work, so they need no consent.' . ( $matomo ? ' <b>Choosing not to be counted</b> sets a cookie named mtm_consent_removed, which remembers that choice.' : '' ),
			'<b>Songs</b> play whole in YouTube’s own player (youtube.com), loaded only when you ask for a song: HEAR, RADIO, PLAY, holding a genre on a phone, or pointing at a genre once you have switched SOUND ON. That request is your choice to use it. From then on YouTube, part of Google, may set its cookies and show its ads in the player, under Google’s privacy policy; its Premium subscribers signed in to YouTube hear no ads. The player is always shown while it plays, as YouTube requires.',
			'The links to Spotify, Deezer, Bandcamp, Wikipedia and the other platforms take you to those sites, under their own rules; nothing is asked of them before you follow a link.',
			'The site’s font is stored on the site itself: no request goes to Google Fonts.',
		),
		'Your rights'               => array(
			'Under the GDPR and the French data protection act, you can see, correct or have deleted what the site keeps about you, take it with you, and object to its use' . ( $matomo ? ' (for the visit counter, the button above is enough)' : '' ) . '. With an account, MY ATLAS does it at once: download everything it keeps, change your e-mail address or password, turn the history or the public profile off, delete the account. For anything else, write through the ' . $contact . '; you get an answer within a month. If you think your rights have not been respected, you can complain to the CNIL (<a href="https://www.cnil.fr/">cnil.fr</a>).',
		),
		'Terms of use'              => array(
			'These terms apply to anyone who creates an account. Creating one means accepting them.',
			'<b>Age</b>: you must be 15 or older to create an account.',
			'<b>One account, one person</b>. Your pseudo is public on your profile when you make it public: it must not pass you off as someone else, nor insult, harass or advertise. Keep your password to yourself.',
			'<b>Use the site fairly</b>: no automated sign-ups, no attempts to reach other members’ data, no use of the site against the law. An account that breaks these terms may be suspended or deleted, after a warning by e-mail unless the breach is serious.',
			'<b>The service</b> is free, given as it is, by one person, without any guarantee that it will always be available. It may change, and it may stop: members would be warned by e-mail a month before, with time to download their atlas.',
			'<b>Your atlas is yours</b>: you can download it or delete it whenever you like.',
			'These terms are governed by French law. They may change: members are told by e-mail of any change that matters, before it applies.',
		),
		'Sources and credits'       => array(
			'<b>Genres</b>, their lineage, origin and epoch come from <a href="https://www.wikidata.org/">Wikidata</a> (CC0), checked and arranged by hand; genre identifiers also link to <a href="https://musicbrainz.org/">MusicBrainz</a>. Some key artists were found through MusicBrainz’s genre tags (<a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</a>).',
			'<b>Texts</b> marked “Text from Wikipedia” are the introductions of the English <a href="https://en.wikipedia.org/">Wikipedia</a> articles, under the <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> licence, linked to their article on every page.',
			'<b>Artist photos</b> come from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, reworked as halftone pictures; each one names its author and licence beside it. <b>Songs</b> are the artists’ most played tracks on Deezer, or a track from an album MusicBrainz files under the genre, played from YouTube. <b>Listening examples</b> are YouTube videos chosen by hand for genres no key artist gives a song to.',
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
		foreach ( array_filter( $paras ) as $p ) {
			$out .= '<p>' . wp_kses( $p, array( 'a' => array( 'href' => true ), 'b' => array(), 'code' => array(), 'span' => array( 'id' => true ) ) ) . '</p>';
		}
		$out .= '</section>';
	}
	$date = date_create( GENRE_ATLAS_LEGAL_UPDATED );
	return $out . '<p class="ga-legal-date">Last updated ' . esc_html( $date ? $date->format( 'j F Y' ) : GENRE_ATLAS_LEGAL_UPDATED ) . '.</p></div>';
}
