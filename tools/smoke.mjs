/**
 * Walks the atlas in a real browser: index, map, fixed ring, dial, list,
 * mobile tree and the import screen. One screenshot per step.
 *
 * node tools/smoke.mjs <base-url> <shots-dir> [playwright-node-modules] [chromium-binary]
 *
 * Which genres it exercises is derived from the imported data, not hard-coded:
 * it picks a genre with at most 6 children for the fixed ring and one in the
 * 9-40 band for the dial, so the test keeps its meaning as the data grows.
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

const ring = pick( 4, 8 );         // shown genre by genre
const mid = pick( 9, 40 );         // cut into groups
const wide = pick( 41, Infinity ); // cut into groups, then into subgroups

// A territory: a genre that has a tile on the home page AND a parent. Metal
// under Rock is the case the whole design rests on, so the bench derives it
// from the data rather than naming it.
const territory = tree.nodes.find( n => n.f && n.p );
const territoryChild = territory ? tree.nodes.find( n => n.p === territory.id ) : null;
const territoryRoot = ( () => {
	let n = territory;
	while ( n && n.p && byId.get( n.p ) ) { n = byId.get( n.p ); }
	return n;
} )();

// The colour a genre is drawn in, read off the glyph in its panel.
async function glyphColour( page, node ) {
	await page.goto( permalink( node ), { waitUntil: 'networkidle' } );
	await page.waitForSelector( '.ga-panel-head .ga-glyph', { timeout: 10000 } );
	return page.locator( '.ga-panel-head .ga-glyph circle' ).first().getAttribute( 'stroke' );
}

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
	check( 'index : la grille des familles s affiche', await page.locator( '.ga-index' ).count() === 1 && tiles > 0, `${ tiles } tuile(s)` );
	// A tile closes the displayed lineage: Metal is an entry point in its own
	// right, so no tile announces a family above itself.
	const territories = await page.locator( '.ga-tile-top span:text-matches( "// IN " )' ).count();
	check( 'index : aucune tuile ne se declare sous une famille', territories === 0, `${ territories } tuile(s) avec « // IN »` );
	await page.screenshot( { path: `${ SHOTS }/01-index.png`, fullPage: true } );

	// 1b. A territory is an entry point: the lineage of its subgenres starts at
	// the territory and stops there, and they are drawn in the territory's own
	// colour so the home page tiles stay tellable apart.
	if ( territory && territoryChild && territoryRoot && territoryRoot !== territory ) {
		await page.goto( permalink( territoryChild ), { waitUntil: 'networkidle' } );
		await page.waitForSelector( '.ga-panel-head .fam', { timeout: 10000 } );
		// The panel puts the lineage in capitals, so compare case-insensitively.
		const lineage = ( await page.locator( '.ga-panel-head .fam' ).first().innerText() ).toUpperCase();
		check(
			`territoire : la lignee de « ${ territoryChild.name } » part de « ${ territory.name } » sans remonter a « ${ territoryRoot.name } »`,
			lineage.includes( territory.name.toUpperCase() ) && ! lineage.includes( territoryRoot.name.toUpperCase() ),
			lineage.trim()
		);
		const [ childColour, territoryColour, rootColour ] = [
			await glyphColour( page, territoryChild ),
			await glyphColour( page, territory ),
			await glyphColour( page, territoryRoot ),
		];
		check(
			`territoire : « ${ territory.name } » a sa propre couleur`,
			childColour === territoryColour && territoryColour !== rootColour,
			`${ territoryColour } vs ${ rootColour }`
		);
		await page.goto( `${ BASE }/`, { waitUntil: 'networkidle' } );
		await page.waitForSelector( '.ga-ready', { timeout: 10000 } );
	}

	// 2. Map.
	await page.locator( '.ga-tile' ).first().click();
	await page.waitForTimeout( 500 );
	check( 'carte : la carte radiale s ouvre', await page.locator( '.ga-map' ).count() === 1 );
	await page.screenshot( { path: `${ SHOTS }/02-carte.png`, fullPage: true } );

	// 3. Fixed ring, at most 8 children.
	if ( ring ) {
		await centre( page, ring.node );
		check( `anneau fixe : « ${ ring.node.name } » (${ ring.count } enfants) sans cadran`, await page.locator( '.ga-dial' ).count() === 0 );
		await page.screenshot( { path: `${ SHOTS }/03-anneau.png`, fullPage: true } );
	}

	// 4. Between 9 and 40 children: cut into groups, and no dial left to turn.
	if ( mid ) {
		await centre( page, mid.node );
		const nodes = await page.locator( '.ga-map .ga-node:not(.centre):not(.anc)' ).count();
		check( `regroupement : « ${ mid.node.name } » (${ mid.count } enfants) tient en ${ nodes } noeuds sans cadran`,
			nodes >= 2 && nodes <= 8 && await page.locator( '.ga-dial' ).count() === 0,
			`${ nodes } noeud(s), cadran ${ await page.locator( '.ga-dial' ).count() ? 'present' : 'absent' }` );
		await page.screenshot( { path: `${ SHOTS }/04-cadran.png`, fullPage: true } );
	}

	// 5. A branch too wide to show one genre at a time is shown as groups.
	if ( wide ) {
		await centre( page, wide.node );
		const groups = await page.locator( '.ga-map .ga-node:not(.centre):not(.anc)' ).count();
		check( `groupes : « ${ wide.node.name } » (${ wide.count } enfants) tient en ${ groups } groupes sans cadran`,
			groups >= 2 && groups <= 8 && await page.locator( '.ga-dial' ).count() === 0,
			`${ groups } groupe(s), cadran ${ await page.locator( '.ga-dial' ).count() ? 'present' : 'absent' }` );
		// The point of the editorial groups: a wide branch is cut by scene or
		// region, never by decade. "1960S" and "UNDATED" are the fallback the
		// atlas uses only where nothing has been named.
		const labels = await page.locator( '.ga-map .ga-node:not(.centre):not(.anc) .ga-name' ).allInnerTexts();
		const decades = labels.filter( l => /^\s*(\d{4}S|UNDATED)\s*$/i.test( l ) );
		check( `groupes : « ${ wide.node.name } » est coupe par theme, pas par decennie`,
			labels.length > 0 && decades.length === 0,
			labels.join( ' · ' ).slice( 0, 120 ) );
		await page.screenshot( { path: `${ SHOTS }/05-groupes.png`, fullPage: true } );

		// A group opens onto its genres, and those keep their own address.
		await page.locator( '.ga-map .ga-node:not(.centre):not(.anc)' ).first().click();
		await page.waitForTimeout( 500 );
		check( 'groupes : un groupe s ouvre sur ses genres', await page.locator( '.ga-leaf' ).count() > 0 );
		const leaf = page.locator( '.ga-leaf:not(.more)' ).first();
		if ( await leaf.count() ) {
			await leaf.click();
			await page.waitForTimeout( 500 );
			const url = page.url();
			check( 'groupes : le genre garde son adresse reelle', /\/genre\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/.test( url ) && ! /\d{4}s/i.test( url ), url.replace( BASE, '' ) );
		}
	}

	// 6. List view.
	await page.locator( '[data-view="list"]' ).first().click();
	await page.waitForTimeout( 400 );
	const rows = await page.locator( '.ga-lrow' ).count();
	check( 'liste : l arbre en liste s affiche', await page.locator( '.ga-list' ).count() === 1 && rows > 0, `${ rows } ligne(s)` );
	await page.screenshot( { path: `${ SHOTS }/06-liste.png`, fullPage: true } );
	await page.close();

	// 7. Mobile: a single vertical tree, no radial map.
	const phone = await newPage( 390, 844 );
	await centre( phone, mid ? mid.node : byId.get( tree.nodes[ 0 ].id ) );
	const vertical = await phone.locator( '.ga-mobile, .ga-mtree' ).count() > 0;
	check( 'mobile : arbre vertical, carte radiale absente', vertical && await phone.locator( '.ga-map' ).count() === 0 );
	await phone.screenshot( { path: `${ SHOTS }/07-mobile.png`, fullPage: true } );
	await phone.close();

	// 8. Import screen, behind the login.
	const admin = await newPage( 1440, 900 );
	await admin.goto( `${ BASE }/wp-login.php`, { waitUntil: 'networkidle' } );
	await admin.fill( '#user_login', 'admin' );
	await admin.fill( '#user_pass', 'password' );
	await admin.click( '#wp-submit' );
	await admin.waitForLoadState( 'networkidle' );
	await admin.goto( `${ BASE }/wp-admin/edit.php?post_type=genre`, { waitUntil: 'networkidle' } );
	// With a complete import file no branch is left without groups, so the
	// stale-data warning must stay silent. It is the only thing that tells
	// Maxime his CSV is older than his plugin.
	const warn = await admin.locator( '.notice-warning', { hasText: /no group/i } ).count();
	check( 'admin : aucun avertissement de groupes manquants', warn === 0, warn ? `${ warn } avertissement(s)` : '' );
	const importLink = admin.locator( 'a', { hasText: /import/i } ).first();
	if ( await importLink.count() ) {
		await importLink.click();
		await admin.waitForLoadState( 'networkidle' );
	}
	const fileInput = await admin.locator( 'input[type="file"]' ).count();
	check( 'import : l ecran d import repond', fileInput > 0, fileInput ? '' : 'pas de champ fichier' );
	await admin.screenshot( { path: `${ SHOTS }/08-import.png`, fullPage: true } );
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
