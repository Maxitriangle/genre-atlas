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
\$stats = Genre_Atlas_Importer::import( '$REPO/data/genre-import.csv' );
if ( is_wp_error( \$stats ) ) { fwrite( STDERR, \$stats->get_error_message() . \"\n\" ); exit( 1 ); }
foreach ( \$stats as \$k => \$v ) { echo str_pad( \$k, 20 ) . \$v . \"\n\"; }
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

say "Serveur sur http://127.0.0.1:$PORT"
php -S "127.0.0.1:$PORT" -t "$SITE" "$SITE/router.php" > "$CACHE/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do
	curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
	sleep 0.5
done
curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || { echo "le serveur ne repond pas"; tail -20 "$CACHE/server.log"; exit 1; }

say "Navigateur"
if [ ! -d "$CACHE/node_modules/playwright" ]; then
	( cd "$CACHE" && npm install playwright --no-audit --no-fund --silent )
fi
# The image ships a Chromium that may not match the version Playwright expects.
CHROME="$( find /opt/pw-browsers -maxdepth 3 -path '*chrome-linux/chrome' 2>/dev/null | head -1 )"
mkdir -p "$SHOTS"; rm -f "$SHOTS"/*.png

set +e
node "$REPO/tools/smoke.mjs" "http://127.0.0.1:$PORT" "$SHOTS" "$CACHE/node_modules" "$CHROME"
STATUS=$?
set -e

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
