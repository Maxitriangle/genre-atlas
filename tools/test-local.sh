#!/usr/bin/env bash
#
# Builds a throwaway WordPress, installs the plugin in it, imports the sample
# data and walks the front end in a real browser. Everything lives outside the
# repository and is rebuilt from scratch on each run.
#
#   tools/test-local.sh [port]
#
# It needs php (with pdo_sqlite), node, npm and git. WordPress and the SQLite
# driver come from GitHub over git, because wordpress.org is not reachable from
# the sessions this runs in.
set -euo pipefail

PORT="${1:-8765}"
REPO="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
CACHE="${GENRE_ATLAS_TEST_CACHE:-$HOME/.cache/genre-atlas-test}"
SITE="$CACHE/site"
SHOTS="$CACHE/shots"
WP_TAG="${WP_TAG:-7.1.1}"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

cleanup() { [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

say "Sources (mises en cache dans $CACHE)"
mkdir -p "$CACHE"
if [ ! -d "$CACHE/wordpress/.git" ]; then
	git clone --depth 1 https://github.com/WordPress/WordPress "$CACHE/wordpress"
fi
git -C "$CACHE/wordpress" fetch --depth 1 origin "refs/tags/$WP_TAG:refs/tags/$WP_TAG" 2>/dev/null || true
git -C "$CACHE/wordpress" checkout -q "$WP_TAG"
if [ ! -d "$CACHE/sqlite/.git" ]; then
	git clone --depth 1 https://github.com/WordPress/sqlite-database-integration "$CACHE/sqlite"
fi
echo "WordPress $WP_TAG, pilote SQLite pret."

say "Montage du site jetable"
rm -rf "$SITE"; mkdir -p "$SITE"
tar -C "$CACHE/wordpress" --exclude=.git -cf - . | tar -C "$SITE" -xf -

SQLITE_SRC="$CACHE/sqlite/packages/plugin-sqlite-database-integration"
[ -d "$SQLITE_SRC" ] || SQLITE_SRC="$CACHE/sqlite"   # older layouts kept the plugin at the root
mkdir -p "$SITE/wp-content/plugins" "$SITE/wp-content/database"
cp -rL "$SQLITE_SRC" "$SITE/wp-content/plugins/sqlite-database-integration"
sed -e "s|{SQLITE_IMPLEMENTATION_FOLDER_PATH}|$SITE/wp-content/plugins/sqlite-database-integration|" \
    -e "s|{SQLITE_PLUGIN}|sqlite-database-integration/load.php|" \
    "$SITE/wp-content/plugins/sqlite-database-integration/db.copy" > "$SITE/wp-content/db.php"

cp -r "$REPO/genre-atlas" "$SITE/wp-content/plugins/genre-atlas"

# Mail is caught rather than sent: one JSON line per message, read back below.
mkdir -p "$SITE/wp-content/mu-plugins"
cat > "$SITE/wp-content/mu-plugins/catch-mail.php" <<'PHP'
<?php
add_filter( 'pre_wp_mail', function ( $null, $atts ) {
	file_put_contents( WP_CONTENT_DIR . '/mail.log', wp_json_encode( $atts ) . "\n", FILE_APPEND );
	return true;
}, 10, 2 );
PHP

# The listening platforms are played rather than called: a link whose address
# holds "smoke-gone" is not found, any other is fine. A route of the bench runs
# the daily link check as if some days had passed.
# Matomo is played too: its plugin is not in the bench, so a stand-in answers
# the same queue (_paq), counts page views in window.__views and keeps an
# opt-out the way Matomo does, in a cookie named mtm_consent_removed.
cat > "$SITE/wp-content/mu-plugins/fake-matomo.php" <<'PHP'
<?php
define( 'MATOMO_ANALYTICS_FILE', __FILE__ );
add_action( 'wp_head', function () {
	?>
<script>
var _paq = window._paq = window._paq || [];
_paq.push(['trackPageView']);
(function () {
	var out = document.cookie.indexOf('mtm_consent_removed=') >= 0, cfg = {};
	window.__views = [];
	var tracker = {
		isUserOptedOut: function () { return out; },
		optUserOut: function () { out = true; document.cookie = 'mtm_consent_removed=1; path=/; max-age=34128000'; },
		forgetUserOptOut: function () { out = false; document.cookie = 'mtm_consent_removed=; path=/; max-age=0'; }
	};
	function run(c) {
		if (typeof c[0] === 'function') return c[0].call(tracker); // as Matomo: [function () { this... }]
		if (c[0] === 'setCustomUrl') cfg.url = c[1];
		else if (c[0] === 'setDocumentTitle') cfg.title = c[1];
		else if (c[0] === 'trackPageView' && !out) window.__views.push({ url: cfg.url || location.href, title: cfg.title || document.title });
	}
	var queue = window._paq;
	window._paq = { push: function () { for (var i = 0; i < arguments.length; i++) run(arguments[i]); } };
	queue.forEach(run);
})();
</script>
	<?php
}, 1 );
PHP

cat > "$SITE/wp-content/mu-plugins/fake-platforms.php" <<'PHP'
<?php
add_filter( 'pre_http_request', function ( $pre, $args, $url ) {
	$host = (string) wp_parse_url( $url, PHP_URL_HOST );
	if ( ! preg_match( '/(spotify|deezer|youtube|youtu\.be|apple|bandcamp|soundcloud|tidal|qobuz)/', $host ) ) {
		return $pre;
	}
	$gone = false !== strpos( rawurldecode( $url ), 'smoke-gone' );
	return array( 'headers' => array(), 'body' => '', 'cookies' => array(), 'filename' => null,
		'response' => array( 'code' => $gone ? 404 : 200, 'message' => $gone ? 'Not Found' : 'OK' ) );
}, 10, 3 );
add_action( 'rest_api_init', function () {
	register_rest_route( 'smoke/v1', '/check-picks', array(
		'methods'             => 'POST',
		'permission_callback' => '__return_true',
		'callback'            => function ( $request ) {
			genre_atlas_check_picks( time() + (int) $request['days'] * DAY_IN_SECONDS );
			return array( 'scheduled' => (bool) wp_next_scheduled( 'genre_atlas_check_picks' ) );
		},
	) );
} );
PHP

cat > "$SITE/wp-config.php" <<PHP
<?php
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'unused' );
define( 'DB_PASSWORD', 'unused' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY', 'genre-atlas-test' );
define( 'SECURE_AUTH_KEY', 'genre-atlas-test' );
define( 'LOGGED_IN_KEY', 'genre-atlas-test' );
define( 'NONCE_KEY', 'genre-atlas-test' );
define( 'AUTH_SALT', 'genre-atlas-test' );
define( 'SECURE_AUTH_SALT', 'genre-atlas-test' );
define( 'LOGGED_IN_SALT', 'genre-atlas-test' );
define( 'NONCE_SALT', 'genre-atlas-test' );

define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );
define( 'AUTOMATIC_UPDATER_DISABLED', true );
// Nothing here should reach the network: this bench is meant to run offline.
define( 'WP_HTTP_BLOCK_EXTERNAL', true );

define( 'WP_HOME', 'http://127.0.0.1:$PORT' );
define( 'WP_SITEURL', 'http://127.0.0.1:$PORT' );

\$table_prefix = 'wp_';

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
PHP

# PHP's built-in server has no mod_rewrite: unknown paths must reach index.php
# or every pretty permalink 404s.
cat > "$SITE/router.php" <<'PHP'
<?php
$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
$file = __DIR__ . $path;

if ( is_dir( $file ) && file_exists( rtrim( $file, '/' ) . '/index.php' ) ) {
	$_SERVER['SCRIPT_NAME'] = rtrim( $path, '/' ) . '/index.php';
	require rtrim( $file, '/' ) . '/index.php';
	return true;
}
if ( '/' !== $path && file_exists( $file ) && ! is_dir( $file ) ) {
	return false;
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
require __DIR__ . '/index.php';
PHP

say "Installation de WordPress"
php -r "
define( 'WP_INSTALLING', true );
\$_SERVER['HTTP_HOST'] = '127.0.0.1:$PORT';
\$_SERVER['REQUEST_URI'] = '/';
require '$SITE/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
\$r = wp_install( 'Genre Atlas test', 'admin', 'admin@example.test', true, '', 'password' );
if ( is_wp_error( \$r ) ) { fwrite( STDERR, \$r->get_error_message() . \"\n\" ); exit( 1 ); }
echo 'WordPress ' . get_bloginfo( 'version' ) . ' sur ' . ( defined( 'DB_ENGINE' ) ? DB_ENGINE : 'mysql' ) . \"\n\";
" 2>/dev/null

say "Extension, permaliens, import"
php -r "
\$_SERVER['HTTP_HOST'] = '127.0.0.1:$PORT';
\$_SERVER['REQUEST_URI'] = '/';
require '$SITE/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
\$r = activate_plugin( 'genre-atlas/genre-atlas.php' );
if ( is_wp_error( \$r ) ) { fwrite( STDERR, \$r->get_error_message() . \"\n\" ); exit( 1 ); }
echo 'extension ' . GENRE_ATLAS_VERSION . \" activee\n\";
global \$wp_rewrite;
\$wp_rewrite->set_permalink_structure( '/%postname%/' );
update_option( 'genre_atlas_contact_to', 'contact@example.test' );
\$stats = Genre_Atlas_Importer::import( '$REPO/data/genre-import.csv' );
if ( is_wp_error( \$stats ) ) { fwrite( STDERR, \$stats->get_error_message() . \"\n\" ); exit( 1 ); }
foreach ( \$stats as \$k => \$v ) { echo str_pad( \$k, 20 ) . \$v . \"\n\"; }
// The artists go through the same entry point, after the genres they point to.
\$stats = Genre_Atlas_Importer::import( '$REPO/data/artist-import.csv' );
if ( is_wp_error( \$stats ) || empty( \$stats['artists'] ) ) { fwrite( STDERR, \"import des artistes en echec\n\" ); exit( 1 ); }
foreach ( \$stats as \$k => \$v ) { echo str_pad( 'artistes ' . \$k, 20 ) . \$v . \"\n\"; }
"

# The rules have to be rebuilt in a fresh request: in the one that changed the
# permalink structure, the post type was registered under the old structure and
# /genre/ 404s.
php -r "
\$_SERVER['HTTP_HOST'] = '127.0.0.1:$PORT';
\$_SERVER['REQUEST_URI'] = '/';
require '$SITE/wp-load.php';
global \$wp_rewrite;
\$wp_rewrite->init();
\$wp_rewrite->flush_rules( true );
echo 'permaliens ' . get_option( 'permalink_structure' ) . \"\n\";
"

say "Exemple d ecoute de test"
# Two made-up videos for a genre with no key artist: smoke.mjs rejects the
# first and accepts the second in Genres > Listening examples.
EXAMPLE_GENRE="$( php -r "
\$_SERVER['HTTP_HOST'] = '127.0.0.1:$PORT';
\$_SERVER['REQUEST_URI'] = '/';
require '$SITE/wp-load.php';
\$ids = get_posts( array( 'post_type' => 'genre', 'numberposts' => 1, 'orderby' => 'title', 'order' => 'ASC', 'fields' => 'ids',
	'meta_query' => array( array( 'key' => 'ga_artists', 'compare' => 'NOT EXISTS' ) ) ) );
\$id = (int) \$ids[0];
delete_post_meta( \$id, 'ga_example_rejected' );
genre_atlas_set_example( \$id, '', '', '' );
\$n = genre_atlas_offer_examples( \$id, wp_json_encode( array(
	array( 'youtube' => 'smokeExmpl1', 'title' => 'Smoke example one', 'channel' => 'Smoke Channel', 'length' => '3:00' ),
	array( 'youtube' => 'smokeExmpl2', 'title' => 'Smoke example two', 'channel' => 'Smoke Ensemble', 'length' => '4:00' ) ) ) );
if ( 2 !== \$n ) { fwrite( STDERR, \"exemples non proposes\n\" ); exit( 1 ); }
echo \$id;
" )"
echo "genre $EXAMPLE_GENRE : deux videos proposees"

say "Serveur sur http://127.0.0.1:$PORT"
php -S "127.0.0.1:$PORT" -t "$SITE" "$SITE/router.php" > "$CACHE/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do
	curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
	sleep 0.5
done
curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || { echo "le serveur ne repond pas"; tail -20 "$CACHE/server.log"; exit 1; }

say "Largeur de l arbre entier"
# The browser only walks a handful of screens; this reads the whole tree and
# reports any node the map would still have to put behind a dial.
python3 "$REPO/tools/check-widths.py" "$REPO/data/genre-import.csv" || exit 1

say "Navigateur"
if [ ! -d "$CACHE/node_modules/playwright" ]; then
	( cd "$CACHE" && npm install playwright --no-audit --no-fund --silent )
fi
# The image ships a Chromium that may not match the version Playwright expects.
CHROME="$( find /opt/pw-browsers -maxdepth 3 -path '*chrome-linux*/chrome' 2>/dev/null | head -1 )"
mkdir -p "$SHOTS"; rm -f "$SHOTS"/*.png

set +e
GA_EXAMPLE_GENRE="$EXAMPLE_GENRE" node "$REPO/tools/smoke.mjs" "http://127.0.0.1:$PORT" "$SHOTS" "$CACHE/node_modules" "$CHROME"
STATUS=$?
set -e

say "Exemple d ecoute apres un reimport"
# Importing the same proposals again must neither replace the accepted
# example nor bring back the rejected video.
php -r "
\$_SERVER['HTTP_HOST'] = '127.0.0.1:$PORT';
\$_SERVER['REQUEST_URI'] = '/';
require '$SITE/wp-load.php';
\$id = $EXAMPLE_GENRE;
\$both = wp_json_encode( array( array( 'youtube' => 'smokeExmpl1' ), array( 'youtube' => 'smokeExmpl2' ) ) );
\$kept = genre_atlas_offer_examples( \$id, \$both ) === 0 && 'smokeExmpl2' === get_post_meta( \$id, 'ga_example_youtube', true );
genre_atlas_set_example( \$id, '', '', '' );
\$left = genre_atlas_offer_examples( \$id, \$both );
\$back = genre_atlas_example_candidates( \$id );
\$ok   = \$kept && 1 === \$left && 'smokeExmpl2' === \$back[0]['youtube'];
echo ( \$ok ? 'OK   ' : 'ECHEC' ) . \" exemples : un reimport garde l exemple accepte et ne repropose pas la video refusee\n\";
exit( \$ok ? 0 : 1 );
" || STATUS=1

say "Courriels du formulaire de contact"
# smoke.mjs sends one message from the page and four through the API.
python3 - "$SITE/wp-content/mail.log" <<'PY' || STATUS=1
import json, sys
try:
    mails = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
    # WordPress's own mail (the install notice) is caught too: keep the form's.
    mails = [m for m in mails if 'Sent from the contact form' in m['message']]
except FileNotFoundError:
    mails = []
def headers(m):
    h = m.get('headers') or []
    return '\n'.join(h) if isinstance(h, list) else h
ok = len(mails) == 5 and all(m['to'] == 'contact@example.test' and 'Reply-To: Smoke Test <visitor@example.test>' in headers(m) for m in mails)
genre = any('Genre: Shoegaze' in m['message'] and m['subject'].endswith('Correction: Shoegaze') for m in mails)
print(('OK   ' if ok else 'ECHEC') + ' contact : %d courriel(s), tous vers l adresse reglee, reponse au visiteur' % len(mails))
print(('OK   ' if genre else 'ECHEC') + ' contact : le genre de la fiche est nomme dans le sujet et le corps')
sys.exit(0 if ok and genre else 1)
PY

say "Journal d erreurs de WordPress"
# The bench is offline on purpose, so core's calls to wordpress.org are expected
# to fail: those warnings say nothing about the plugin.
REAL_ERRORS="$( grep -v 'wordpress\.org\|secure connection\|sendmail' "$SITE/wp-content/debug.log" 2>/dev/null || true )"
if [ -n "$REAL_ERRORS" ]; then
	echo "$REAL_ERRORS"
	echo "des erreurs PHP ont ete enregistrees"
	STATUS=1
else
	echo "aucune erreur PHP imputable a l extension"
fi

echo
echo "captures d ecran : $SHOTS"
exit $STATUS
