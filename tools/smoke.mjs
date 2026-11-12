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

// YouTube's player API, played by the bench: it logs what it is asked to
// play in window.__yt and ends every song after 1.5 s, moving on through a
// list as YouTube does.
const FAKE_YT = `window.__yt = [];
window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 }, Player: function ( el, o ) {
	var self = this, box = document.getElementById( el ), f = document.createElement( 'iframe' ), list = [], i = 0, t = 0, state = -1, timer = 0;
	f.title = 'YouTube'; f.width = o.width; f.height = o.height; box.replaceWith( f );
	function set( s ) { state = s; o.events.onStateChange( { data: s, target: self } ); }
	function start() { t = 0; set( 1 ); clearInterval( timer ); timer = setInterval( function () { t += 0.25; if ( t >= ( window.__ytLen || 1.5 ) ) { clearInterval( timer ); if ( i < list.length - 1 ) { i++; start(); } else { set( 0 ); } } }, 250 ); }
	self.loadVideoById = function ( id ) { window.__yt.push( [ 'video', id ] ); list = [ id ]; i = 0; start(); };
	self.loadPlaylist = function ( ids, at ) { window.__yt.push( [ 'list', ids.slice(), at || 0 ] ); list = ids.slice(); i = at || 0; start(); };
	self.playVideo = function () { window.__yt.push( [ 'play' ] ); set( 1 ); };
	self.pauseVideo = function () { window.__yt.push( [ 'pause' ] ); clearInterval( timer ); set( 2 ); };
	self.stopVideo = function () { clearInterval( timer ); state = 5; };
	self.nextVideo = function () { if ( i < list.length - 1 ) { i++; start(); } };
	self.getCurrentTime = function () { return t; }; self.getDuration = function () { return window.__ytLen || 1.5; };
	self.getPlayerState = function () { return state; }; self.getPlaylistIndex = function () { return i; };
	setTimeout( function () { o.events.onReady( { target: self } ); }, 30 );
} };
setTimeout( function () { window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(); }, 10 );`;

