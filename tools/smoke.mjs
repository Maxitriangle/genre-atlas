/**
 * Walks the atlas in a real browser: index, map, fixed ring, dial, list,
 * mobile tree and the import screen. One screenshot per step.
 *
 * node tools/smoke.mjs <base-url> <shots-dir> [playwright-node-modules] [chromium-binary]
 *
 * Which genres it exercises is derived from the imported data, not hard-coded:
 * it picks a genre with at most 12 children for the fixed ring and one in the
 * 13-40 band for the dial, so the test keeps its meaning as the data grows.
 */
const [ BASE, SHOTS, PW_DIR, BIN ] = process.argv.slice( 2 );

// Playwright may live in a cache outside the project: ESM ignores NODE_PATH,
// so the caller hands us the node_modules directory holding it.
const { chromium } = await import( PW_DIR ? `${ PW_DIR }/playwright/index.mjs` : 'playwright' );

const results = [];
let noise = [];

function check( name, ok, detail = '' ) {
	results.push( { name, ok } );
	console.log( `${ ok ? 'OK   ' : 'ECHEC' } ${ name }${ detail ? ' — ' + detail : '' }` );
}

// Rebuild each genre's permalink from the tree the front end itself reads.
const tree = await fetch( `${ BASE }/wp-json/genre-atlas/v1/tree` ).then( r => r.json() );
const byId = new Map( tree.nodes.map( n => [ n.id, n ] ) );
const kids = new Map();
for ( const n of tree.nodes ) {
	if ( n.p ) { kids.set( n.p, ( kids.get( n.p ) || 0 ) + 1 ); }
}
function permalink( node ) {
	const parts = [];
	for ( let n = node; n; n = byId.get( n.p ) ) { parts.unshift( n.slug ); }
	return `${ BASE }/genre/${ parts.join( '/' ) }/`;
}
function pick( min, max ) {
	const hit = tree.nodes.find( n => {
		const c = kids.get( n.id ) || 0;
		return c >= min && c <= max;
	} );
	return hit ? { node: hit, count: kids.get( hit.id ) } : null;
}

const ring = pick( 4, 12 );   // fixed ring
const dialCase = pick( 13, 40 ); // rotating dial

const browser = await chromium.launch( BIN ? { executablePath: BIN } : {} );

async function newPage( width, height ) {
	const page = await browser.newPage( { viewport: { width, height } } );
	// The bench must not depend on the outside world (gravatar, fonts, ...).
	await page.route( '**/*', route => {
		const host = new URL( route.request().url() ).hostname;
		return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
	} );
	page.on( 'console', m => m.type() === 'error' && noise.push( `console: ${ m.text() }` ) );
	page.on( 'pageerror', e => noise.push( `js: ${ e.message }` ) );
	page.on( 'requestfailed', r => noise.push( `requete: ${ r.url() } ${ r.failure()?.errorText }` ) );
	page.on( 'response', r => r.status() >= 400 && noise.push( `http ${ r.status() }: ${ r.url() }` ) );
	return page;
}

// "#centre" is what tells the atlas to centre on a genre rather than open it.
async function centre( page, node ) {
	await page.goto( `${ permalink( node ) }#centre`, { waitUntil: 'networkidle' } );
	await page.waitForSelector( '.ga-ready', { timeout: 10000 } );
	await page.waitForTimeout( 300 );
}

