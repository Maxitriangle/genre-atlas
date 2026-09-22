/* Genre Atlas — front end (no dependency). */
(function () {
  'use strict';
  var CFG = window.GENRE_ATLAS || {};
  var root = document.getElementById('genre-atlas');
  if (!root) return;

  var RING_MAX = 8, ARC_MAX = 8, DIAL_STEP = 6, GROUP_LIMIT = 40;
  var SHAPES = ['circle', 'hex', 'pent', 'square', 'diamond', 'oct', 'tri_up', 'tri_down', 'hex_r'];
  var POLY = { tri_up: [3, -90, 1.18], tri_down: [3, 90, 1.18], square: [4, 45, 1.1], diamond: [4, 0, 1.05], pent: [5, -90, 1.04], hex: [6, 0, 1], hex_r: [6, 30, 1], oct: [8, 22.5, 1] };
  var INK = '#E4DFF5';

  var N = {};            // id -> node, genres and editorial groups alike
  var ROOTS = [];        // roots of the tree: genres with no parent
  var TILES = [];        // the home page entry points, in their own order
  var COUNT = 0;         // genres only: a group is a display device, not a genre
  var S = { view: 'map', centre: 0, open: 0, dial: 0, expanded: {}, q: '', legend: false };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = '0' + n; return n; }
  function rad(d) { return d * Math.PI / 180; }
  function f2(x) { return x.toFixed(2); }
  function byEpoch(a, b) { var ya = a.y || 9999, yb = b.y || 9999; return ya - yb || a.name.localeCompare(b.name); }
  function family(n) { while (n.p && N[n.p] && !n.f) n = N[n.p]; return n; }
  // An entry point closes the displayed lineage: it is where shape, colour
  // and breadcrumbs start, whether or not it has a parent of its own.
  function isTile(n) { return !!n.f || !n.p; }
  // Two lineages: the real one, which the permalinks are built from, and the
  // displayed one, which goes through the editorial group of a wide branch.
  function realPath(n) { var p = [n]; while (p[0].p && N[p[0].p]) p.unshift(N[p[0].p]); return p; }
  function path(n) { var p = [n]; while (!isTile(p[0]) && p[0].dp && N[p[0].dp]) p.unshift(N[p[0].dp]); return p; }
  function depth(n) { return path(n).length - 1; }
  // A group has no page of its own: its link points at the genre it stands under.
  function url(n) { return n.grp ? url(N[n.p]) : CFG.base + realPath(n).map(function (x) { return x.slug; }).join('/') + '/'; }
  function decade(n) { return n.y ? Math.floor(n.y / 10) * 10 + 'S' : 'UNDATED'; }
  function years(list) { return list.map(function (k) { return k.y; }).filter(Boolean); }
  function bpmText(n) { return n.b ? (n.b[0] === n.b[1] ? n.b[0] : n.b[0] + '–' + n.b[1]) + ' BPM' : '—'; }
  function color(n) { return 'oklch(0.80 0.105 ' + family(n).hue + ')'; }

  /* ---------- glyph: drawn from the genre's own data ---------- */
  function frame(shape, F, c, col, sw) {
    if (shape === 'circle' || !POLY[shape]) return '<circle cx="' + c + '" cy="' + c + '" r="' + f2(F) + '" fill="none" stroke="' + col + '" stroke-width="' + f2(sw) + '"/>';
    var p = POLY[shape], pts = [];
    for (var i = 0; i < p[0]; i++) { var a = rad(p[1] + 360 * i / p[0]); pts.push(f2(c + F * p[2] * Math.cos(a)) + ',' + f2(c + F * p[2] * Math.sin(a))); }
    return '<polygon points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' + f2(sw) + '" stroke-linejoin="round"/>';
  }
  function glyph(n, size, o) {
    o = o || {};
    var fam = family(n), col = o.color || color(n), c = size / 2, R = size / 2 - Math.max(3, size * 0.07), sw = Math.max(1.1, size / 44);
    var kids = o.children != null ? o.children : n.kids.length, d = o.depth != null ? o.depth : depth(n);
    var year = o.year !== undefined ? o.year : n.y, bpm = o.bpm !== undefined ? o.bpm : n.b;
    var s = '<svg class="ga-glyph" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">';
    s += '<circle cx="' + c + '" cy="' + c + '" r="' + f2(R) + '" fill="none" stroke="' + col + '" stroke-opacity="0.22"' + (n.grp ? ' stroke-dasharray="3 5"' : '') + ' stroke-width="' + f2(sw * 0.8) + '"/>';
    if (year) {
      var sweep = Math.max(8, Math.min(352, (year - 1850) / 180 * 360)), a0 = rad(-90), a1 = rad(-90 + sweep);
      s += '<path d="M' + f2(c + R * Math.cos(a0)) + ' ' + f2(c + R * Math.sin(a0)) + ' A' + f2(R) + ' ' + f2(R) + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 1 ' + f2(c + R * Math.cos(a1)) + ' ' + f2(c + R * Math.sin(a1)) + '" fill="none" stroke="' + col + '" stroke-width="' + f2(sw * 2.2) + '"/>';
    }
    var k = Math.min(kids, 12), O = R * 0.8, i, a;
    for (i = 0; i < k; i++) { a = rad(-90 + 360 * i / k); s += '<circle cx="' + f2(c + O * Math.cos(a)) + '" cy="' + f2(c + O * Math.sin(a)) + '" r="' + f2(Math.max(1.5, size * 0.035)) + '" fill="' + col + '"/>'; }
    var F = R * 0.58;
    s += frame(fam.shape, F, c, col, sw);
    if (fam.dbl) s += frame(fam.shape, F * 0.78, c, col, sw * 0.7);
    for (i = 0; i < Math.min(d, 5); i++) s += '<circle cx="' + c + '" cy="' + c + '" r="' + f2(R * (0.2 + 0.08 * i)) + '" fill="none" stroke="' + col + '" stroke-opacity="0.7" stroke-width="' + f2(sw * 0.6) + '"/>';
    if (bpm) {
      var ns = Math.round((bpm[0] + bpm[1]) / 2 / 20);
      for (i = 0; i < ns; i++) { a = rad(-90 + 360 * i / ns); s += '<line x1="' + f2(c + R * 0.13 * Math.cos(a)) + '" y1="' + f2(c + R * 0.13 * Math.sin(a)) + '" x2="' + f2(c + R * 0.44 * Math.cos(a)) + '" y2="' + f2(c + R * 0.44 * Math.sin(a)) + '" stroke="' + col + '" stroke-opacity="0.85" stroke-width="' + f2(sw * 0.6) + '"/>'; }
    }
    s += '<circle cx="' + c + '" cy="' + c + '" r="' + f2(Math.max(1.6, R * 0.075)) + '" fill="' + col + '"/></svg>';
    return s;
  }

  /* ---------- data ---------- */
  function build(tree) {
    COUNT = tree.nodes.length;
    tree.nodes.forEach(function (n) { n.kids = []; n.dp = n.p; N[n.id] = n; });
    tree.nodes.forEach(function (n) { if (n.p && N[n.p]) N[n.p].kids.push(n); else { n.p = 0; ROOTS.push(n); } });
    tree.nodes.forEach(function (n) { n.kids.sort(byEpoch); });
    // Entry points: every root, plus any genre flagged as a territory. A tile
    // states its own order; anything left unflagged falls in after them.
    TILES = tree.nodes.filter(isTile)
      .sort(function (a, b) { return (a.f || 99) - (b.f || 99) || a.name.localeCompare(b.name); });
    TILES.forEach(function (r, i) {
      if (!r.shape) { r.shape = SHAPES[i % SHAPES.length]; }
      r.dbl = i >= SHAPES.length;
      if (r.hue == null) r.hue = (295 + 157.5 * (i + 1)) % 360;
    });
    // A tile stands on its own: it leaves its parent's ring, so Metal is never
    // reached as a subgenre of Rock and the two counts stop overlapping. Its
    // real parent is kept, so its permalink does not move.
    TILES.forEach(function (r) {
      if (!r.p || !N[r.p]) return;
      var sib = N[r.p].kids, at = sib.indexOf(r);
      if (at >= 0) sib.splice(at, 1);
      r.dp = 0;
      ROOTS.push(r);
    });
    (function count(list) { list.forEach(function (n) { count(n.kids); n.total = n.kids.reduce(function (t, k) { return t + 1 + k.total; }, 0); }); })(ROOTS);
    regroup();
  }

  /* ---------- editorial grouping of the wide branches ----------
   * Past GROUP_LIMIT children the ring is unreadable, so it shows groups
   * instead of genres. A genre's own label wins; anything left unlabelled
   * falls back to its decade, so a branch is never unreadable while the
   * editorial work is still under way. */
  function regroup() {
    Object.keys(N).forEach(function (id) {
      var parent = N[id];
      if (parent.grp || parent.kids.length <= GROUP_LIMIT) return;
      var order = [], buckets = {};
      parent.kids.forEach(function (k) {
        var label = String(k.g || '').trim().toUpperCase() || decade(k);
        if (!buckets[label]) { buckets[label] = []; order.push(label); }
        buckets[label].push(k);
      });
      // One bucket, or one per genre, would not make the branch any narrower.
      if (order.length < 2 || order.length >= parent.kids.length) return;
      var groups = order.map(function (label, i) {
        var members = buckets[label], ys = years(members);
        var g = {
          id: 'g' + parent.id + '-' + i, grp: true, p: parent.id, dp: parent.id,
          name: label, slug: parent.slug, kids: members,
          y: ys.length ? Math.min.apply(null, ys) : 0,
          last: ys.length ? Math.max.apply(null, ys) : 0,
          total: members.reduce(function (t, m) { return t + 1 + m.total; }, 0)
        };
        members.forEach(function (m) { m.dp = g.id; });
        N[g.id] = g;
        return g;
      });
      groups.sort(byEpoch);
      parent.grouped = parent.kids.length;
      parent.kids = groups;
    });
  }

  /* ---------- state / routing ---------- */
  function select(n, centreOnIt, push) {
    S.legend = false;
    if (!n) { S.centre = 0; S.open = 0; }
    else if (centreOnIt || isTile(n)) { S.centre = n.id; S.open = 0; }
    else { S.centre = n.dp; S.open = n.id; }
    S.dial = 0;
    if (S.open) { // bring the opened child inside the dial window
      var i = N[S.centre].kids.indexOf(N[S.open]);
      var w = windowSize(N[S.centre], N[S.open]);
      if (i >= w) S.dial = Math.min(i - 4, Math.max(0, N[S.centre].kids.length - w));
    }
    if (n) path(n).forEach(function (a) { S.expanded[a.id] = true; });
    if (push !== false && window.history && history.pushState) {
      var u = n ? url(n) + (centreOnIt && !isTile(n) ? '#centre' : '') : CFG.base;
      try { history.pushState({ id: n ? n.id : 0, c: !!centreOnIt }, '', u); } catch (e) { /* embedded on another URL */ }
    }
    document.title = (n ? n.name + ' — ' : '') + (CFG.title || 'Genre');
    render();
  }
  window.addEventListener('popstate', function (e) { var st = e.state || {}; select(N[st.id] || null, st.c, false); });

  /* ---------- shared pieces ---------- */
  function header() {
    return '<header class="ga-header"><a class="ga-logo" href="' + esc(CFG.base) + '" data-go="0">' + (TILES[0] ? glyph(TILES[0], 28, { children: 6, depth: 1, year: 1990, bpm: [120, 120] }) : '') + '<span>GENRE</span></a>' +
      '<nav class="ga-nav" aria-label="Primary"><a href="' + esc(CFG.base) + '" data-go="0"' + (!S.centre && !S.legend ? ' class="on"' : '') + '>INDEX</a><a href="#legend" data-legend="1"' + (S.legend ? ' class="on"' : '') + '>LEGEND</a></nav>' +
      '<div class="ga-search"><label class="ga-sr" for="ga-q">Search genres</label><input id="ga-q" type="search" autocomplete="off" placeholder="SEARCH ' + pad(COUNT, 4) + ' GENRES" value="' + esc(S.q) + '"><div class="ga-results" id="ga-results"></div></div></header>';
  }
  function subbar(sel) {
    var crumbs = '<a href="' + esc(CFG.base) + '" data-go="0">INDEX</a>';
    path(sel).forEach(function (n, i, arr) { crumbs += '<span>/</span>' + (i === arr.length - 1 ? '<strong>' + esc(n.name) + '</strong>' : '<a class="fam" href="' + esc(url(n)) + '" data-go="' + n.id + '">' + esc(n.name) + '</a>'); });
    return '<div class="ga-subbar"><nav class="ga-crumbs" aria-label="Breadcrumb">' + crumbs + '</nav><div class="ga-toggle" role="group" aria-label="View">' +
      '<button data-view="map"' + (S.view === 'map' ? ' class="on" aria-pressed="true"' : '') + '>◎ MAP</button><button data-view="list"' + (S.view === 'list' ? ' class="on" aria-pressed="true"' : '') + '>≡ LIST</button></div></div>';
  }
  function micro(n) { return [n.o, n.y].filter(Boolean).join(' · '); }

  /* ---------- index ---------- */
  function viewIndex() {
    var tiles = TILES.map(function (r, i) {
      return '<a class="ga-tile" href="' + esc(url(r)) + '" data-go="' + r.id + '" style="--fam:' + color(r) + '"><div class="ga-tile-top"><span>' + pad(i + 1) + ' // ' + 'FAMILY' + '</span><span class="ga-badge">' + pad(r.total, 4) + ' GENRES</span></div>' +
        '<div class="ga-tile-body">' + glyph(r, 104) + '<div><h2>' + esc(r.name) + '</h2><p>' + esc(micro(r) || 'ORIGIN: —') + '</p><p>' + pad(r.grouped || r.kids.length) + ' DIRECT SUBGENRES' + (r.grouped ? ' // ' + pad(r.kids.length) + ' GROUPS' : '') + '</p></div></div></a>';
    }).join('');
    return '<main class="ga-index"><div class="ga-hero"><div><p class="ga-micro">[INDEX] MUSIC GENRE ATLAS</p><h1>Every genre.<br>Every lineage.</h1></div>' +
      '<dl class="ga-stats"><div><dt>FAMILIES</dt><dd>' + pad(TILES.length) + '</dd></div><div><dt>GENRES</dt><dd>' + pad(COUNT, 4) + '</dd></div></dl></div><div class="ga-grid">' + tiles + '</div></main>';
  }

  /* ---------- detail panel ---------- */
  function panel(n) {
    var lineage = path(n).slice(0, -1).map(function (a) { return a.name; }).join(' / ');
    var rows = (n.grp
      ? [['GENRES', pad(n.kids.length) + ' DIRECT · ' + pad(n.total) + ' TOTAL'], ['EPOCH', n.y ? n.y + (n.last && n.last !== n.y ? ' → ' + n.last : '') : '—']]
      : [['ORIGIN', n.o || '—'], ['EPOCH', n.y || '—'], ['TEMPO', bpmText(n)], ['SUBGENRES', pad(n.kids.length) + ' DIRECT · ' + pad(n.total) + ' TOTAL']])
      .map(function (r) { return '<div class="ga-row"><span>' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>'; }).join('');
    var kids = n.kids.slice(0, 6).map(function (k) { return '<a class="ga-kid" href="' + esc(url(k)) + '" data-go="' + k.id + '">' + glyph(k, 28) + '<span>' + esc(k.name) + '</span><em>' + (k.y || '') + '</em></a>'; }).join('');
    var isCentre = S.centre === n.id;
    return '<aside class="ga-panel" aria-label="Selected genre" style="--fam:' + color(n) + '"><div class="ga-panel-top"><span>LEVEL ' + pad(depth(n)) + '</span><span class="fam">' + (n.grp ? '[GROUP]' : '[SELECTED]') + '</span></div>' +
      '<div class="ga-panel-head">' + glyph(n, 120) + '<div><h1>' + esc(n.name) + '</h1>' + (lineage ? '<p class="fam">↳ ' + esc(lineage) + '</p>' : '<p class="fam">FAMILY</p>') + (n.grp ? '<p class="ga-micro">EDITORIAL GROUP — NOT A GENRE</p>' : '') + '</div></div>' +
      (n.d ? '<p class="ga-desc">' + esc(n.d) + '</p>' : '') + '<div>' + rows + '</div>' +
      (n.kids.length && !isCentre ? '<a class="ga-cta" href="' + esc(url(n)) + '#centre" data-centre="' + n.id + '"><span>CENTRE ON ' + esc(n.name) + '</span><span>⊕</span></a>' : '') +
      (n.kids.length ? '<div class="ga-kids"><p class="ga-micro">SUBGENRES — BY EPOCH</p>' + kids + (n.kids.length > 6 ? '<a class="ga-more" href="' + esc(url(n)) + '#centre" data-centre="' + n.id + '"><span>VIEW ALL ' + pad(n.kids.length) + '</span><span>→</span></a>' : '') + '</div>' : '') + '</aside>';
  }

  /* ---------- map ---------- */
  // Ring capacity: 8 around a family; fewer deeper down, where the horizontal axis is kept for the lineage.
  function windowSize(centre, open) { return isTile(centre) ? RING_MAX : (open ? 6 : 7); }
  function viewMap(centre, open) {
    var box = root.querySelector('.ga-map'), W = box ? box.clientWidth : 1040, H = box ? box.clientHeight : 880;
    W = Math.max(W, 720); H = Math.max(H, 620);
    var CX = W * 0.42, CY = H / 2, R1 = Math.min(230, H * 0.27), R2 = Math.min(400, H * 0.46, W * 0.4);
    var anc = path(centre).slice(0, -1), all = centre.kids, ring = all, win = windowSize(centre, open), dial = all.length > win;
    if (dial) { ring = all.slice(S.dial, S.dial + win); if (open && ring.indexOf(open) < 0) ring = ring.slice(0, win - 1).concat([open]); }
    var others = ring.filter(function (k) { return k !== open; }), pos = {}, angs = [], i, n = others.length;
    if (open) pos[open.id] = [CX + R1, CY, 0];
    if (anc.length) {                       // keep the horizontal axis for the lineage
      var up = Math.ceil(n / 2), dn = n - up, lo = open ? 45 : 25;
      for (i = 0; i < up; i++) angs.push(-(lo + (i + 0.5) * (155 - lo) / up));
      for (i = 0; i < dn; i++) angs.push(lo + (i + 0.5) * (155 - lo) / dn);
      angs.sort(function (a, b) { return a - b; });
    } else if (open) { for (i = 0; i < n; i++) angs.push(n > 1 ? 50 + 260 * i / (n - 1) : 180); }
    else { for (i = 0; i < n; i++) angs.push(-90 + 360 * i / n); }
    others.forEach(function (k, j) { var r = R1 + (n > 6 ? (j % 2 ? 30 : -16) : 0); pos[k.id] = [CX + r * Math.cos(rad(angs[j])), CY + r * Math.sin(rad(angs[j])), angs[j]]; });

    var arc = open ? open.kids.slice(0, ARC_MAX) : [], more = open ? open.kids.length - arc.length : 0, slots = arc.length + (more ? 1 : 0), apos = [];
    var span = slots > 1 ? Math.min(96, 14 * (slots - 1)) : 0;
    for (i = 0; i < slots; i++) { var a = rad(slots > 1 ? -span / 2 + span * i / (slots - 1) : 0); apos.push([CX + R2 * Math.cos(a), CY + R2 * Math.sin(a)]); }

    var col = color(centre), svg = '<svg class="ga-links" width="' + W + '" height="' + H + '" aria-hidden="true"><defs><pattern id="ga-dots" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="0.9" fill="' + INK + '" fill-opacity="0.13"/></pattern></defs><rect width="100%" height="100%" fill="url(#ga-dots)"/>';
    [R1, R2].forEach(function (r) { svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + r + '" fill="none" stroke="' + INK + '" stroke-opacity="0.08" stroke-dasharray="2 6"/>'; });
    ring.forEach(function (k) { var p = pos[k.id], on = k === open; svg += '<line x1="' + CX + '" y1="' + CY + '" x2="' + f2(p[0]) + '" y2="' + f2(p[1]) + '" stroke="' + col + '" stroke-opacity="' + (on ? 0.9 : 0.32) + '" stroke-width="' + (on ? 1.6 : 1) + '"/>'; });
    apos.forEach(function (p, j) { svg += '<line x1="' + f2(CX + R1) + '" y1="' + CY + '" x2="' + f2(p[0]) + '" y2="' + f2(p[1]) + '" stroke="' + col + '" stroke-opacity="0.75" stroke-width="1.2"' + (more && j === slots - 1 ? ' stroke-dasharray="2 4"' : '') + '/>'; });
    var ax = anc.slice().reverse().map(function (a, k) { return [a, CX - R1 - 80 - k * 96]; }).filter(function (p) { return p[1] > 40; }), prev = CX;
    ax.forEach(function (p) { svg += '<line x1="' + prev + '" y1="' + CY + '" x2="' + p[1] + '" y2="' + CY + '" stroke="' + col + '" stroke-opacity="0.5" stroke-dasharray="1 5"/>'; prev = p[1]; });
    svg += '</svg>';

    function node(k, x, y, size, sub, cls, centreIt) {
      return '<a class="ga-node ' + (cls || '') + '" href="' + esc(url(k)) + (centreIt ? '#centre' : '') + '" ' + (centreIt ? 'data-centre' : 'data-go') + '="' + k.id + '" style="left:' + f2(x) + 'px;top:' + f2(y - size / 2) + 'px;--g:' + size + 'px">' + glyph(k, size) + '<span class="ga-name">' + esc(k.name) + '</span><span class="ga-sub">' + esc(sub) + '</span></a>';
    }
    var html = svg;
    ax.forEach(function (p, k) { html += node(p[0], p[1], CY, k ? 32 : 40, k ? '← LEVEL ' + pad(depth(p[0])) : '← PARENT', 'anc', true); });
    html += node(centre, CX, CY, 112, (centre.y ? centre.y + ' · ' : '') + pad(centre.total) + ' SUB', 'centre', true);
    ring.forEach(function (k) {
      var on = k === open, p = pos[k.id];
      html += node(k, p[0], p[1], 56, on ? (k.y ? k.y + ' · ' : '') + 'OPEN' : (k.y || '') + (k.total ? (k.y ? ' · ' : '') + '+' + pad(k.total) + ' SUB' : ''), on ? 'open' : '', on && k.kids.length);
    });
    apos.forEach(function (p, j) {
      if (more && j === slots - 1) { html += '<a class="ga-leaf more" href="' + esc(url(open)) + '#centre" data-centre="' + open.id + '" style="left:' + f2(p[0]) + 'px;top:' + f2(p[1]) + 'px"><span class="ga-plus">+' + pad(more) + '</span><span><b>MORE</b><i>' + (open.kids[ARC_MAX].y || '') + ' → ' + (open.kids[open.kids.length - 1].y || '') + '</i></span></a>'; return; }
      var k = arc[j];
      html += '<a class="ga-leaf" href="' + esc(url(k)) + '" data-go="' + k.id + '" style="left:' + f2(p[0]) + 'px;top:' + f2(p[1]) + 'px">' + glyph(k, 40) + '<span><b>' + esc(k.name) + '</b><i>' + esc(micro(k)) + (k.total ? ' · +' + pad(k.total) + ' SUB' : '') + '</i></span></a>';
    });
    var info = '<div class="ga-mapinfo"><p class="ga-micro">MAP NODE — ' + esc(centre.name) + '</p><p class="ga-micro">LEVELS ' + pad(anc.length + 1) + ' → ' + pad(anc.length + 2) + ' · CLICK TO OPEN · CLICK AGAIN TO CENTRE</p>';
    if (centre.grouped) {
      info += '<p class="ga-micro">' + pad(centre.grouped) + ' SUBGENRES GROUPED INTO ' + pad(all.length) + ' — TOO WIDE TO SHOW ONE BY ONE</p>';
    }
    if (dial) {
      var ys = all.filter(function (k) { return k.y; }), first = ring[0], last = ring[Math.min(ring.length, win) - 1], lo2 = S.dial / all.length * 100, wd = win / all.length * 100;
      info += '<div class="ga-dial"><button data-dial="-1" aria-label="Earlier subgenres"' + (S.dial <= 0 ? ' disabled' : '') + '>◀</button><div class="ga-dial-track"><span style="left:' + f2(lo2) + '%;width:' + f2(wd) + '%"></span></div><button data-dial="1" aria-label="Later subgenres"' + (S.dial + win >= all.length ? ' disabled' : '') + '>▶</button></div>' +
        '<p class="ga-micro">' + pad(S.dial + 1) + '–' + pad(Math.min(S.dial + win, all.length)) + ' / ' + pad(all.length) + (first.y && last.y ? ' · ' + first.y + ' → ' + last.y : '') + (ys.length ? '' : ' · NO DATES YET') + (all.length > GROUP_LIMIT ? ' · WIDE BRANCH' : '') + '</p>';
    }
    return html + info + '</div>';
  }

  /* ---------- list ---------- */
  function viewList(sel) {
    var fam = family(sel), rows = '';
    (function walk(n, pre, preKids) {
      var open = !!S.expanded[n.id], on = n === sel;
      rows += '<div class="ga-lrow' + (on ? ' on' : '') + '" role="row"><span class="ga-lname"><span class="ga-tree" aria-hidden="true">' + pre + '</span>' +
        (n.kids.length ? '<button class="ga-exp" data-exp="' + n.id + '" aria-expanded="' + open + '" aria-label="' + (open ? 'Collapse ' : 'Expand ') + esc(n.name) + '">' + (open ? '▾' : '▸') + '</button>' : '<span class="ga-exp"></span>') +
        '<a href="' + esc(url(n)) + '" data-go="' + n.id + '">' + glyph(n, 30) + '<b>' + esc(n.name) + '</b></a></span><span class="dim">' + esc(n.o || '—') + '</span><span>' + (n.y || '—') + '</span><span>' + esc(n.b ? bpmText(n).replace(' BPM', '') : '—') + '</span><span class="dim">L' + pad(depth(n)) + '</span><span>' + (n.kids.length ? pad(n.kids.length) : '—') + '</span></div>';
      if (open) n.kids.forEach(function (k, j) { var last = j === n.kids.length - 1; walk(k, preKids + (last ? '└─ ' : '├─ '), preKids + (last ? '   ' : '│  ')); });
    })(fam, '', '');
    return '<main class="ga-list" style="--fam:' + color(fam) + '"><div class="ga-lhead" role="row"><span>GENRE</span><span>ORIGIN</span><span>EPOCH</span><span>BPM</span><span>LEVEL</span><span>SUB</span></div>' + rows + '</main>';
  }

  /* ---------- mobile: one vertical tree ---------- */
  function viewMobile(centre, open) {
    var trail = '<a href="' + esc(CFG.base) + '" data-go="0"><span class="up">↑</span>INDEX</a>';
    var ancs = path(centre).slice(0, -1), hidden = Math.max(0, ancs.length - 2);
    if (hidden) trail += '<p class="ga-micro" style="padding:6px 0 6px 38px">… ' + pad(hidden) + ' LEVEL' + (hidden > 1 ? 'S' : '') + ' ABOVE</p>';
    ancs.slice(hidden).forEach(function (a, j) { var i = hidden + j; trail += '<a class="fam" href="' + esc(url(a)) + '#centre" data-centre="' + a.id + '">' + glyph(a, 28) + '<b>' + esc(a.name) + '</b><i>LEVEL ' + pad(i) + '</i></a>'; });
    var rows = centre.kids.map(function (k) {
      var on = k === open, h = '<a class="ga-mrow' + (on ? ' on' : '') + '" href="' + esc(url(k)) + '" ' + (on ? 'data-centre="' + centre.id + '"' : 'data-go="' + k.id + '"') + ' aria-expanded="' + on + '">' + glyph(k, 40) + '<span><b>' + esc(k.name) + '</b><i>' + esc(micro(k)) + '</i></span>' + (k.total ? '<em>+' + pad(k.total) + '</em>' : '') + '</a>';
      if (on) {
        h += '<div class="ga-msub">' + (k.d ? '<p class="ga-desc">' + esc(k.d) + '</p>' : '') + '<p class="ga-micro">' + esc([k.o, k.y, k.b ? bpmText(k) : ''].filter(Boolean).join(' · ') || 'NO DATA YET') + '</p>' +
          k.kids.map(function (g) { return '<a class="ga-mrow sub" href="' + esc(url(g)) + '" data-go="' + g.id + '">' + glyph(g, 32) + '<span><b>' + esc(g.name) + '</b><i>' + esc(micro(g)) + '</i></span>' + (g.total ? '<em>+' + pad(g.total) + '</em>' : '') + '</a>'; }).join('') +
          (k.kids.length ? '<a class="ga-cta" href="' + esc(url(k)) + '#centre" data-centre="' + k.id + '"><span>CENTRE ON ' + esc(k.name) + '</span><span>⊕</span></a>' : '') + '</div>';
      }
      return h;
    }).join('');
    return '<main class="ga-mobile" style="--fam:' + color(centre) + '"><nav class="ga-trail" aria-label="Lineage">' + trail + '</nav><section class="ga-mcentre">' + glyph(centre, 112) + '<div><p class="ga-micro">' + (isTile(centre) ? 'FAMILY' : 'LEVEL ' + pad(depth(centre))) + '</p><h1>' + esc(centre.name) + '</h1><p>' + esc(micro(centre)) + '</p><p class="dim">' + pad(centre.kids.length) + ' DIRECT · ' + pad(centre.total) + ' TOTAL</p></div></section>' +
      (centre.d ? '<p class="ga-desc pad">' + esc(centre.d) + '</p>' : '') + '<p class="ga-micro pad">SUBGENRES — BY EPOCH</p><div class="ga-mtree">' + (rows || '<p class="ga-micro pad">NO SUBGENRE</p>') + '</div></main>';
  }

  /* ---------- legend ---------- */
  function viewLegend() {
    var r = TILES[0]; if (!r) return '';
    function rule(code, title, items) { return '<section><h2><b>' + code + '</b> ' + title + '</h2><div>' + items.map(function (it) { return '<figure>' + it[0] + '<figcaption>' + it[1] + '</figcaption></figure>'; }).join('') + '</div></section>'; }
    var base = { children: 0, depth: 0, year: 1990, bpm: null };
    function g(o, n) { var x = {}; for (var k in base) x[k] = base[k]; for (k in o) x[k] = o[k]; return glyph(n || r, 56, x); }
    return '<main class="ga-legend"><div><p class="ga-micro">[LEGEND] GLYPH SPECIFICATION</p><h1>How to read<br>a glyph</h1><p class="ga-desc">No glyph is drawn by hand. Each one is generated from the genre\'s own data, so a subgenre always looks like its family. A missing arc or missing spokes simply mean the data has not been filled in yet.</p></div><div>' +
      rule('A', 'FAMILY → FRAME + COLOUR', TILES.slice(0, 6).map(function (f) { return [g({}, f), esc(f.name)]; })) +
      rule('B', 'TEMPO → SPOKES (ONE PER 20 BPM)', [60, 100, 140, 180].map(function (b) { return [g({ bpm: [b, b] }), b + ' BPM']; })) +
      rule('C', 'DEPTH → RINGS', [0, 1, 2, 3, 4].map(function (d) { return [g({ depth: d }), 'LEVEL ' + pad(d)]; })) +
      rule('D', 'SUBGENRES → ORBIT NODES (MAX 12)', [0, 3, 7, 12].map(function (k) { return [g({ children: k }), pad(k) + ' SUB']; })) +
      rule('E', 'EPOCH → OUTER ARC (1850 → TODAY)', [null, 1900, 1950, 1985, 2015].map(function (y) { return [g({ year: y }), y || 'UNKNOWN']; })) + '</div></main>';
  }

  /* ---------- render ---------- */
  function isMobile() { return root.clientWidth < 900; }
  function render() {
    var focus = document.activeElement && document.activeElement.id === 'ga-q';
    var centre = N[S.centre], open = N[S.open] || null, html = header();
    if (S.legend) html += viewLegend();
    else if (!centre) html += viewIndex();
    else if (isMobile()) html += viewMobile(centre, open);
    else {
      html += subbar(open || centre);
      html += S.view === 'list' ? viewList(open || centre) : '<div class="ga-stage"><main class="ga-map" aria-label="Genre map" style="--fam:' + color(centre) + '"></main>' + panel(open || centre) + '</div>';
    }
    root.innerHTML = html;
    root.classList.add('ga-ready');
    var map = root.querySelector('.ga-map');
    if (map) map.innerHTML = viewMap(centre, open);   // second pass: needs the real size of the map
    if (focus) { var q = document.getElementById('ga-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); results(); }
  }
  function results() {
    var box = document.getElementById('ga-results'), q = S.q.trim().toLowerCase(); if (!box) return;
    if (q.length < 2) { box.innerHTML = ''; return; }
    var hits = Object.keys(N).map(function (id) { return N[id]; }).filter(function (n) { return !n.grp && n.name.toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || b.total - a.total; }).slice(0, 8);
    box.innerHTML = hits.length ? hits.map(function (n) { return '<a href="' + esc(url(n)) + '" data-go="' + n.id + '" style="--fam:' + color(n) + '">' + glyph(n, 28) + '<span><b>' + esc(n.name) + '</b><i>' + esc(path(n).slice(0, -1).map(function (a) { return a.name; }).join(' / ')) + '</i></span></a>'; }).join('') : '<p class="ga-micro">NO MATCH</p>';
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-centre],[data-view],[data-exp],[data-dial],[data-legend]');
    if (!t || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (t.hasAttribute('data-legend')) { S.legend = true; S.q = ''; render(); }
    else if (t.hasAttribute('data-centre')) { S.q = ''; select(N[t.getAttribute('data-centre')], true); }
    else if (t.hasAttribute('data-go')) { S.q = ''; select(N[t.getAttribute('data-go')] || null, false); }
    else if (t.hasAttribute('data-view')) { S.view = t.getAttribute('data-view'); render(); }
    else if (t.hasAttribute('data-exp')) { var id = t.getAttribute('data-exp'); S.expanded[id] = !S.expanded[id]; render(); }
    else if (t.hasAttribute('data-dial')) { var len = N[S.centre].kids.length, w = windowSize(N[S.centre], N[S.open]); S.dial = Math.max(0, Math.min(len - w, S.dial + DIAL_STEP * t.getAttribute('data-dial'))); render(); }
  });
  root.addEventListener('input', function (e) { if (e.target.id === 'ga-q') { S.q = e.target.value; results(); } });
  var timer; window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(render, 150); });

  fetch(CFG.treeUrl).then(function (r) { return r.json(); }).then(function (tree) {
    build(tree);
    var start = N[CFG.start] || null;
    select(start, start && location.hash === '#centre', false);
    if (history.replaceState) { try { history.replaceState({ id: start ? start.id : 0, c: location.hash === '#centre' }, ''); } catch (e) { /* noop */ } }
  }).catch(function () { root.classList.add('ga-error'); });
})();
