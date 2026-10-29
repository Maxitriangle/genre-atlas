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

	// 8. Contact: the menu entry, the checks before sending, a message sent from
	// a dossier, the honeypot and the cap per connection. Mail is caught by the
	// bench and read back by test-local.sh.
	const marker = `SMOKE-${ Date.now() }`;
	const spam = `SPAM-${ Date.now() }`;
	{
		const ct = await newPage( 1440, 900 );
		const api = [];
		ct.on( 'request', r => r.url().includes( '/genre-atlas/v1/contact' ) && api.push( r.url() ) );
		await ct.goto( `${ BASE }/`, { waitUntil: 'networkidle' } );
		await ct.waitForSelector( '.ga-ready', { timeout: 10000 } );
		await ct.locator( '.ga-nav [data-contact]' ).click();
		await ct.waitForSelector( '.ga-contact form', { timeout: 10000 } );
		check( 'contact : le menu CONTACT ouvre le formulaire, a l adresse /contact/', new URL( ct.url() ).pathname === '/contact/', ct.url().replace( BASE, '' ) );
		await ct.screenshot( { path: `${ SHOTS }/09-contact.png`, fullPage: true } );
		await ct.locator( '.ga-csend' ).click();
		const bad = await ct.locator( '.ga-cfield.bad' ).count();
		check( 'contact : un envoi vide est arrete avant de partir, message et adresse signales', bad === 2 && api.length === 0, `${ bad } champ(s) signale(s), ${ api.length } requete(s)` );

		if ( lead ) {
			await ct.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
			const loaded = Date.now();
			await ct.waitForSelector( '.ga-dossier .ga-cfix', { timeout: 10000 } );
			await ct.locator( '.ga-cfix' ).click();
			await ct.waitForSelector( '.ga-contact form', { timeout: 10000 } );
			const named = ( await ct.locator( '.ga-cgenre b' ).innerText() ).trim();
			const topic = await ct.locator( 'input[name="topic"]:checked' ).getAttribute( 'value' );
			check( 'contact : SUGGEST A CORRECTION arrive avec le genre et le sujet deja remplis', named.toLowerCase() === lead.name.toLowerCase() && topic === 'correction' && ct.url().includes( 'genre=' ),
				`${ named }, ${ topic }, ${ ct.url().replace( BASE, '' ) }` );
			await ct.fill( '#ga-cmsg', `${ marker } The origin of this genre looks wrong to me.` );
			await ct.fill( '#ga-cname', 'Smoke Test' );
			await ct.fill( '#ga-cemail', 'visitor@example.test' );
			const reply = ( await ct.locator( '#ga-ct-reply' ).innerText() ).trim();
			await ct.waitForTimeout( Math.max( 0, 3300 - ( Date.now() - loaded ) ) ); // a person takes longer than 3 s
			await ct.locator( '.ga-csend' ).click();
			await ct.waitForSelector( '.ga-csent', { timeout: 10000 } );
			check( 'contact : le message part et la confirmation s affiche', reply === 'visitor@example.test' && api.length === 1, `${ api.length } envoi(s)` );
			await ct.screenshot( { path: `${ SHOTS }/09b-contact-envoye.png`, fullPage: true } );

			// Straight to the API, as a bot would: the token is the page's own.
			const token = await ct.evaluate( () => window.GENRE_ATLAS.contactToken );
			const post = body => fetch( `${ BASE }/wp-json/genre-atlas/v1/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { token, name: 'Smoke Test', email: 'visitor@example.test', topic: 'feedback', ...body } ) } );
			const trap = await post( { message: `${ spam } buy now`, website: 'http://spam.example' } );
			const codes = [];
			for ( let i = 0; i < 5; i++ ) { codes.push( ( await post( { message: `${ marker } extra message ${ i }` } ) ).status ); }
			check( 'contact : au-dela de 5 messages par heure, la connexion est refusee', trap.status === 200 && codes.join() === '200,200,200,200,429', `piege ${ trap.status }, puis ${ codes.join( ' ' ) }` );
		}
		await ct.close();

		const phone2 = await newPage( 390, 844 );
		await phone2.goto( `${ BASE }/contact/`, { waitUntil: 'networkidle' } );
		await phone2.waitForSelector( '.ga-contact form', { timeout: 10000 } );
		const width = await phone2.evaluate( () => document.documentElement.scrollWidth );
		const menu = await phone2.locator( '.ga-nav [data-contact]' ).isVisible();
		check( 'mobile : la page CONTACT tient dans la largeur, et son entree reste dans le menu', width <= 390 && menu, `${ width } px` );
		await phone2.screenshot( { path: `${ SHOTS }/09c-contact-mobile.png`, fullPage: true } );
		await phone2.close();
	}

	// 8b. Community picks: suggested from a dossier, refused off the list of
	// platforms or twice, then approved in the admin below and shown.
	const pickName = 'Smoke Pick Artist';
	const pickUrl = 'https://open.spotify.com/artist/0oSGxfWSnnOXhD2fKuz2Gy';
	let pickToken = '';
	if ( lead ) {
		const pk = await newPage( 1440, 900 );
		const api = [];
		pk.on( 'request', r => r.url().includes( '/genre-atlas/v1/pick' ) && api.push( r.url() ) );
		await pk.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
		const loaded = Date.now();
		await pk.waitForSelector( '.ga-dossier [data-popen]', { timeout: 10000 } );
		const order = await pk.locator( '.ga-dsec h2' ).allInnerTexts();
		const empty = await pk.locator( '.ga-pempty' ).count();
		check( 'propositions : la section COMMUNITY PICKS suit LISTEN et invite a proposer', order.indexOf( 'COMMUNITY PICKS' ) === order.indexOf( 'LISTEN' ) + 1 && empty === 1, order.join( ' · ' ) );
		await pk.locator( '[data-popen]' ).click();
		await pk.fill( '#ga-purl', 'https://example.com/some-artist' );
		await pk.fill( '#ga-pname', pickName );
		await pk.locator( '.ga-pform .ga-csend' ).click();
		const refused = await pk.locator( '#ga-perr-url' ).count();
		check( 'propositions : un lien hors des plateformes est refuse avant l envoi', refused === 1 && api.length === 0, `${ api.length } requete(s)` );
		await pk.fill( '#ga-purl', `${ pickUrl }?si=tracking123` );
		const detected = ( await pk.locator( '#ga-pnote-url' ).innerText() ).trim();
		const cleared = await pk.locator( '#ga-perr-url' ).count() === 0;
		await pk.fill( '#ga-pby', 'Smoke' );
		await pk.fill( '#ga-pnote', 'The band that started it all, for me.' );
		await pk.screenshot( { path: `${ SHOTS }/10-propositions-formulaire.png`, fullPage: false, clip: await pk.locator( '.ga-dsec', { hasText: 'COMMUNITY PICKS' } ).boundingBox() } );
		await pk.waitForTimeout( Math.max( 0, 3300 - ( Date.now() - loaded ) ) );
		await pk.locator( '.ga-pform .ga-csend' ).click();
		await pk.waitForSelector( '.ga-pdone', { timeout: 10000 } );
		check( 'propositions : la plateforme est reconnue et la proposition part en attente', detected === 'DETECTED: SPOTIFY' && cleared && api.length === 1 && await pk.locator( '.ga-pick' ).count() === 0, detected );
		const token = await pk.evaluate( () => window.GENRE_ATLAS.contactToken );
		pickToken = token;
		const twice = await fetch( `${ BASE }/wp-json/genre-atlas/v1/pick`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { token, genre: lead.id, kind: 'artist', url: pickUrl, name: pickName } ) } );
		check( 'propositions : le meme lien pour le meme genre est refuse', twice.status === 409, `HTTP ${ twice.status }` );
		await pk.close();

		const phone3 = await newPage( 390, 844 );
		await phone3.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
		await phone3.waitForSelector( '.ga-dossier [data-popen]', { timeout: 10000 } );
		await phone3.locator( '[data-popen]' ).click();
		const width = await phone3.evaluate( () => document.documentElement.scrollWidth );
		check( 'mobile : le formulaire de proposition tient dans la largeur', width <= 390, `${ width } px` );
		await phone3.close();
	}

	// 8c. What search engines and link previews read: the page as the server
	// sends it, before any script runs.
	if ( lead ) {
		const about = `${ permalink( lead ) }about/`;
		const raw = await fetch( permalink( lead ) ).then( r => r.text() );
		const head = raw.slice( 0, raw.indexOf( '</head>' ) );
		const canonical = ( head.match( /<link rel=["']canonical["'] href=["']([^"']+)/ ) || [] )[ 1 ];
		const description = ( head.match( /<meta name="description" content="([^"]+)"/ ) || [] )[ 1 ] || '';
		const image = ( head.match( /<meta property="og:image" content="([^"]+)"/ ) || [] )[ 1 ];
		check( 'moteurs : la carte d un genre renvoie a sa fiche, avec un resume tire du texte', canonical === about && description.startsWith( 'Shoegaze' ) && description.length <= 160,
			`${ ( canonical || 'pas de canonique' ).replace( BASE, '' ) } · ${ description.length } car.` );
		const png = image ? await fetch( image ) : null;
		const bytes = png && png.ok ? new Uint8Array( await png.arrayBuffer() ) : new Uint8Array();
		const wide = bytes.length > 24 ? ( bytes[ 16 ] << 24 | bytes[ 17 ] << 16 | bytes[ 18 ] << 8 | bytes[ 19 ] ) : 0;
		check( 'partage : l image d apercu du genre est un PNG de 1200 px', /image\/png/.test( png?.headers.get( 'content-type' ) || '' ) && wide === 1200, image ? image.replace( BASE, '' ) : 'pas d og:image' );
		let ld = null;
		try { ld = JSON.parse( ( head.match( /<script type="application\/ld\+json">([\s\S]*?)<\/script>/ ) || [] )[ 1 ] ); } catch ( e ) { ld = null; }
		const crumbs = ld?.[ '@graph' ]?.find( g => g[ '@type' ] === 'WebPage' )?.breadcrumb?.itemListElement || [];
		check( 'moteurs : la lignee est decrite en donnees structurees', crumbs.length >= 3 && crumbs[ crumbs.length - 1 ].item === about, crumbs.map( c => c.name ).join( ' > ' ) );
		const body = raw.slice( raw.indexOf( 'ga-fallback' ) );
		const artistsInPage = ( body.match( /<h2>Key [^<]+ artists<\/h2><ul>([\s\S]*?)<\/ul>/ ) || [] )[ 1 ] || '';
		check( 'moteurs : la fiche est dans la page sans script : texte, artistes, lien vers le parent', /<h1>Shoegaze<\/h1>/.test( body ) && /Wikipedia<\/a>, <a href="https:\/\/creativecommons/.test( body )
			&& ( artistsInPage.match( /<li>/g ) || [] ).length > 0 && body.includes( `href="${ permalink( tree.nodes.find( n => n.id === lead.p ) ) }about/"` ),
			`${ ( artistsInPage.match( /<li>/g ) || [] ).length } artiste(s)` );
		const home = await fetch( `${ BASE }/` ).then( r => r.text() );
		const familyLinks = ( home.match( /<h2><a href="[^"]+\/about\/">/g ) || [] ).length;
		check( 'moteurs : l accueil sans script mene a chaque famille et a ses sous-genres', familyLinks === tree.nodes.filter( n => n.f || ! n.p ).length, `${ familyLinks } famille(s)` );
		const random = await fetch( `${ BASE }/genre/random/` ).then( r => r.text() );
		check( 'moteurs : la page du hasard n est pas indexee', /<meta name='robots' content='[^']*noindex/.test( random ) );
		const map = await fetch( `${ BASE }/wp-sitemap.xml` ).then( r => r.text() );
		const genres = await fetch( `${ BASE }/wp-sitemap-posts-genre-1.xml` ).then( r => r.text() );
		const locs = ( genres.match( /<loc>[^<]+<\/loc>/g ) || [] );
		check( 'moteurs : le plan du site donne les fiches, sans la page des utilisateurs', locs.length > 0 && locs.every( l => l.endsWith( '/about/</loc>' ) ) && ! /sitemap-users/.test( map ), `${ locs.length } fiche(s)` );
		const ico = await fetch( `${ BASE }/favicon.ico` );
		const icons = ( head.match( /<link rel="(icon|apple-touch-icon)"[^>]*assets\/icons\//g ) || [] ).length;
		check( 'favicon : l icone du site remplace le logo WordPress, partout', ico.ok && /image\/png/.test( ico.headers.get( 'content-type' ) || '' ) && /assets\/icons\//.test( ico.url ) && icons >= 3, `${ icons } lien(s) d icone` );

		// Without a script the page must read as a page, and with one the plain
		// version must not flash before the dossier.
		const plain = await browser.newPage( { viewport: { width: 1440, height: 900 }, javaScriptEnabled: false } );
		await plain.route( '**/*', route => [ '127.0.0.1', 'localhost' ].includes( new URL( route.request().url() ).hostname ) ? route.continue() : route.abort() );
		await plain.goto( about, { waitUntil: 'networkidle' } );
		const shown = await plain.locator( '.ga-fallback h1' ).isVisible();
		await plain.screenshot( { path: `${ SHOTS }/11-sans-script.png`, fullPage: false } );
		await plain.close();
		const live = await newPage( 1440, 900 );
		let flashed = false;
		await live.goto( about, { waitUntil: 'commit' } );
		// Once the script has drawn, the plain version is gone from the page: a
		// detached element has no style at all, which is not a flash either.
		flashed = await live.locator( '.ga-fallback h1' ).evaluate( el => el.isConnected && getComputedStyle( el.closest( '.ga-fallback' ) ).opacity !== '0', null, { timeout: 5000 } ).catch( () => false );
		await live.waitForSelector( '.ga-dossier h1', { timeout: 10000 } );
		await live.close();
		check( 'moteurs : la version sans script se lit seule, et ne s affiche pas avant la fiche', shown && ! flashed, `sans script ${ shown ? 'visible' : 'invisible' }, ${ flashed ? 'eclair' : 'pas d eclair' }` );
	}

	// 8d. Legal notice and privacy: reached from the index, the forms point to
	// it, and what it promises holds (no cookie, nothing fetched from outside
	// before a click).
	{
		const lg = await newPage( 1440, 900 );
		const outside = [];
		lg.on( 'request', r => { const h = new URL( r.url() ).hostname; if ( h !== '127.0.0.1' && h !== 'localhost' ) outside.push( r.url() ); } );
		await lg.goto( `${ BASE }/`, { waitUntil: 'networkidle' } );
		await lg.waitForSelector( '.ga-ready', { timeout: 10000 } );
		await lg.locator( '.ga-foot a' ).click();
		await lg.waitForURL( /\/legal\/$/, { timeout: 10000 } );
		await lg.waitForSelector( '.ga-legal-text section', { timeout: 10000 } );
		const heads = await lg.locator( '.ga-legal-text h2' ).allInnerTexts();
		const text = await lg.locator( '.ga-legal-text' ).innerText();
		check( 'legal : le pied de l index ouvre la page, avec editeur, hebergeur, donnees, cookies, droits et credits',
			heads.length === 6 && /o2switch/i.test( text ) && /CNIL/.test( text ) && /CC BY-SA/.test( text ) && ( await lg.title() ).startsWith( 'Legal notice' ), heads.join( ' · ' ) );
		await lg.screenshot( { path: `${ SHOTS }/12-legal.png`, fullPage: true } );
		if ( lead ) {
			await lg.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
			await lg.waitForSelector( '.ga-dossier h1', { timeout: 10000 } );
		}
		const cookies = await lg.context().cookies();
		check( 'legal : aucun cookie depose et rien demande a l exterieur sur l index, la fiche et cette page', cookies.length === 0 && outside.length === 0,
			`${ cookies.length } cookie(s) ${ cookies.map( c => c.name ).join( ' ' ) }, ${ outside.length } requete(s) ${ outside.slice( 0, 3 ).join( ' ' ) }` );
		await lg.goto( `${ BASE }/contact/`, { waitUntil: 'networkidle' } );
		await lg.waitForSelector( '.ga-cform', { timeout: 10000 } );
		const priv = await lg.locator( '.ga-cform .ga-cpriv a' ).getAttribute( 'href' );
		await lg.goto( priv, { waitUntil: 'networkidle' } );
		await lg.waitForSelector( '.ga-legal-text section', { timeout: 10000 } );
		const top = await lg.locator( '#what-this-site-keeps' ).evaluate( el => Math.round( el.getBoundingClientRect().top ) );
		check( 'legal : le formulaire de contact renvoie a la section des donnees, qui s affiche en haut', /\/legal\/#what-this-site-keeps$/.test( priv ) && top >= 0 && top < 120, `section a ${ top } px` );
		await lg.close();
		// The foot of every page leads to the legal notice, the map included.
		const feet = [];
		const fp = await newPage( 1440, 900 );
		for ( const [ label, url, sel ] of [ [ 'fiche', lead ? `${ permalink( lead ) }about/` : `${ BASE }/`, '.ga-dossier' ], [ 'carte', lead ? permalink( lead ) : `${ BASE }/`, '.ga-panel' ],
			[ 'hasard', `${ BASE }/genre/random/`, 'main' ], [ 'contact', `${ BASE }/contact/`, '.ga-contact' ], [ 'legende', `${ BASE }/#legend`, 'main' ] ] ) {
			await fp.goto( url, { waitUntil: 'networkidle' } );
			await fp.waitForSelector( '.ga-ready', { timeout: 10000 } );
			if ( label === 'legende' ) { await fp.locator( '[data-legend]' ).first().click(); await fp.waitForSelector( '.ga-legend' ); }
			if ( await fp.locator( `${ sel } .ga-foot a[href$="/legal/"]` ).count() === 0 ) feet.push( label );
		}
		await fp.close();
		check( 'legal : le pied de chaque page mene a la page legale (fiche, carte, hasard, contact, legende)', feet.length === 0, feet.length ? `manque sur ${ feet.join( ', ' ) }` : '' );

		// Audience measurement (Matomo, played by the bench): each page is
		// counted once, even without a reload, and the legal page lets a
		// visitor stop it, with the one cookie that remembers the choice.
		const mt = await newPage( 1440, 900 );
		await mt.goto( `${ BASE }/`, { waitUntil: 'networkidle' } );
		await mt.waitForSelector( '.ga-ready', { timeout: 10000 } );
		await mt.locator( '.ga-tile' ).first().click();
		await mt.waitForURL( /\/genre\/[^/]+\/$/, { timeout: 10000 } );
		await mt.locator( '[data-legend]' ).first().click();
		const views = await mt.evaluate( () => window.__views );
		check( 'mesure : chaque page est comptee une fois, meme sans rechargement, avec son adresse', views.length === 2 && new URL( views[ 1 ].url ).pathname.startsWith( '/genre/' ),
			views.map( v => new URL( v.url ).pathname ).join( ' → ' ) );
		await mt.goto( `${ BASE }/legal/`, { waitUntil: 'networkidle' } );
		await mt.waitForSelector( '#ga-optout [data-optout="1"]', { timeout: 10000 } );
		const counted = await mt.locator( '#ga-optout' ).innerText();
		await mt.locator( '[data-optout="1"]' ).click();
		await mt.waitForSelector( '[data-optout="0"]', { timeout: 5000 } );
		const stored = ( await mt.context().cookies() ).map( c => c.name );
		await mt.locator( '.ga-foot a' ).first().click(); // same page again: nothing to count
		await mt.waitForLoadState( 'networkidle' );
		await mt.waitForSelector( '.ga-ready', { timeout: 10000 } );
		await mt.goto( `${ BASE }/`, { waitUntil: 'networkidle' } );
		await mt.waitForSelector( '.ga-ready', { timeout: 10000 } );
		await mt.locator( '.ga-tile' ).first().click();
		await mt.waitForURL( /\/genre\/[^/]+\/$/, { timeout: 10000 } );
		const after = await mt.evaluate( () => window.__views.length );
		await mt.goto( `${ BASE }/legal/`, { waitUntil: 'networkidle' } );
		await mt.locator( '[data-optout="0"]' ).click();
		await mt.waitForSelector( '[data-optout="1"]', { timeout: 5000 } );
		const cleared = ( await mt.context().cookies() ).length === 0;
		check( 'mesure : le refus d etre compte marche, ne pose que son cookie, et se reprend', /COUNTED, WITHOUT A COOKIE/.test( counted ) && stored.join() === 'mtm_consent_removed' && after === 0 && cleared,
			`cookies ${ stored.join( ' ' ) || 'aucun' }, ${ after } page(s) comptee(s) apres refus` );
		await mt.close();

		const phone4 = await newPage( 390, 844 );
		await phone4.goto( `${ BASE }/legal/`, { waitUntil: 'networkidle' } );
		await phone4.waitForSelector( '.ga-legal-text section', { timeout: 10000 } );
		const width = await phone4.evaluate( () => document.documentElement.scrollWidth );
		check( 'mobile : la page legale tient dans la largeur', width <= 390, `${ width } px` );
		await phone4.close();
	}

	// 9. Import screen, behind the login.
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
	await admin.screenshot( { path: `${ SHOTS }/08-import.png`, fullPage: true } );
	await admin.goto( `${ BASE }/wp-admin/edit.php?post_type=ga_message`, { waitUntil: 'networkidle' } );
	const kept = await admin.locator( '#the-list tr' ).count();
	// One sent from the page and four through the API; the trapped one is not kept.
	check( 'contact : les messages sont gardes dans WordPress, sauf celui du piege', kept === 5, `${ kept } message(s)` );
	await admin.screenshot( { path: `${ SHOTS }/09d-messages.png`, fullPage: true } );
	if ( lead ) {
		await admin.goto( `${ BASE }/wp-admin/edit.php?post_type=ga_pick`, { waitUntil: 'networkidle' } );
		const badge = ( await admin.locator( '#menu-posts-ga_pick .awaiting-mod' ).innerText() ).trim();
		const row = admin.locator( '#the-list tr', { hasText: pickName } );
		check( 'propositions : en attente dans Suggestions, avec le compteur au menu', badge === '1' && await row.count() === 1 && /Waiting/.test( await row.innerText() ), `pastille « ${ badge } »` );
		await admin.screenshot( { path: `${ SHOTS }/10b-suggestions.png`, fullPage: true } );
		// Row actions only show on hover: follow the link itself, with its nonce.
		const approve = await row.locator( 'a', { hasText: 'Approve' } ).getAttribute( 'href' );
		await admin.goto( new URL( approve, `${ BASE }/wp-admin/` ).href.replace( /&amp;/g, '&' ), { waitUntil: 'networkidle', referer: admin.url() } );
		await admin.goto( `${ BASE }/wp-admin/edit.php?post_type=ga_pick`, { waitUntil: 'networkidle' } );
		const online = /Online/.test( await admin.locator( '#the-list tr', { hasText: pickName } ).innerText() );
		await admin.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
		await admin.waitForSelector( '.ga-pick', { timeout: 10000 } );
		const shown = await admin.locator( '.ga-pick' ).innerText();
		const href = await admin.locator( '.ga-pick .ga-pout' ).getAttribute( 'href' );
		check( 'propositions : approuvee en un clic, elle s affiche sur la fiche, lien nettoye', online && shown.includes( pickName.toUpperCase() ) && shown.includes( 'PICKED BY SMOKE' ) && href === pickUrl,
			`${ href }` );
		await admin.locator( '.ga-dsec', { hasText: 'COMMUNITY PICKS' } ).screenshot( { path: `${ SHOTS }/10c-propositions-fiche.png` } );

		// 9b. Approved links checked: the platforms are played by the bench, and
		// a link with "smoke-gone" in it is not found.
		const goneName = 'Smoke Gone Playlist';
		const sent = await fetch( `${ BASE }/wp-json/genre-atlas/v1/pick`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { token: pickToken, genre: lead.id, kind: 'playlist', url: 'https://open.spotify.com/playlist/smoke-gone', name: goneName } ) } );
		const picks = `${ BASE }/wp-admin/edit.php?post_type=ga_pick`;
		const rowAction = async ( name, label ) => {
			await admin.goto( picks, { waitUntil: 'networkidle' } );
			const href = await admin.locator( '#the-list tr', { hasText: name } ).locator( 'a', { hasText: label } ).getAttribute( 'href' );
			await admin.goto( new URL( href, `${ BASE }/wp-admin/` ).href.replace( /&amp;/g, '&' ), { waitUntil: 'networkidle', referer: picks } );
		};
		const rowText = async name => {
			await admin.goto( picks, { waitUntil: 'networkidle' } );
			return admin.locator( '#the-list tr', { hasText: name } ).innerText();
		};
		await rowAction( goneName, 'Approve' );
		await rowAction( pickName, 'Check link' );
		check( 'liens : Check link verifie un lien tout de suite', sent.status === 200 && /Link OK/.test( await rowText( pickName ) ), `envoi HTTP ${ sent.status }` );
		const run = days => fetch( `${ BASE }/wp-json/smoke/v1/check-picks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { days } ) } ).then( r => r.json() );
		const first = await run( 8 );
		const once = await rowText( goneName );
		const quiet = await admin.locator( '.notice-error', { hasText: 'no longer answer' } ).count() === 0;
		check( 'liens : la verification quotidienne est programmee, et un premier « introuvable » ne signale rien', first.scheduled && /Not found once/.test( once ) && ! /Broken/.test( once ) && quiet, once.split( '\n' ).pop() );
		await run( 9 );
		const twice = await rowText( goneName );
		const broken = ( await admin.locator( '#menu-posts-ga_pick .awaiting-mod' ).innerText() ).trim();
		const notice = await admin.locator( '.notice-error', { hasText: 'no longer answer' } ).innerText();
		await admin.screenshot( { path: `${ SHOTS }/10d-liens-morts.png`, fullPage: true } );
		await admin.goto( `${ picks }&ga_broken=1`, { waitUntil: 'networkidle' } );
		const listed = await admin.locator( '#the-list tr' ).allInnerTexts();
		check( 'liens : au second « introuvable », le lien est signale, nomme et compte au menu', /Broken link/.test( twice ) && broken === '1' && notice.includes( goneName ) && ! notice.includes( pickName )
			&& listed.length === 1 && listed[ 0 ].includes( goneName ) && /Link OK/.test( await rowText( pickName ) ), `pastille « ${ broken } », ${ listed.length } ligne(s) dans Broken links` );
		await admin.goto( `${ permalink( lead ) }about/`, { waitUntil: 'networkidle' } );
		await admin.waitForSelector( '.ga-pick', { timeout: 10000 } );
		const still = await admin.locator( '.ga-pick', { hasText: goneName.toUpperCase() } ).count();
		check( 'liens : un lien signale reste sur la fiche, la decision revient a Maxime', still === 1 );
	}
	// 9c. Listening examples: test-local.sh proposed two made-up videos for a
	// genre with no key artist. Nothing shows before a decision; a rejected
	// video makes way for the next; an accepted one plays on the dossier.
	const exNode = byId.get( Number( process.env.GA_EXAMPLE_GENRE || 0 ) );
	if ( exNode ) {
		const exAbout = `${ permalink( exNode ) }about/`;
		const listenNow = async () => {
			await admin.goto( exAbout, { waitUntil: 'networkidle' } );
			await admin.waitForSelector( '.ga-dossier h1', { timeout: 10000 } );
			await admin.waitForTimeout( 300 );
			return admin.locator( '#ga-d-listen' ).count();
		};
		const hidden = await listenNow() === 0 && ! /Example:/.test( await ( await fetch( exAbout ) ).text() );
		const screen = `${ BASE }/wp-admin/edit.php?post_type=genre&page=genre-atlas-examples&genre=${ exNode.id }`;
		await admin.goto( screen, { waitUntil: 'networkidle' } );
		const badge = ( await admin.locator( '#menu-posts-genre a[href*="genre-atlas-examples"] .awaiting-mod' ).innerText().catch( () => '' ) ).trim();
		const first = await admin.locator( '.ga-examples tbody tr' ).innerText();
		const frames = await admin.locator( '.ga-examples iframe' ).count();
		check( 'exemples : propose dans Listening examples, compte au menu, rien sur la fiche avant validation',
			hidden && Number( badge ) >= 1 && /Smoke example one/.test( first ) && /Proposal 1 of 2/.test( first ) && frames === 0,
			`pastille « ${ badge } », fiche ${ hidden ? 'muette' : 'deja sonore' }, ${ frames } lecteur(s)` );
		await admin.screenshot( { path: `${ SHOTS }/13-exemples.png`, fullPage: true } );
		await admin.locator( '.ga-examples [data-ga-act="reject"]' ).click();
		await admin.waitForLoadState( 'networkidle' );
		const next = await admin.locator( '.ga-examples tbody tr' ).innerText();
		check( 'exemples : refuser passe a la video suivante', /Smoke example two/.test( next ) && /the last one/.test( next ) && ! /Smoke example one/.test( next ) );
		await admin.locator( '.ga-examples [data-ga-act="accept"]' ).click();
		await admin.waitForLoadState( 'networkidle' );
		const accepted = await admin.locator( '.notice-success', { hasText: 'Accepted' } ).count();
		await listenNow();
		const row = await admin.locator( '.ga-dossier .ga-track' ).allInnerTexts();
		await admin.route( /youtube(-nocookie)?\.com/, r => r.fulfill( { status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title>' } ) );
		await admin.locator( '.ga-dossier .ga-listen-head [data-play]' ).click();
		const src = await admin.locator( '.ga-dossier .ga-player iframe' ).getAttribute( 'src' ).catch( () => '' );
		await admin.unroute( /youtube(-nocookie)?\.com/ );
		const plain = await ( await fetch( exAbout ) ).text();
		check( 'exemples : accepte, il s affiche dans LISTEN, se joue au clic et figure dans la page sans script',
			accepted === 1 && row.length === 1 && /smoke example two/i.test( row[ 0 ] ) && /LISTENING EXAMPLE · SMOKE ENSEMBLE/.test( row[ 0 ] )
			&& /youtube-nocookie\.com\/embed\/smokeExmpl2\?.*playlist=smokeExmpl2/.test( src || '' ) && /Example: Smoke Ensemble, “Smoke example two”/.test( plain ),
			`${ accepted } avis, ${ row.join( ' | ' ).replace( /\s+/g, ' ' ) }, lecteur ${ ( src || '-' ).slice( 0, 90 ) }, sans script ${ /Example:/.test( plain ) ? 'oui' : 'non' }` );
		await admin.locator( '.ga-dsec:has(#ga-d-listen)' ).screenshot( { path: `${ SHOTS }/13b-exemple-fiche.png` } ).catch( () => {} );
	} else {
		check( 'exemples : le banc a propose des videos a un genre (GA_EXAMPLE_GENRE)', false );
	}
	check( 'import : l ecran d import repond', fileInput > 0, fileInput ? '' : 'pas de champ fichier' );
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