try {
	// 1. Index of families.
	const page = await newPage( 1440, 900 );
	await page.goto( `${ BASE }/`, { waitUntil: 'networkidle' } );
	await page.waitForSelector( '.ga-ready', { timeout: 10000 } );
	const tiles = await page.locator( '.ga-tile' ).count();
	check( 'index : la grille des familles s affiche', await page.locator( '.ga-index' ).count() === 1 && tiles > 0, `${ tiles } famille(s)` );
	await page.screenshot( { path: `${ SHOTS }/01-index.png`, fullPage: true } );

	// 2. Map.
	await page.locator( '.ga-tile' ).first().click();
	await page.waitForTimeout( 500 );
	check( 'carte : la carte radiale s ouvre', await page.locator( '.ga-map' ).count() === 1 );
	await page.screenshot( { path: `${ SHOTS }/02-carte.png`, fullPage: true } );

	// 3. Fixed ring, at most 12 children.
	if ( ring ) {
		await centre( page, ring.node );
		check( `anneau fixe : « ${ ring.node.name } » (${ ring.count } enfants) sans cadran`, await page.locator( '.ga-dial' ).count() === 0 );
		await page.screenshot( { path: `${ SHOTS }/03-anneau.png`, fullPage: true } );
	}

	// 4. Rotating dial, 13 to 40 children.
	if ( dialCase ) {
		await centre( page, dialCase.node );
		const dial = await page.locator( '.ga-dial' ).count();
		check( `cadran : « ${ dialCase.node.name } » (${ dialCase.count } enfants) affiche le cadran`, dial > 0, dial ? '' : 'aucun .ga-dial' );
		if ( dial ) {
			const caption = () => page.locator( '.ga-dial + .ga-micro' ).first().innerText().catch( () => '' );
			const before = await caption();
			await page.locator( '[data-dial="1"]' ).first().click();
			await page.waitForTimeout( 300 );
			const after = await caption();
			check( 'cadran : la rotation change la fenetre affichee', before !== after && !! before, `${ before.split( ' · ' )[ 0 ] } -> ${ after.split( ' · ' )[ 0 ] }` );
		}
		await page.screenshot( { path: `${ SHOTS }/04-cadran.png`, fullPage: true } );
	}

	// 5. List view.
	await page.locator( '[data-view="list"]' ).first().click();
	await page.waitForTimeout( 400 );
	const rows = await page.locator( '.ga-lrow' ).count();
	check( 'liste : l arbre en liste s affiche', await page.locator( '.ga-list' ).count() === 1 && rows > 0, `${ rows } ligne(s)` );
	await page.screenshot( { path: `${ SHOTS }/05-liste.png`, fullPage: true } );
	await page.close();

	// 6. Mobile: a single vertical tree, no radial map.
	const phone = await newPage( 390, 844 );
	await centre( phone, dialCase ? dialCase.node : byId.get( tree.nodes[ 0 ].id ) );
	const vertical = await phone.locator( '.ga-mobile, .ga-mtree' ).count() > 0;
	check( 'mobile : arbre vertical, carte radiale absente', vertical && await phone.locator( '.ga-map' ).count() === 0 );
	await phone.screenshot( { path: `${ SHOTS }/06-mobile.png`, fullPage: true } );
	await phone.close();

	// 7. Import screen, behind the login.
	const admin = await newPage( 1440, 900 );
	await admin.goto( `${ BASE }/wp-login.php`, { waitUntil: 'networkidle' } );
	await admin.fill( '#user_login', 'admin' );
	await admin.fill( '#user_pass', 'password' );
	await admin.click( '#wp-submit' );
	await admin.waitForLoadState( 'networkidle' );
	await admin.goto( `${ BASE }/wp-admin/edit.php?post_type=genre`, { waitUntil: 'networkidle' } );
	const importLink = admin.locator( 'a', { hasText: /import/i } ).first();
	if ( await importLink.count() ) {
		await importLink.click();
		await admin.waitForLoadState( 'networkidle' );
	}
	const fileInput = await admin.locator( 'input[type="file"]' ).count();
	check( 'import : l ecran d import repond', fileInput > 0, fileInput ? '' : 'pas de champ fichier' );
	await admin.screenshot( { path: `${ SHOTS }/07-import.png`, fullPage: true } );
	await admin.close();
} finally {
	await browser.close();
}

// Calls to the outside world are aborted on purpose above, so the errors they
// raise are the bench working, not the plugin failing.
noise = noise.filter( n => ! /favicon|gravatar|ERR_FAILED|ERR_TUNNEL/.test( n ) );
check( 'aucune erreur navigateur', noise.length === 0, noise.slice( 0, 5 ).join( ' | ' ) );

const failed = results.filter( r => ! r.ok ).length;
console.log( `\n${ results.length - failed }/${ results.length } verifications passees` );
process.exit( failed ? 1 : 0 );