async function newPage( width, height ) {
	const page = await browser.newPage( { viewport: { width, height } } );
	// The bench must not depend on the outside world (gravatar, fonts, ...).
	await page.route( '**/*', route => {
		const host = new URL( route.request().url() ).hostname;
		return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
	} );
	await page.route( /youtube\.com\/iframe_api/, r => r.fulfill( { status: 200, contentType: 'text/javascript', body: FAKE_YT } ) );
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
		const tracks = await page.locator( '.ga-dossier .ga-track:not(.ga-mart) .ga-tname .ga-micro' ).allInnerTexts();   // MORE ARTISTS rows are tracks too
		const upper = names.map( n => n.toUpperCase() );
		let at = 0;
		const inOrder = tracks.every( t => ( at = upper.indexOf( t, at ) + 1 ) > 0 );
		const spotify = await page.locator( '.ga-dossier .ga-track a[href^="https://open.spotify.com/search/"]' ).count();
		check( 'ecoute : un titre par artiste cle, dans le meme ordre, chacun avec Spotify', tracks.length > 0 && tracks.length <= names.length && inOrder && spotify === tracks.length,
			`${ tracks.length } titre(s), ${ spotify } lien(s) Spotify` );
		const before = await page.locator( '.ga-bar .ga-bar-yt iframe' ).count();
		await page.locator( '.ga-dsec:has(.ga-tracks)' ).screenshot( { path: `${ SHOTS }/05d-ecoute.png` } ).catch( () => {} );
		// PLAY ALL loads the whole list in YouTube's player; ▶ on a song starts
		// the same list from that song.
		const videos = await page.locator( '.ga-dossier .ga-track a[href^="https://www.youtube.com/watch?v="]' ).evaluateAll( l => l.map( a => a.href.split( 'v=' )[ 1 ] ) );
		const asked = async sel => {
			await page.locator( sel ).click();
			await page.waitForFunction( () => ( window.__yt || [] ).some( x => x[ 0 ] === 'list' ), null, { timeout: 8000 } ).catch( () => {} );
			const log = await page.evaluate( () => ( window.__yt || [] ).filter( x => x[ 0 ] === 'list' ) );
			return log.length ? log[ log.length - 1 ] : [ '', [], -1 ];
		};
		const all = await asked( '.ga-dossier .ga-listen-head [data-play]' );
		const shown = await page.locator( '.ga-bar .ga-bar-yt' ).boundingBox();
		check( 'ecoute : YouTube ne se charge qu au clic, puis joue toute la liste, lecteur visible en 200 x 200', before === 0 && all[ 1 ].length > 1 && all[ 1 ].join() === videos.join() && all[ 2 ] === 0 && !! shown && Math.round( shown.width ) >= 200 && Math.round( shown.height ) >= 200,
			`${ before } lecteur avant, ${ all[ 1 ].length } video(s), depart ${ all[ 2 ] }, lecteur ${ shown ? Math.round( shown.width ) + ' x ' + Math.round( shown.height ) : 'cache' }` );
		const second = videos.length > 1 ? await asked( '.ga-dossier .ga-track:has(a[href*="' + videos[ 1 ] + '"]) .ga-play' ) : [ '', [], -1 ];
		check( 'ecoute : le bouton d un titre lance ce titre, puis la suite', second[ 2 ] === 1 && second[ 1 ].join() === videos.join(), `depart ${ second[ 2 ] }` );
		// The player lives in the bar, outside the page: back on the map, the
		// same list keeps playing; ✕ stops it and takes the bar away.
		const loads = () => page.evaluate( () => window.__yt.filter( x => x[ 0 ] === 'list' || x[ 0 ] === 'video' ).length );
		const calls = await loads();
		await page.screenshot( { path: `${ SHOTS }/05c-fiche-wikipedia.png`, fullPage: true } );
		await page.locator( '.ga-dossier [data-close]' ).click();
		await page.waitForSelector( '.ga-map .ga-node', { timeout: 10000 } );
		const kept = await loads() === calls && await page.locator( '.ga-bar .ga-bar-yt' ).isVisible();
		await page.locator( '.ga-bar [data-bar="close"]' ).click( { timeout: 5000 } ).catch( () => {} );
		const gone = await page.locator( '.ga-bar' ).isHidden() && await page.locator( '.ga-bar .ga-bar-yt' ).isHidden();
		check( 'ecoute : le lecteur continue sur la carte, et ✕ l arrete', kept && gone, `${ kept ? 'meme liste' : 'liste relancee' }, ${ gone ? 'barre fermee' : 'barre restee' }` );
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

	// 7. Mobile: the map turned upright, the vertical tree one tap away.
	const phone = await newPage( 390, 844 );
	const mnode = territoryRoot || ( mid ? mid.node : byId.get( tree.nodes[ 0 ].id ) );   // Rock: the full eight seats
	await centre( phone, mnode );
	const boxes = await phone.locator( '.ga-mmap .ga-mnd' ).evaluateAll( l => l.map( e => { const r = e.getBoundingClientRect(); return [ r.left, r.top, r.right, r.bottom ]; } ) );
	const clash = boxes.some( ( a, i ) => boxes.some( ( b, j ) => j > i && a[ 0 ] < b[ 2 ] - 1 && b[ 0 ] < a[ 2 ] - 1 && a[ 1 ] < b[ 3 ] - 1 && b[ 1 ] < a[ 3 ] - 1 ) );
	const mwide = await phone.evaluate( () => document.documentElement.scrollWidth );
	const mname = ( await phone.locator( '.ga-mctr h1' ).innerText().catch( () => '' ) ).toLowerCase();
	check( `mobile : carte pivotee, « ${ mnode.name } » au centre, 8 noeuds au plus, sans chevauchement ni debordement`,
		mname === mnode.name.toLowerCase() && boxes.length > 0 && boxes.length <= 8 && ! clash && mwide <= 390 && await phone.locator( '.ga-map' ).count() === 0,
		`${ boxes.length } noeud(s), ${ clash ? 'chevauchement' : 'net' }, ${ mwide } px` );
	await phone.screenshot( { path: `${ SHOTS }/07-mobile.png`, fullPage: true } );
	const first = phone.locator( '.ga-mmap .ga-mnd' ).first();
	const firstName = ( await first.locator( 'b' ).innerText() ).toLowerCase();
	await first.click();
	await phone.waitForTimeout( 800 );
	const now = ( await phone.locator( '.ga-mctr h1' ).innerText().catch( () => '' ) ).toLowerCase();
	const lineage = await phone.locator( '.ga-manc' ).allInnerTexts();
	await phone.locator( '.ga-manc' ).last().click();
	await phone.waitForTimeout( 500 );
	const back = ( await phone.locator( '.ga-mctr h1' ).innerText().catch( () => '' ) ).toLowerCase();
	check( 'mobile : toucher un sous-genre le centre, toucher la lignee fait remonter',
		now === firstName && lineage.some( t => t.toLowerCase().includes( mnode.name.toLowerCase() ) ) && back === mnode.name.toLowerCase(), `${ firstName } → ${ now } → ${ back }` );
	await phone.locator( '[data-mview="list"]' ).click();
	const listed = await phone.locator( '.ga-mtree .ga-mrow' ).count();
	await phone.screenshot( { path: `${ SHOTS }/07c-mobile-liste.png`, fullPage: true } );
	await phone.locator( '[data-mview="map"]' ).click();
	check( 'mobile : la liste reste a un toucher (MAP / LIST)', listed > 0 && await phone.locator( '.ga-mmap' ).count() === 1, `${ listed } ligne(s)` );
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
		const cta = ( await pk.locator( '[data-popen]' ).innerText() ).trim().toUpperCase();
		const ctaBox = await pk.locator( '[data-popen]' ).boundingBox();
		check( 'propositions : plus de COMMUNITY PICKS, un bouton bien visible SUGGEST A BAND OR AN ARTIST apres les artistes', ! order.includes( 'COMMUNITY PICKS' ) && order.indexOf( 'SUGGEST' ) === 1 + Math.max( ...[ 'KEY ARTISTS', 'LISTEN', 'MORE ARTISTS' ].map( h => order.indexOf( h ) ) ) && cta.includes( 'SUGGEST A BAND OR AN ARTIST FOR THIS GENRE' ) && ctaBox && ctaBox.height >= 48, `${ order.join( ' · ' ) } / ${ cta }` );
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
		await pk.screenshot( { path: `${ SHOTS }/10-propositions-formulaire.png`, fullPage: false, clip: await pk.locator( '.ga-dsec:has(#ga-pbox)' ).boundingBox() } );
		await pk.waitForTimeout( Math.max( 0, 3300 - ( Date.now() - loaded ) ) );
		await pk.locator( '.ga-pform .ga-csend' ).click();
		await pk.waitForSelector( '.ga-pdone', { timeout: 10000 } );
		check( 'propositions : la plateforme est reconnue et la proposition part en attente', detected === 'DETECTED: SPOTIFY' && cleared && api.length === 1 && await pk.locator( '.ga-mart', { hasText: pickName } ).count() === 0, detected );
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
		check( 'legal : le pied de l index ouvre la page, avec editeur, hebergeur, donnees, comptes, cookies, droits, conditions et credits',
			heads.length === 8 && heads.some( h => /^accounts$/i.test( h ) ) && heads.some( h => /^terms of use$/i.test( h ) ) && /o2switch/i.test( text ) && /CNIL/.test( text ) && /CC BY-SA/.test( text ) && ( await lg.title() ).startsWith( 'Legal notice' ), heads.join( ' · ' ) );
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

	// 8c. Sound: every song plays whole, in YouTube's player (played here by
	// FAKE_YT). Pointing at a genre plays it once SOUND ON is chosen, in a
	// bar that keeps playing from page to page.
	const videosOf = pg => pg.evaluate( () => ( window.__yt || [] ).filter( x => x[ 0 ] === 'video' || x[ 0 ] === 'list' ).length );
	const sc = tree.nodes.find( n => {
		const k = tree.nodes.filter( x => x.p === n.id );
		return n.s && ! n.g && k.length >= 2 && k.length <= 6 && k.filter( x => x.s ).length >= 2 && ! k.some( x => x.g );
	} );
	if ( sc ) {
		const [ sk, sk2 ] = tree.nodes.filter( x => x.p === sc.id && x.s );
		const snd = await newPage( 1440, 900 );
		await snd.addInitScript( () => { window.__ytLen = 60; } );     // songs that last, for the hover checks
		const asked = [], toYoutube = [];
		snd.on( 'request', r => { if ( r.url().includes( '/genre-atlas/v1/sound/' ) ) asked.push( r.url() ); if ( /youtube\.com/.test( r.url() ) ) toYoutube.push( r.url() ); } );
		await centre( snd, sc );
		const nodeOf = id => snd.locator( `.ga-map .ga-node[data-go="${ id }"], .ga-map .ga-node[data-centre="${ id }"]` ).first();
		const node = nodeOf( sk.id );
		await node.hover();
		await snd.waitForTimeout( 900 );
		const silent = asked.length === 0 && toYoutube.length === 0 && await snd.locator( '.ga-bar' ).isHidden();
		check( 'son : rien ne joue ni ne part chez YouTube avant SOUND ON', silent && /SOUND OFF/.test( await snd.locator( '.ga-sound' ).innerText() ), `${ asked.length } demande(s), ${ toYoutube.length } appel(s) a YouTube` );
		await snd.locator( '.ga-sound' ).click();
		await snd.locator( '.ga-map .ga-node.centre' ).hover();
		await snd.waitForTimeout( 100 );
		await node.hover();
		await snd.waitForSelector( '.ga-bar:not([hidden]) .ga-bar-t b', { timeout: 8000 } ).catch( () => {} );
		await snd.waitForFunction( () => ( window.__yt || [] ).length > 0, null, { timeout: 8000 } ).catch( () => {} );
		const want = await fetch( `${ BASE }/wp-json/genre-atlas/v1/sound/${ sk.id }?i=0` ).then( r => r.json() );
		const title = await snd.locator( '.ga-bar .ga-bar-t b' ).innerText().catch( () => '' );
		const shown = await snd.locator( '.ga-bar .ga-bar-yt' ).isVisible();
		const noPreview = await snd.locator( '.ga-bar [data-bar="mode"]' ).count() === 0 && ! /PREVIEW/.test( await snd.locator( '.ga-bar' ).innerText() );
		check( 'son : SOUND ON, pointer un genre joue son titre entier sur YouTube, sans extrait de 30 s', title === want.title && await videosOf( snd ) === 1 && shown && noPreview && /SOUND ON/.test( await snd.locator( '.ga-sound' ).innerText() ),
			`« ${ title } » pour « ${ want.title } », ${ await videosOf( snd ) } titre(s)` );
		await snd.screenshot( { path: `${ SHOTS }/14-son.png` } );
		// A song started by pointing gives way to the next genre pointed at;
		// one asked for by hand does not.
		await nodeOf( sk2.id ).hover();
		await snd.waitForFunction( id => document.querySelector( '.ga-bar [data-about]' )?.getAttribute( 'data-about' ) === String( id ), sk2.id, { timeout: 8000 } ).catch( () => {} );
		const moved = await snd.locator( '.ga-bar [data-about]' ).getAttribute( 'data-about' ).catch( () => '' );
		await snd.locator( `.ga-panel [data-hear="${ sc.id }"]` ).first().click().catch( () => {} );
		await snd.waitForTimeout( 600 );
		const byHand = await snd.locator( '.ga-bar [data-about]' ).getAttribute( 'data-about' ).catch( () => '' );
		await nodeOf( byHand === String( sk.id ) ? sk2.id : sk.id ).hover();
		await snd.waitForTimeout( 900 );
		const kept = await snd.locator( '.ga-bar [data-about]' ).getAttribute( 'data-about' ).catch( () => '' );
		check( 'son : un titre lance en pointant cede au genre pointe ensuite, pas un titre lance a la main', moved === String( sk2.id ) && !! byHand && kept === byHand,
			`pointe : ${ moved }, a la main : ${ byHand }, apres : ${ kept }` );
		// Clicking the genre redraws the page: the bar plays on, then on the dossier too.
		const before = await videosOf( snd ), playingTitle = await snd.locator( '.ga-bar .ga-bar-t b' ).innerText().catch( () => '' );
		await snd.locator( '.ga-sound' ).click();                          // SOUND OFF: no more pointing
		await snd.waitForTimeout( 200 );
		const stillOn = await snd.locator( '.ga-bar .ga-bar-t b' ).innerText().catch( () => '' );
		await nodeOf( sk.id ).click();
		await snd.waitForTimeout( 300 );
		const onMap = await snd.locator( '.ga-bar .ga-bar-t b' ).innerText().catch( () => '' );
		await snd.locator( '.ga-panel [data-about]' ).first().click();
		await snd.waitForSelector( '.ga-dossier h1', { timeout: 10000 } );
		const onDossier = await snd.locator( '.ga-bar .ga-bar-t b' ).innerText().catch( () => '' );
		check( 'son : la barre continue de la carte a la fiche', stillOn === playingTitle && onMap === playingTitle && onDossier === playingTitle && await videosOf( snd ) === before, `${ await videosOf( snd ) - before } titre(s) recharge(s)` );
		await snd.locator( '.ga-sound' ).click().catch( () => {} );
		await snd.locator( '.ga-bar [data-bar="close"]' ).click( { timeout: 5000 } ).catch( () => {} );
		const closed = await snd.locator( '.ga-bar' ).isHidden();
		await snd.reload( { waitUntil: 'networkidle' } );
		await snd.waitForSelector( '.ga-ready', { timeout: 10000 } );
		const remembered = /SOUND ON/.test( await snd.locator( '.ga-sound' ).innerText().catch( () => '' ) );
		const stored = ( await snd.context().cookies() ).length;
		check( 'son : ✕ ferme la barre, SOUND ON est garde dans le navigateur, sans cookie', closed && remembered && stored === 0, `${ stored } cookie(s)` );
		await snd.close();

		// The radio of a branch: one song per genre, shuffled, the next
		// genre when a song ends (the bench's songs last a second and a half).
		const air = n => {
			const out = [];
			( function walk( id ) { for ( const k of tree.nodes.filter( x => x.p === id && ! x.f ) ) { out.push( k ); walk( k.id ); } } )( n.id );
			return [ n, ...out ].filter( x => x.s );
		};
		const rc = tree.nodes.find( n => ! n.f && n.p && air( n ).length >= 4 && tree.nodes.filter( x => x.p === n.id ).length <= 6 );
		if ( rc ) {
			const onAir = new Set( air( rc ).map( x => x.id ) );
			const rd = await newPage( 1440, 900 );
			await centre( rd, rc );
			await rd.locator( `.ga-panel [data-radio="${ rc.id }"]` ).click();
			await rd.waitForSelector( '.ga-bar:not([hidden]) .ga-bar-radio', { timeout: 8000 } ).catch( () => {} );
			const label = await rd.locator( '.ga-bar .ga-bar-radio' ).innerText().catch( () => '' );
			const genreOf = async () => Number( await rd.locator( '.ga-bar [data-about]' ).getAttribute( 'data-about' ).catch( () => 0 ) );
			const first = await genreOf();
			await rd.waitForFunction( () => /\b02\//.test( document.querySelector( '.ga-bar-radio' )?.textContent || '' ), null, { timeout: 8000 } ).catch( () => {} );
			const second = await genreOf();
			const auto = await rd.locator( '.ga-bar .ga-bar-radio' ).innerText().catch( () => '' );
			await rd.locator( '.ga-bar [data-bar="next"]' ).click();
			await rd.waitForFunction( () => /\b03\//.test( document.querySelector( '.ga-bar-radio' )?.textContent || '' ), null, { timeout: 8000 } ).catch( () => {} );
			const third = await genreOf();
			await rd.screenshot( { path: `${ SHOTS }/14c-radio.png` } );
			check( `radio : « ${ rc.name } » enchaine ses genres, seul et avec ⏭, sans sortir de la branche`,
				label.startsWith( `RADIO ${ rc.name.toUpperCase() } 01/${ String( onAir.size ).padStart( 2, '0' ) }` ) && /02\//.test( auto ) && [ first, second, third ].every( id => onAir.has( id ) )
				&& new Set( [ first, second, third ] ).size === 3 && await videosOf( rd ) >= 3,
				`${ label } → ${ auto }, ${ await videosOf( rd ) } titre(s)` );
			await rd.locator( '.ga-bar [data-bar="close"]' ).click( { timeout: 5000 } ).catch( () => {} );
			await rd.close();
		} else {
			check( 'radio : une branche de l arbre a au moins quatre genres a entendre', false );
		}

		// Full tracks from YouTube, with a note the first time, and no 30 S
		// switch any more.
		const sv = sk;
		const md = await newPage( 1440, 900 );
		await centre( md, sv );
		const label = await md.locator( `.ga-panel [data-hear="${ sv.id }"]` ).innerText().catch( () => '' );
		await md.locator( `.ga-panel [data-hear="${ sv.id }"]` ).click();
		await md.waitForSelector( '.ga-bar:not([hidden]) .ga-bar-note', { timeout: 8000 } ).catch( () => {} );
		await md.waitForFunction( () => ( window.__yt || [] ).length > 0, null, { timeout: 8000 } ).catch( () => {} );
		const fullFirst = await videosOf( md ) === 1 && /FULL TRACK/.test( label ) && await md.locator( '.ga-bar .ga-bar-yt' ).isVisible();
		const note = await md.locator( '.ga-bar .ga-bar-note' ).innerText().catch( () => '' );
		const noSwitch = await md.locator( '[data-bar="mode"]' ).count() === 0 && ! /30 S/.test( note + await md.locator( '.ga-bar' ).innerText() );
		await md.screenshot( { path: `${ SHOTS }/14e-titre-entier.png` } );
		check( 'son : titre entier sur YouTube, avec la note la premiere fois, et plus aucun bouton 30 S',
			fullFirst && /COOKIES/.test( note ) && /ADS/.test( note ) && noSwitch, `${ fullFirst ? 'entier' : 'pas entier' }, ${ noSwitch ? 'sans 30 S' : 'un 30 S reste' }` );
		await md.close();

		const tel = await newPage( 390, 844 );
		await centre( tel, sk );
		const hasToggle = await tel.locator( '.ga-sound' ).count();
		await tel.locator( '.ga-mobile [data-hear]' ).first().click();
		await tel.waitForSelector( '.ga-bar:not([hidden]) .ga-bar-t b', { timeout: 8000 } ).catch( () => {} );
		await tel.waitForFunction( () => ( window.__yt || [] ).length > 0, null, { timeout: 8000 } ).catch( () => {} );
		const tw = await tel.evaluate( () => Math.max( document.documentElement.scrollWidth, document.querySelector( '.ga-bar' ).scrollWidth ) );
		await tel.screenshot( { path: `${ SHOTS }/14b-son-mobile.png` } );
		const theardAll = () => videosOf( tel );
		check( 'mobile : HEAR joue le titre sans interrupteur, la barre tient dans la largeur', await theardAll() === 1 && hasToggle === 0 && tw <= 390, `${ await theardAll() } titre(s), ${ tw } px` );
		// Holding a subgenre on the upright map plays it, without moving the map.
		await tel.locator( '.ga-bar [data-bar="close"]' ).click( { timeout: 5000 } ).catch( () => {} );
		await centre( tel, sc );
		const beforeHold = await theardAll();
		const held = tel.locator( `.ga-mmap .ga-mnd[data-centre="${ sk.id }"]` );
		const hb = await held.boundingBox();
		if ( hb ) {
			await tel.mouse.move( hb.x + hb.width / 2, hb.y + 20 );
			await tel.mouse.down();
			await tel.waitForTimeout( 700 );
			await tel.mouse.up();
		}
		await tel.waitForSelector( '.ga-bar:not([hidden]) .ga-bar-t b', { timeout: 8000 } ).catch( () => {} );
		await tel.waitForFunction( () => ( window.__yt || [] ).length > 0, null, { timeout: 8000 } ).catch( () => {} );
		const stay = ( await tel.locator( '.ga-mctr h1' ).innerText().catch( () => '' ) ).toLowerCase();
		const heldOn = await tel.locator( '.ga-bar [data-about]' ).getAttribute( 'data-about' ).catch( () => '' );
		check( 'mobile : un appui long sur un genre de la carte le fait entendre, sans changer de centre', !! hb && Number( heldOn ) === sk.id && stay === sc.name.toLowerCase() && await theardAll() - beforeHold === 1,
			`${ await theardAll() - beforeHold } titre(s), centre « ${ stay } »` );
		await tel.screenshot( { path: `${ SHOTS }/14d-appui-long.png` } );
		// A full track on a phone: the video goes into the bar, which grows,
		// and the page makes room for it, so nothing is hidden under a card.
		await tel.locator( '.ga-bar [data-bar="close"]' ).click( { timeout: 5000 } ).catch( () => {} );
		await centre( tel, sv );
		await tel.locator( `.ga-mobile [data-hear="${ sv.id }"]` ).click();
		await tel.waitForFunction( () => ( window.__yt || [] ).some( x => x[ 0 ] === 'video' ), null, { timeout: 8000 } ).catch( () => {} );
		await tel.locator( '.ga-bar-note [data-bar="ok"]' ).click( { timeout: 5000 } ).catch( () => {} );
		await tel.evaluate( () => window.scrollTo( 0, document.documentElement.scrollHeight ) );
		await tel.waitForTimeout( 300 );
		const fit = await tel.evaluate( () => {
			const bar = document.querySelector( '.ga-bar' ).getBoundingClientRect(), card = document.querySelector( '.ga-bar-yt' ).getBoundingClientRect();
			const foot = [ ...document.querySelectorAll( '#genre-atlas .ga-foot' ) ].pop().getBoundingClientRect();
			return { inBar: card.top >= bar.top - 1 && card.bottom <= bar.bottom + 1 && card.width >= 200 && card.height >= 200, footClear: foot.bottom <= bar.top + 1, wide: document.documentElement.scrollWidth };
		} );
		await tel.screenshot( { path: `${ SHOTS }/14f-video-mobile.png` } );
		check( 'mobile : un titre entier met la video dans la barre, la page reste lisible jusqu en bas', fit.inBar && fit.footClear && fit.wide <= 390,
			`${ fit.inBar ? 'video dans la barre' : 'video hors de la barre' }, ${ fit.footClear ? 'pied visible' : 'pied cache' }, ${ fit.wide } px` );
		await tel.close();

	} else {
		check( 'son : une branche de l arbre a deux genres a entendre', false );
	}

	// 8e. Accounts: the whole way through, as a member would go. E-mails are
	// read back from the bench (smoke/v1/mails); Google and Facebook are played
	// by the browser (their consent pages) and by fake-platforms.php (their APIs).
	{
		const mails = () => fetch( `${ BASE }/wp-json/smoke/v1/mails` ).then( r => r.json() );
		const linkIn = async ( to, subject ) => {
			for ( let w = 0; w < 20; w++ ) {
				const m = ( await mails() ).filter( x => x.to === to && x.subject.includes( subject ) ).pop();
				if ( m ) return ( m.message.match( /https?:\/\/\S+\/my-atlas\/\?\S+/ ) || [ '' ] )[ 0 ];
				await new Promise( r => setTimeout( r, 250 ) );
			}
			return '';
		};
		const b64 = o => Buffer.from( JSON.stringify( o ) ).toString( 'base64url' );
		// The browser does not route a request reached through a redirect, so
		// the consent page is played at the door instead: the site's own
		// /my-atlas/oauth/<provider>/ is fetched, and where it would send the
		// visitor is answered as the provider would, straight back.
		const consent = async ( pg, who ) => {
			await pg.route( /\/my-atlas\/oauth\/(google|facebook)\/(\?.*)?$/, async r => {
				const out = await r.fetch( { maxRedirects: 0 } );
				const u = new URL( out.headers().location );
				const code = /google/.test( u.host ) ? b64( { ...who, nonce: u.searchParams.get( 'nonce' ) } ) : b64( who );
				return r.fulfill( { status: 302, headers: { location: `${ u.searchParams.get( 'redirect_uri' ) }?state=${ u.searchParams.get( 'state' ) }&code=${ code }` } } );
			} );
		};
		const fill = async ( pg, values ) => { for ( const [ k, v ] of Object.entries( values ) ) { await pg.locator( `.ga-aform [name="${ k }"]` ).fill( v ); } };
		const submit = async pg => { await pg.locator( '.ga-aform button[type="submit"]' ).first().click(); await pg.waitForTimeout( 600 ); };
		const me = `${ BASE }/my-atlas/`;
		const email = 'member@example.test', pseudo = 'smoke-member', pass = 'Quiet rooms 4 loud bands';

		// Signed out: the doors, and ☆ leads to them.
		const ac = await newPage( 1440, 900 );
		await ac.route( /dzcdn\.net/, r => r.fulfill( { status: 200, contentType: 'audio/wav', body: Buffer.alloc( 100 ) } ) );
		const sv2 = tree.nodes.find( n => n.s && byId.get( n.p ) );
		await centre( ac, sv2 );
		await ac.locator( `.ga-panel [data-fav="${ sv2.id }"]` ).click();
		await ac.waitForSelector( '.ga-doors', { timeout: 8000 } ).catch( () => {} );
		const asked = /favourite genres/i.test( await ac.locator( '.ga-anote' ).innerText().catch( () => '' ) ) && new URL( ac.url() ).pathname === '/my-atlas/';
		await ac.screenshot( { path: `${ SHOTS }/16a-connexion.png`, fullPage: true } );
		// The call to action can be read: a button keeps its fill and its text.
		const cta = await ac.locator( '.ga-doors [data-form="login"] button[type="submit"]' ).evaluate( b => { const c = getComputedStyle( b ); return c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.color !== c.backgroundColor; } ).catch( () => false );
		check( 'comptes : le bouton de connexion est lisible (fond et texte)', cta );
		check( 'comptes : sans compte, ☆ mene a la connexion et rien n est garde', asked && await ac.locator( '.ga-doors [data-form="login"]' ).count() === 1 );

		// Create an account: the link in the e-mail confirms it and signs in.
		await ac.locator( '[data-auth="up"]' ).click();
		await fill( ac, { pseudo, email, password: pass } );
		await ac.locator( '#ga-aterms' ).check();
		await ac.waitForTimeout( 3200 );                       // a form sent in under 3 s is a robot's
		await submit( ac );
		const sent = /Check your inbox/i.test( await ac.locator( '.ga-doors h1' ).innerText().catch( () => '' ) );
		if ( ! sent ) console.log( 'inscription :', await ac.locator( '.ga-doors' ).innerText().catch( () => '?' ) );
		const verify = await linkIn( email, 'Confirm your account' );
		const early = await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { login: pseudo, password: pass } ) } ).then( r => r.json() );
		await ac.goto( verify, { waitUntil: 'networkidle' } );
		await ac.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const welcome = await ac.locator( '.ga-me .ga-hero' ).innerText().catch( () => '' );
		await ac.screenshot( { path: `${ SHOTS }/16-compte.png`, fullPage: true } );
		check( 'comptes : inscription, lien de confirmation par e-mail, puis connecte (pas avant)', sent && !! verify && /confirm/i.test( early.message || '' ) && welcome.includes( pseudo.toUpperCase() ),
			`${ sent ? 'envoye' : 'pas envoye' }, lien ${ verify ? 'recu' : 'absent' }, avant confirmation « ${ early.message || '' } »` );

		// ☆, a genre heard (1 s on the bench), ♥: kept in the account.
		await centre( ac, sv2 );
		await ac.locator( `.ga-panel [data-fav="${ sv2.id }"]` ).click();
		await ac.locator( `.ga-panel [data-hear="${ sv2.id }"]` ).click();
		await ac.waitForSelector( '.ga-bar:not([hidden]) [data-bar="like"]', { timeout: 8000 } ).catch( () => {} );
		await ac.waitForTimeout( 2200 );
		await ac.locator( '.ga-bar [data-bar="like"]' ).click( { timeout: 5000 } ).catch( () => {} );
		await ac.waitForTimeout( 600 );
		await ac.locator( '.ga-bar [data-bar="close"]' ).click( { timeout: 5000 } ).catch( () => {} );
		const other = await browser.newContext( { viewport: { width: 1440, height: 900 } } );
		const ac2 = await other.newPage();
		await ac2.route( '**/*', r => [ '127.0.0.1', 'localhost' ].includes( new URL( r.request().url() ).hostname ) ? r.continue() : r.abort() );
		await ac2.goto( me, { waitUntil: 'networkidle' } );
		await ac2.waitForSelector( '.ga-doors', { timeout: 8000 } ).catch( () => {} );
		await fill( ac2, { login: email, password: pass } );
		await submit( ac2 );
		await ac2.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const stats = await ac2.locator( '.ga-me .ga-stats' ).innerText().catch( () => '' );
		check( 'comptes : ☆, genre ecoute et ♥ sont gardes dans le compte, retrouves dans un autre navigateur', /0001\s*\/\s*\d+/.test( stats ) && /FAVOURITE GENRES\s*01/.test( stats ) && /FAVOURITE SONGS\s*01/.test( stats ),
			stats.replace( /\s+/g, ' ' ) );

		// History, on then off; public profile, on then off; the download.
		await ac2.locator( '[data-set="history"]' ).click();
		await ac2.waitForSelector( '[data-set="history"].on', { timeout: 5000 } ).catch( () => {} );
		await centre( ac2, sv2 );
		await ac2.route( /dzcdn\.net/, r => r.fulfill( { status: 200, contentType: 'audio/wav', body: Buffer.alloc( 100 ) } ) );
		await ac2.route( /youtube\.com\/iframe_api/, r => r.fulfill( { status: 200, contentType: 'text/javascript', body: FAKE_YT } ) );
		await ac2.locator( `.ga-panel [data-hear="${ sv2.id }"]` ).click();
		await ac2.waitForTimeout( 2600 );
		await ac2.goto( me, { waitUntil: 'networkidle' } );
		await ac2.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const lines = await ac2.locator( '.ga-history li' ).count();
		await ac2.locator( '[data-set="public"]' ).click();
		await ac2.waitForSelector( '[data-set="public"].on', { timeout: 5000 } ).catch( () => {} );
		const profile = `${ BASE }/atlas/${ pseudo }/`;
		const seen = await fetch( profile );
		const page = await newPage( 1440, 900 );
		await page.goto( profile, { waitUntil: 'networkidle' } );
		await page.waitForSelector( '.ga-me-fams', { timeout: 8000 } ).catch( () => {} );
		const shown = await page.locator( '.ga-me' ).innerText().catch( () => '' );
		await page.screenshot( { path: `${ SHOTS }/16b-profil-public.png`, fullPage: true } );
		await page.close();
		const [ dl ] = await Promise.all( [ ac2.waitForEvent( 'download', { timeout: 8000 } ).catch( () => null ), ac2.locator( '[data-export]' ).click() ] );
		const file = dl ? JSON.parse( ( await import( 'fs' ) ).readFileSync( await dl.path(), 'utf8' ) ) : {};
		await ac2.locator( '[data-set="public"]' ).click();
		await ac2.waitForSelector( '[data-set="public"]:not(.on)', { timeout: 5000 } ).catch( () => {} );
		await ac2.locator( '[data-set="history"]' ).click();
		await ac2.waitForSelector( '[data-set="history"]:not(.on)', { timeout: 5000 } ).catch( () => {} );
		const hidden = ( await fetch( profile ) ).status;
		const after = await ac2.evaluate( url => fetch( url + 'account/export', { headers: { 'X-WP-Nonce': window.GENRE_ATLAS.nonce }, credentials: 'same-origin' } ).then( r => r.json() ), `${ BASE }/wp-json/genre-atlas/v1/` );
		check( 'comptes : historique au choix (efface en l eteignant), profil public en un clic, non indexe, et telechargement de toutes les donnees',
			lines >= 1 && seen.status === 200 && /<meta name='robots' content='[^']*noindex/.test( await seen.text() ) && shown.toLowerCase().includes( `${ pseudo }’s atlas` ) && ! shown.includes( email )
			&& file.email === email && ( file.history || [] ).length >= 1 && hidden === 404 && ( after.history || [ 1 ] ).length === 0,
			`${ lines } ligne(s) d historique, profil ${ seen.status } puis ${ hidden }, export ${ file.email ? 'complet' : 'vide' }` );

		// A new password by e-mail; a new address, confirmed before it counts.
		await ac2.locator( '[data-signout]' ).click();
		await ac2.waitForSelector( '.ga-doors', { timeout: 8000 } ).catch( () => {} );
		await ac2.locator( '[data-auth="forgot"]' ).click();
		await fill( ac2, { email } );
		await submit( ac2 );
		const reset = await linkIn( email, 'Choose a new password' );
		await ac2.goto( reset, { waitUntil: 'networkidle' } );
		await ac2.waitForSelector( '.ga-doors [data-form="reset"]', { timeout: 8000 } ).catch( () => {} );
		const pass2 = 'Second quiet password 7';
		await fill( ac2, { password: pass2 } );
		await submit( ac2 );
		await ac2.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const reseted = await ac2.locator( '.ga-settings' ).count() === 1;
		const email2 = 'member2@example.test';
		await ac2.locator( '.ga-aform[data-form="email"] [name="email"]' ).fill( email2 );
		await ac2.locator( '.ga-aform[data-form="email"] button' ).click();
		await ac2.waitForTimeout( 600 );
		const moved = await linkIn( email2, 'Confirm your new e-mail address' );
		await ac2.goto( moved, { waitUntil: 'networkidle' } );
		await ac2.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const nowAt = await ac2.locator( '.ga-aform[data-form="email"] h3' ).innerText().catch( () => '' );
		check( 'comptes : mot de passe oublie par lien e-mail, et nouvelle adresse confirmee avant de compter', reseted && !! moved && nowAt.includes( email2.toUpperCase() ), nowAt );

		// Google: a newcomer chooses a pseudo; the next time, straight in.
		const gp = await newPage( 1440, 900 );
		await consent( gp, { sub: 'g-1', email: 'gina@example.test', name: 'Gina Smoke' } );
		await gp.goto( me, { waitUntil: 'networkidle' } );
		await gp.locator( `.ga-sso[href$="/google/"]` ).click();
		await gp.waitForSelector( '.ga-doors [data-form="sso"]', { timeout: 10000 } ).catch( () => {} );
		await gp.waitForTimeout( 500 );
		const suggest = await gp.locator( '.ga-aform [name="pseudo"]' ).inputValue().catch( () => '' );
		await gp.locator( '#ga-aterms' ).check();
		await submit( gp );
		await gp.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const linkedG = await gp.locator( '.ga-linked' ).allInnerTexts();
		await gp.locator( '[data-signout]' ).click();
		await gp.waitForSelector( '.ga-doors', { timeout: 8000 } ).catch( () => {} );
		await gp.locator( `.ga-sso[href$="/google/"]` ).click();
		await gp.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const again = await gp.locator( '.ga-settings' ).count() === 1;
		check( 'comptes : Google, un nouveau venu choisit son pseudo, la fois suivante il entre directement', suggest === 'gina-smoke' && linkedG.join() === 'GOOGLE · LINKED' && again, `pseudo propose « ${ suggest } »` );
		// Eight wrong passwords lock the account for a quarter of an hour.
		const tries = [];
		for ( let i = 0; i < 9; i++ ) {
			tries.push( ( await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { login: 'gina-smoke', password: 'wrong guess ' + i } ) } ) ).status );
		}
		check( 'comptes : 8 mauvais mots de passe verrouillent le compte un quart d heure', tries.slice( 0, 8 ).every( x => x === 403 ) && tries[ 8 ] === 429, tries.join( ' ' ) );
		const staff = await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { login: 'admin', password: 'password' } ) } ).then( r => r.json() );
		check( 'comptes : l administrateur ne se connecte pas par /my-atlas/, il garde la page de connexion de WordPress', staff.code === 'genre_atlas_staff', staff.code || '' );
		await gp.close();

		// Facebook: a newcomer; then Meta's data deletion callback removes it.
		const fp = await newPage( 1440, 900 );
		await consent( fp, { id: 'fb-7', name: 'Fred Smoke', email: 'fred@example.test' } );
		await fp.goto( me, { waitUntil: 'networkidle' } );
		await fp.locator( `.ga-sso[href$="/facebook/"]` ).click();
		await fp.waitForSelector( '.ga-doors [data-form="sso"]', { timeout: 10000 } ).catch( () => {} );
		await fp.locator( '.ga-aform [name="pseudo"]' ).fill( 'fred-smoke' );
		await fp.locator( '#ga-aterms' ).check();
		await submit( fp );
		await fp.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		const inFb = await fp.locator( '.ga-settings' ).count() === 1;
		await fp.close();
		const { createHmac } = await import( 'crypto' );
		const payload = Buffer.from( JSON.stringify( { algorithm: 'HMAC-SHA256', user_id: 'fb-7' } ) ).toString( 'base64url' );
		const signed = createHmac( 'sha256', 'smoke-facebook-secret' ).update( payload ).digest( 'base64url' ) + '.' + payload;
		const del = await fetch( `${ BASE }/wp-json/genre-atlas/v1/oauth/facebook/delete`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'signed_request=' + encodeURIComponent( signed ) } ).then( r => r.json() );
		const forged = ( await fetch( `${ BASE }/wp-json/genre-atlas/v1/oauth/facebook/delete`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'signed_request=' + encodeURIComponent( 'x' + signed ) } ) ).status;
		const goneFb = ( await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { login: 'fred-smoke', password: 'anything at all' } ) } ) ).status;
		check( 'comptes : Facebook, puis la demande de suppression de Meta efface le compte (signature verifiee)', inFb && /deletion=/.test( del.url || '' ) && !! del.confirmation_code && forged === 403 && goneFb === 403, `suppression ${ del.confirmation_code ? 'confirmee' : 'refusee' }, signature fausse ${ forged }` );

		// Members stay out of the admin; deleting the account erases it.
		await ac2.goto( `${ BASE }/wp-admin/`, { waitUntil: 'networkidle' } );
		const kept = new URL( ac2.url() ).pathname;
		await ac2.waitForSelector( '.ga-settings', { timeout: 10000 } ).catch( () => {} );
		await ac2.locator( '.ga-delete [name="confirm"]' ).fill( pseudo );
		await ac2.locator( '.ga-delete [name="password"]' ).fill( pass2 );
		await ac2.locator( '.ga-delete button' ).click();
		await ac2.waitForSelector( '.ga-doors', { timeout: 10000 } ).catch( () => {} );
		const bye = await ac2.locator( '.ga-anote' ).innerText().catch( () => '' );
		const gone = ( await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { login: email2, password: pass2 } ) } ) ).status;
		check( 'comptes : un membre n entre pas dans l administration, et supprimer son compte efface tout', kept === '/my-atlas/' && /deleted/.test( bye ) && gone === 403, `admin → ${ kept }, connexion apres suppression ${ gone }` );
		await other.close();

		// Housekeeping: unconfirmed after 7 days, unused after 3 years (warned first).
		await ac.goto( me, { waitUntil: 'networkidle' } );
		await ac.locator( '[data-signout]' ).click().catch( () => {} );
		await ac.goto( me, { waitUntil: 'networkidle' } );
		const token = await ac.evaluate( () => window.GENRE_ATLAS.contactToken );
		await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { pseudo: 'smoke-lazy', email: 'lazy@example.test', password: 'Long enough password 9', terms: true, token } ) } );
		const daily = body => fetch( `${ BASE }/wp-json/smoke/v1/accounts-daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( body ) } );
		await daily( { days: 8 } );
		const lazyGone = ( await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { login: 'smoke-lazy', password: 'Long enough password 9' } ) } ) ).status;
		await daily( { days: 0, pseudo: 'gina-smoke', idle: 3 * 365 } );
		const warned = await linkIn( 'gina@example.test', 'will be deleted in a month' ).then( () => mails() ).then( m => m.some( x => x.to === 'gina@example.test' && x.subject.includes( 'will be deleted in a month' ) ) );
		await daily( { days: 31, pseudo: 'gina-smoke', idle: 3 * 365 + 31 } );
		const ginaGone = await fetch( `${ BASE }/atlas/gina-smoke/` ).then( r => r.status );
		const ginaLogin = ( await fetch( `${ BASE }/wp-json/genre-atlas/v1/account/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { login: 'gina-smoke', password: 'x' } ) } ) ).status;
		check( 'comptes : non confirme efface apres 7 jours, inutilise 3 ans efface un mois apres un avertissement', lazyGone === 403 && warned && ginaLogin === 403 && ginaGone === 404,
			`non confirme ${ lazyGone }, avertissement ${ warned ? 'envoye' : 'absent' }, inutilise ${ ginaLogin }` );
		await ac.close();
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
	// An artist file goes through the screen in batches (one call per 1,000
	// rows here): ten ranked artists on a genre that had none.
	const [ batchId, batchQid ] = ( process.env.GA_BATCH_GENRE || '' ).split( ':' );
	if ( fileInput && batchQid ) {
		const fs = await import( 'fs' );
		const csv = `${ SHOTS }/batch-artists.csv`;
		fs.writeFileSync( csv, 'wikidata_id,name,genres\n' + Array.from( { length: 10 }, ( _, i ) => `Q99200${ i + 10 },Screen Artist ${ String.fromCharCode( 65 + i ) },${ batchQid }:${ 10 - i }` ).join( '\n' ) + '\n' );
		const steps = [];
		admin.on( 'request', r => r.url().includes( 'admin-ajax.php' ) && ( r.postData() || '' ).includes( 'genre_atlas_import_step' ) && steps.push( r.url() ) );
		await admin.setInputFiles( 'input[type="file"]', csv );
		await admin.locator( 'form[enctype] input[type="submit"]' ).click();
		await admin.waitForSelector( '#ga-import-box.notice-success, #ga-import-box.notice-error', { timeout: 30000 } ).catch( () => {} );
		const done = await admin.locator( '#ga-import-box' ).innerText().catch( () => '' );
		fs.unlinkSync( csv );
		const dossier = await fetch( `${ BASE }/wp-json/genre-atlas/v1/genre/${ batchId }` ).then( r => r.json() );
		const got = ( dossier.artists || [] ).map( a => a.name );
		const keys = ( dossier.artists || [] ).filter( a => a.key ).length;
		check( 'import : un fichier d artistes passe par lots, avec une barre de progression, et garde le rang', /Artist import finished — 10 created/.test( done ) && steps.length >= 1
			&& got.length === 10 && got[ 0 ] === 'Screen Artist J' && keys === 8, `${ done.split( '\n' )[ 0 ] } / ${ got.join( ' · ' ) }` );
		await admin.screenshot( { path: `${ SHOTS }/08b-import-lots.png`, fullPage: true } );
	}
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
		await admin.waitForSelector( '.ga-more-list .ga-mart', { timeout: 10000 } );
		const mine = admin.locator( '.ga-more-list .ga-mart', { hasText: pickName } );
		const shown = await mine.count() ? await mine.innerText() : '';
		const href = await mine.count() ? await mine.locator( '.ga-tout a' ).first().getAttribute( 'href' ) : '';
		const rel = await mine.count() ? await mine.locator( '.ga-tout a' ).first().getAttribute( 'rel' ) : '';
		check( 'propositions : approuvee en un clic, l artiste rejoint MORE ARTISTS, lien nettoye', online && /SUGGESTED BY SMOKE/i.test( shown ) && href === pickUrl && /ugc/.test( rel || '' ),
			`${ href } ${ shown.replace( /\s+/g, ' ' ) }` );
		await admin.locator( '.ga-dsec:has(.ga-more-list)' ).screenshot( { path: `${ SHOTS }/10c-propositions-fiche.png` } );

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
		await admin.waitForSelector( '.ga-more-list .ga-mart', { timeout: 10000 } );
		const still = await admin.locator( '.ga-mart', { hasText: goneName } ).count();
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
		await admin.locator( '.ga-dossier .ga-listen-head [data-play]' ).click();
		await admin.waitForFunction( () => ( window.__yt || [] ).length > 0, null, { timeout: 8000 } ).catch( () => {} );
		const src = JSON.stringify( await admin.evaluate( () => window.__yt || [] ) );
		const plain = await ( await fetch( exAbout ) ).text();
		check( 'exemples : accepte, il s affiche dans LISTEN, se joue au clic et figure dans la page sans script',
			accepted === 1 && row.length === 1 && /smoke example two/i.test( row[ 0 ] ) && /LISTENING EXAMPLE · SMOKE ENSEMBLE/.test( row[ 0 ] )
			&& src.includes( '["video","smokeExmpl2"]' ) && /Example: Smoke Ensemble, “Smoke example two”/.test( plain ),
			`${ accepted } avis, ${ row.join( ' | ' ).replace( /\s+/g, ' ' ) }, lecteur ${ src.slice( 0, 90 ) }, sans script ${ /Example:/.test( plain ) ? 'oui' : 'non' }` );
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
