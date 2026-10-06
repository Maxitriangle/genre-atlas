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

	// 5b. The dossier: its button leads the panel, it has its own address, and
	// closing it gives the map back.
	if ( ring ) {
		await page.goto( permalink( ring.node ), { waitUntil: 'networkidle' } );
		await page.waitForSelector( '.ga-panel', { timeout: 10000 } );
		const ctas = await page.locator( '.ga-panel .ga-cta' ).allInnerTexts();
		check( 'fiche : OPEN DOSSIER passe avant CENTRE ON dans le panneau',
			ctas.length >= 1 && /OPEN DOSSIER/.test( ctas[ 0 ] ) && ctas.slice( 1 ).every( t => ! /OPEN DOSSIER/.test( t ) ),
			ctas.map( t => t.replace( /\s+/g, ' ' ).trim() ).join( ' | ' ) );
		await page.locator( '.ga-panel [data-about]' ).first().click();
		await page.waitForSelector( '.ga-dossier', { timeout: 10000 } );
		await page.waitForTimeout( 400 );
		const title = ( await page.locator( '.ga-dossier h1' ).innerText() ).trim();
		check( 'fiche : elle s ouvre a sa propre adresse, en /about/',
			page.url().endsWith( '/about/' ) && title.toUpperCase() === ring.node.name.toUpperCase(),
			`${ page.url().replace( BASE, '' ) } · ${ title }` );
		const subs = await page.locator( '.ga-dossier .ga-subs a' ).count();
		check( `fiche : les ${ ring.count } sous-genres reels sont listes`, subs === ring.count, `${ subs } lien(s)` );
		await page.screenshot( { path: `${ SHOTS }/05b-fiche.png`, fullPage: true } );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 500 );
		check( 'fiche : Echap rend la carte', await page.locator( '.ga-map' ).count() === 1 && ! page.url().includes( '/about/' ),
			page.url().replace( BASE, '' ) );

		// Reached straight from its address, as a shared link would.
		await page.goto( `${ permalink( ring.node ) }about/`, { waitUntil: 'networkidle' } );
		await page.waitForSelector( '.ga-dossier', { timeout: 10000 } );
		check( 'fiche : l adresse /about/ ouvre la fiche directement', await page.locator( '.ga-dossier h1' ).count() === 1 );
	}

	// A text imported from Wikipedia is CC BY-SA: the dossier must credit it
	// and link the article. Shoegaze has a lead in genre-import.csv.
	const lead = tree.nodes.find( n => n.name === 'Shoegaze' );
	if ( lead ) {
		await page.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
		await page.waitForSelector( '.ga-dossier', { timeout: 10000 } );
		const lede = await page.locator( '.ga-dossier .ga-lede' ).count();
		const credit = await page.locator( '.ga-dossier .ga-credit a[href*="en.wikipedia.org/wiki/Shoegaze"]' ).count();
		check( 'fiche : le texte Wikipedia est affiche et credite', lede === 1 && credit === 1, `${ lede } chapeau, ${ credit } credit` );

		// Key artists: at most 8, A to Z, each photo credited and its mask served.
		const names = await page.locator( '.ga-dossier .ga-art h3' ).allInnerTexts();
		const key = s => s.toLowerCase().replace( /^the\s+/, '' );
		const sorted = names.every( ( n, i ) => i === 0 || key( names[ i - 1 ] ).localeCompare( key( n ), 'en' ) <= 0 );
		check( 'fiche : les artistes cles sont listes, 8 au plus, de A a Z', names.length > 0 && names.length <= 8 && sorted, names.join( ' · ' ) );
		const photos = await page.locator( '.ga-dossier .ga-aph i' ).count();
		const credits = await page.locator( '.ga-dossier .ga-acredit a[href*="commons.wikimedia.org/wiki/File:"]' ).count();
		const mask = await page.evaluate( () => {
			const i = document.querySelector( '.ga-dossier .ga-aph i' );
			const m = i && getComputedStyle( i ).maskImage.match( /url\("?([^")]+)/ );
			return m ? fetch( m[ 1 ] ).then( r => r.status ) : 0;
		} );
		check( 'fiche : chaque photo d artiste a son credit et son masque', photos > 0 && photos === credits && mask === 200, `${ photos } photo(s), ${ credits } credit(s), masque HTTP ${ mask }` );

		// Listen: one song per key artist, in the artists' order. Nothing is
		// asked of YouTube before PLAY ALL; then the player chains the list.
		const tracks = await page.locator( '.ga-dossier .ga-track .ga-tname .ga-micro' ).allInnerTexts();
		const upper = names.map( n => n.toUpperCase() );
		let at = 0;
		const inOrder = tracks.every( t => ( at = upper.indexOf( t, at ) + 1 ) > 0 );
		const spotify = await page.locator( '.ga-dossier .ga-track a[href^="https://open.spotify.com/search/"]' ).count();
		check( 'ecoute : un titre par artiste cle, dans le meme ordre, chacun avec Spotify', tracks.length > 0 && tracks.length <= names.length && inOrder && spotify === tracks.length,
			`${ tracks.length } titre(s), ${ spotify } lien(s) Spotify` );
		const before = await page.locator( '.ga-dossier .ga-player iframe' ).count();
		await page.locator( '.ga-dsec:has(.ga-tracks)' ).screenshot( { path: `${ SHOTS }/05d-ecoute.png` } ).catch( () => {} );
		await page.route( /youtube(-nocookie)?\.com/, r => r.fulfill( { status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title>' } ) );
		// YouTube plays the playlist parameter from its start and skips the
		// video in the path: the list must open on the song clicked.
		const videos = await page.locator( '.ga-dossier .ga-track a[href^="https://www.youtube.com/watch?v="]' ).evaluateAll( l => l.map( a => a.href.split( 'v=' )[ 1 ] ) );
		const playlist = async sel => {
			await page.locator( sel ).click();
			const src = await page.locator( '.ga-dossier .ga-player iframe' ).getAttribute( 'src' ).catch( () => '' );
			const m = ( src || '' ).match( /^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]{11})\?.*playlist=([\w,-]+)/ );
			return m && m[ 2 ].split( ',' )[ 0 ] === m[ 1 ] ? m[ 2 ].split( ',' ) : [];
		};
		const all = await playlist( '.ga-dossier .ga-listen-head [data-play]' );
		check( 'ecoute : le lecteur YouTube ne se charge qu au clic, puis enchaine la liste depuis le premier titre', before === 0 && all.length > 1 && all.join() === videos.join(),
			`${ before } lecteur avant, ${ all.length } video(s) apres, premiere ${ all[ 0 ] || '-' } pour ${ videos[ 0 ] || '-' }` );
		const second = videos.length > 1 ? await playlist( '.ga-dossier .ga-track:has(a[href*="' + videos[ 1 ] + '"]) .ga-play' ) : [];
		check( 'ecoute : le bouton d un titre lance ce titre, puis la suite', second[ 0 ] === videos[ 1 ] && second.length === videos.length,
			`premiere ${ second[ 0 ] || '-' } pour ${ videos[ 1 ] || '-' }` );
		await page.unroute( /youtube(-nocookie)?\.com/ );
		await page.screenshot( { path: `${ SHOTS }/05c-fiche-wikipedia.png`, fullPage: true } );
	} else {
		check( 'fiche : le genre Shoegaze existe pour tester le credit Wikipedia', false );
	}
	if ( wide ) {
		await centre( page, wide.node );
		await page.locator( '.ga-map .ga-node:not(.centre):not(.anc)' ).first().click();
		await page.waitForTimeout( 400 );
		check( 'fiche : un groupe editorial n a pas de fiche', await page.locator( '.ga-panel [data-about]' ).count() === 0 );
	}

	// 5b. Random: the draw page, a branch filter, then dossier after dossier.
	{
		const children = new Map();
		for ( const n of tree.nodes ) {
			if ( n.p ) { children.set( n.p, [ ...( children.get( n.p ) || [] ), n ] ); }
		}
		// A tile closes the lineage it shows: drawing within Rock leaves Metal out.
		const below = n => ( children.get( n.id ) || [] ).filter( k => ! k.f ).flatMap( k => [ k, ...below( k ) ] );
		const full = n => n.d && n.a;
		const rnd = await newPage( 1440, 900 );
		await rnd.goto( `${ BASE }/`, { waitUntil: 'networkidle' } );
		await rnd.locator( '.ga-nav [data-random]' ).click();
		await rnd.waitForSelector( '.ga-random', { timeout: 10000 } );
		const everything = Number( await rnd.locator( '.ga-random .ga-stats dd' ).innerText() );
		const expected = tree.nodes.filter( full ).length;
		check( 'hasard : le menu RANDOM ouvre la page du tirage, fiches completes seulement', new URL( rnd.url() ).pathname === '/genre/random/' && everything === expected,
			`${ new URL( rnd.url() ).pathname } · ${ everything } genre(s) au tirage pour ${ expected } attendu(s)` );
		await rnd.screenshot( { path: `${ SHOTS }/08-hasard.png`, fullPage: true } );
		if ( territory ) {
			const inside = new Set( below( territory ).map( n => n.id ) );
			await rnd.locator( `.ga-rchip[data-within="${ territory.id }"]` ).click();
			const count = Number( await rnd.locator( '.ga-random .ga-stats dd' ).innerText() );
			const want = below( territory ).filter( full ).length;
			check( `hasard : le filtre « ${ territory.name } » compte ses seuls genres, ni plus ni moins`, count === want && rnd.url().includes( 'within=' ),
				`${ count } genre(s) pour ${ want } attendu(s) · ${ rnd.url().replace( BASE, '' ) }` );
			const drawn = async () => {
				await rnd.waitForURL( /\/about\/$/, { timeout: 10000 } );
				await rnd.waitForSelector( '.ga-dossier h1', { timeout: 10000 } );
				const path = new URL( rnd.url() ).pathname.replace( /about\/$/, '' );
				return tree.nodes.find( n => new URL( permalink( n ) ).pathname === path );
			};
			await rnd.locator( '[data-spin]' ).click();
			const first = await drawn();
			check( 'hasard : SPIN ouvre la fiche d un genre de la branche choisie', !! first && inside.has( first.id ) && full( first ) && await rnd.locator( '.ga-dbar [data-another]' ).count() === 1,
				first ? first.name : rnd.url() );
			await rnd.screenshot( { path: `${ SHOTS }/08b-hasard-fiche.png`, fullPage: false } );
			await rnd.locator( '.ga-dbar [data-another]' ).click();
			await rnd.waitForFunction( u => location.href !== u, rnd.url(), { timeout: 10000 } ).catch( () => {} );
			const second = await drawn();
			check( 'hasard : ANOTHER ONE tire un autre genre, dans la meme branche', !! second && second.id !== first?.id && inside.has( second.id ),
				second ? second.name : rnd.url() );
			// The address carries the filter: it can be shared, and it comes back as it was.
			const branch = permalink( territory ).replace( `${ BASE }/genre/`, '' ).replace( /\/$/, '' );
			await rnd.goto( `${ BASE }/genre/random/?within=${ branch }&sub=1`, { waitUntil: 'networkidle' } );
			await rnd.waitForSelector( '.ga-random', { timeout: 10000 } );
			const on = await rnd.locator( `.ga-rchip.on[data-within="${ territory.id }"]` ).count();
			const sub = await rnd.locator( '[data-ropt="sub"]' ).isChecked();
			await rnd.locator( '[data-spin]' ).click();
			const parent = await drawn();
			check( 'hasard : l adresse garde le filtre, et « with subgenres » ne tire que des genres qui en ont', on === 1 && sub && !! parent && inside.has( parent.id ) && ( children.get( parent.id ) || [] ).length > 0,
				parent ? `${ parent.name }, ${ ( children.get( parent.id ) || [] ).length } sous-genre(s)` : rnd.url() );
		}
		await rnd.close();
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
	if ( ring ) {
		await phone.goto( `${ permalink( ring.node ) }about/`, { waitUntil: 'networkidle' } );
		await phone.waitForSelector( '.ga-dossier', { timeout: 10000 } );
		const width = await phone.evaluate( () => document.documentElement.scrollWidth );
		check( 'mobile : la fiche tient dans la largeur de l ecran', width <= 390, `${ width } px` );
		await phone.screenshot( { path: `${ SHOTS }/07b-fiche-mobile.png`, fullPage: true } );
	}
	if ( lead ) {
		await phone.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
		await phone.waitForSelector( '.ga-dossier .ga-track', { timeout: 10000 } );
		const width = await phone.evaluate( () => document.documentElement.scrollWidth );
		check( 'mobile : la section Listen tient dans la largeur de l ecran', width <= 390, `${ width } px` );
		await phone.screenshot( { path: `${ SHOTS }/07c-ecoute-mobile.png`, fullPage: true } );
	}
	await phone.goto( `${ BASE }/genre/random/`, { waitUntil: 'networkidle' } );
	await phone.waitForSelector( '.ga-random', { timeout: 10000 } );
	{
		const width = await phone.evaluate( () => document.documentElement.scrollWidth );
		const menu = await phone.locator( '.ga-nav [data-random]' ).isVisible();
		check( 'mobile : la page RANDOM tient dans la largeur, et son entree reste dans le menu', width <= 390 && menu, `${ width } px` );
		await phone.screenshot( { path: `${ SHOTS }/08c-hasard-mobile.png`, fullPage: true } );
	}
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
