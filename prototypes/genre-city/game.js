  /* =====================================================================
   * Genre City, playable prototype. The Terminal, then Electronic City,
   * built from the atlas's own data, and the inside of every genre.
   * ===================================================================== */
  var SITE = 'https://www.every-genre.com';
  var HUE = 295, TILE = 16;

  /* ---------- the data: the same tree and grouping as the atlas map ---------- */
  var N = {}, ROOT = null, GROUP_LIMIT = 8;
  function byName(a, b) { return a.name.localeCompare(b.name); }
  DATA.forEach(function (r) { N[r.i] = { id: r.i, p: r.p, slug: r.s, name: r.n, g: r.g, y: r.y, o: r.o, d: r.d, a: r.a, kids: [] }; });
  Object.keys(N).forEach(function (id) { var n = N[id]; if (n.p && N[n.p]) N[n.p].kids.push(n); else ROOT = n; });
  (function count(n) { n.kids.forEach(count); n.kids.sort(byName); n.total = n.kids.reduce(function (t, k) { return t + 1 + k.total; }, 0); })(ROOT);
  function realPath(n) { var p = [n]; while (p[0].p && N[p[0].p]) p.unshift(N[p[0].p]); return p; }
  function pageUrl(n) { while (n.grp) n = N[n.p]; return SITE + '/genre/' + realPath(n).map(function (x) { return x.slug; }).join('/') + '/about/'; }
  function groupPath(n) { return String(n.g || '').toUpperCase().split('>').map(function (x) { return x.trim(); }).filter(Boolean); }
  function alphaBuckets(list) {
    var sorted = list.slice().sort(byName), n = Math.ceil(sorted.length / GROUP_LIMIT), size = Math.ceil(sorted.length / n), order = [], buckets = {};
    for (var i = 0; i < sorted.length; i += size) {
      var part = sorted.slice(i, i + size), label = part[0].name.charAt(0).toUpperCase();
      if (part.length > 1) label += '–' + part[part.length - 1].name.charAt(0).toUpperCase();
      while (buckets[label]) label += "'";
      buckets[label] = part; order.push(label);
    }
    return { order: order, buckets: buckets };
  }
  var GID = 0;
  function cut(parent, depth) {
    if (parent.kids.length <= GROUP_LIMIT) return;
    var labelled = [], loose = [], order = [], buckets = {};
    parent.kids.forEach(function (k) { (groupPath(k).length > depth ? labelled : loose).push(k); });
    labelled.forEach(function (k) { var l = groupPath(k)[depth]; if (!buckets[l]) { buckets[l] = []; order.push(l); } buckets[l].push(k); });
    var total = order.length + loose.length;
    if (total < 2 || total >= parent.kids.length || total > GROUP_LIMIT) {
      var a = alphaBuckets(parent.kids); order = a.order; buckets = a.buckets; loose = [];
      if (order.length < 2 || order.length >= parent.kids.length) return;
    }
    var groups = order.map(function (label) {
      var members = buckets[label], g = { id: 'g' + (++GID), grp: true, p: parent.grp ? parent.p : parent.id, name: label, kids: members,
        total: members.reduce(function (t, m) { return t + 1 + m.total; }, 0) };
      N[g.id] = g; return g;
    });
    parent.kids = groups.concat(loose).sort(byName);
    groups.forEach(function (g) { cut(g, depth + 1); });
  }
  (function regroup(n) { cut(n, 0); n.kids.forEach(function (k) { if (!k.grp || k.kids) regroup(k); }); })(ROOT);
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- a world: a map of tiles, its art, what blocks and what answers ---------- */
  function World(cols, rows, name) {
    this.cols = cols; this.rows = rows; this.W = cols * TILE; this.H = rows * TILE; this.name = name;
    var mk = function (w, h) { var x = document.createElement('canvas'); x.width = w; x.height = h; return x; };
    this.base = mk(this.W, this.H); this.emis = mk(this.W, this.H); this.lite = mk(this.W, this.H);
    this.g = this.base.getContext('2d'); this.e = this.emis.getContext('2d'); this.l = this.lite.getContext('2d');
    this.labels = []; this.solid = []; this.trig = {}; this.acts = {}; this.bumps = {};
    for (var j = 0; j < rows; j++) { this.solid[j] = []; for (var i = 0; i < cols; i++) this.solid[j][i] = false; }
  }
  ['px', 'glow', 'pool', 'sprite', 'label'].forEach(function (m) { World.prototype[m] = Scene.prototype[m]; });
  // A rectangle of art that cannot be walked through: the tiles whose lower half it covers.
  World.prototype.block = function (x, y, w, h) {
    for (var j = Math.max(0, Math.floor(y / TILE)); j < Math.min(this.rows, Math.ceil((y + h) / TILE)); j++)
      for (var i = Math.max(0, Math.floor(x / TILE)); i < Math.min(this.cols, Math.ceil((x + w) / TILE)); i++) {
        var tx0 = i * TILE + 3, tx1 = i * TILE + 13, ty0 = j * TILE + 8, ty1 = j * TILE + 15;
        if (x < tx1 && x + w > tx0 && y < ty1 && y + h > ty0) this.solid[j][i] = true;
      }
  };
  World.prototype.wall = function (i, j) { if (j >= 0 && j < this.rows && i >= 0 && i < this.cols) this.solid[j][i] = true; };
  World.prototype.free = function (i, j) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows && !this.solid[j][i]; };
  World.prototype.on = function (i, j, what) { this.solid[j][i] = false; this.trig[i + ',' + j] = what; };
  World.prototype.act = function (i, j, what) { this.acts[i + ',' + j] = what; };

  /* ---------- the hero, seen from four sides, two steps each ---------- */
  var HOOD_BACK = mirror(['......ooo', '....ooppp', '...opPHHH', '..opHHHHH', '..oHHHHHH', '.oHHHHHHH', 'nnpHHHHHH', 'nnpHHHHHH', 'nnpHHHHHH', 'nnpHhHHHH', '.ophHHHHH', '..ohHHHHH', '..ohhHHHH', '...ohhhhh']);
  function mirror(half) { return half.map(function (r) { return r + r.split('').reverse().join(''); }); }
  var HOOD_SIDE = [
    '......oooooo......', '....ooHHHHHHoo....', '...oHHHHHHHHHHo...', '..oHHHHHHhhhhHo...', '..oHHHHhqqqqqo....', '..oHHpnnqrrsso....',
    '..oHHpnnqssEso....', '..oHHpnnqsssssso..', '..oHHHppqssSso....', '...oHHHhqSmSo.....', '....oHHhhSSSo.....', '.....oooooSo......', '.....ooSSSo.......'];
  function heroRows(dir, frame) {
    if (dir === 'left' || dir === 'right') return HOOD_SIDE.concat(SIDE_BODY, SIDE_LEGS[frame % 2]);
    var rows = (dir === 'up' ? HOOD_BACK.concat(person('hood', 'jacket').slice(14).map(function (r) { return r.replace(/z/g, 'j'); })) : person('hood', 'jacket')).slice();
    if (frame) {                                  // one leg lifted: that half of the legs moves up a pixel
      var from = rows.length - 5, left = frame === 1;
      for (var j = from; j < rows.length; j++) {
        var below = j + 1 < rows.length ? rows[j + 1] : '..................';
        var r = rows[j].split(''), b = below.split('');
        for (var i = left ? 0 : 9; i < (left ? 9 : 18); i++) r[i] = b[i] || '.';
        rows[j] = r.join('');
      }
    }
    return rows;
  }
  function drawHero(g, e, x, feetY, dir, frame) {
    var rows = heroRows(dir, frame);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x + 4, feetY - 1, 10, 2); g.fillRect(x + 3, feetY, 12, 1);
    Scene.prototype.sprite.call({ g: g, e: e }, rows, LOOKS.hero, x, feetY - rows.length, g, e, dir === 'left', true);
  }

  /* =================== the Terminal =================== */
  var FAM = [
    ['ELECTRONIC', 'circle', 295], ['ROCK', 'hex', 103], ['METAL', 'pent', 271], ['PUNK', 'square', 79], ['FOLK', 'diamond', 247],
    ['LATIN', 'oct', 55], ['ART MUSIC', 'tri_up', 223], ['HIP-HOP', 'tri_down', 31], ['POP', 'hex_r', 199], ['JAZZ', 'circle', 7],
    ['EXPERIMENTAL', 'hex', 175], ['R&B', 'pent', 343], ['COUNTRY', 'square', 151], ['BLUES', 'diamond', 319], ['REGGAE', 'oct', 127]
  ];
  function buildTerminal() {
    var s = new World(24, 15, 'THE TERMINAL'), W = s.W, g = s.g, R = rnd(77);
    for (var y = 48; y < 186; y += 16) for (var x = 0; x < W; x += 16) {
      s.px(x, y, 16, 16, R() < .5 ? '#24202C' : '#211D29'); s.px(x, y, 16, 1, '#302A3A'); s.px(x, y, 1, 16, '#302A3A'); s.px(x + 15, y + 1, 1, 15, '#17141D'); s.px(x + 1, y + 15, 15, 1, '#17141D');
      for (var d = 0; d < 6; d++) s.px(x + 3 + d, y + 9 - d, 1, 1, 'rgba(255,255,255,.035)');
      if (R() < .07) { var cx0 = x + 3 + Math.floor(R() * 8); for (var c = 0; c < 9; c++) { s.px(cx0, y + 2 + c, 1, 1, '#141118'); cx0 += R() < .4 ? 1 : 0; } }
    }
    for (var gy = 0; gy < 10; gy++) { g.fillStyle = 'rgba(8,6,12,' + (.32 - gy * .032) + ')'; g.fillRect(0, 55 + gy, W, 1); g.fillRect(0, 177 - gy, W, 1); }
    [50, 178].forEach(function (ty) { s.px(0, ty, W, 5, '#3A3424'); for (var tx = 1; tx < W; tx += 3) { s.px(tx, ty + 1, 2, 1, '#C9B65E'); s.px(tx, ty + 3, 2, 1, '#A8964A'); } });
    function wallArt(y0, h) {
      s.px(0, y0, W, h, '#1A1720');
      for (var j = y0; j < y0 + h; j += 4) for (var i = (j / 4 % 2) * 4; i < W; i += 8) {
        var v = R(); s.px(i, j, 8, 4, v < .04 ? '#141118' : v < .5 ? '#1F1B26' : '#1D1924'); s.px(i, j, 8, 1, v < .04 ? '#18151E' : '#28232F'); s.px(i, j, 1, 4, '#141118');
        if (v > .97) { s.px(i + 2, j + 1, 1, 1, '#0E0C12'); s.px(i + 3, j + 2, 2, 1, '#0E0C12'); }
      }
    }
    wallArt(0, 48); wallArt(186, 54);
    for (var wg = 0; wg < 8; wg++) { g.fillStyle = 'rgba(8,6,12,' + (wg * .05) + ')'; g.fillRect(0, 38 + wg, W, 1); g.fillRect(0, 196 - wg, W, 1); }
    s.px(0, 45, W, 1, K.metal3); s.px(0, 46, W, 2, K.out); s.px(0, 186, W, 2, K.out); s.px(0, 188, W, 1, K.metal3);
    function reflectUp(x, w, y0, y1, col, a) {
      for (var yy = y0; yy > y1; yy--) { var f = 1 - (y0 - yy) / (y0 - y1); g.globalAlpha = a * f * f; for (var xx = x; xx < x + w; xx++) if ((xx - x) % 4 === 0 && ((xx + yy) % 2 === 0 || f > .8)) { g.fillStyle = col; g.fillRect(xx, yy, 1, 1); } }
      g.globalAlpha = 1;
    }
    // walls are solid; each stairway is a way in (open) or a closed line
    for (var i = 0; i < 24; i++) { for (var j = 0; j < 3; j++) s.wall(i, j); for (var j2 = 12; j2 < 15; j2++) s.wall(i, j2); }
    var STAIRS = [];
    FAM.forEach(function (f, i) {
      var top = i < 8, k = top ? i : i - 8, n = top ? 8 : 7, span = W / n, gx = Math.round(k * span + span / 2 - 15), hue = f[2], gy = top ? 15 : 189;
      STAIRS.push([gx, gy, top]);
      s.px(gx - 3, gy - 1, 36, top ? 33 : 34, K.out);
      for (var st = 0; st < 32; st += 3) { var dd = top ? st : 31 - st, c = 10 + dd; s.px(gx, gy + st, 30, 3, 'rgb(' + c + ',' + (c - 2) + ',' + (c + 6) + ')'); s.px(gx, gy + st, 30, 1, 'rgba(255,255,255,.07)'); s.px(gx, gy + st + 1, 30, 1, deepc(hue, .05 + dd * .006)); }
      s.px(gx - 2, gy - 1, 2, 33, K.metal2); s.px(gx - 2, gy - 1, 1, 33, K.metal4); s.px(gx + 30, gy - 1, 2, 33, K.metal2);
      s.glow(gx, gy - 1, 1, 33, neonc(hue)); s.glow(gx + 29, gy - 1, 1, 33, neonc(hue));
      s.pool(gx + 15, top ? 60 : 174, 30, 12, 'oklch(0.80 0.105 ' + hue + ' / A)', .3);
      if (top) reflect(s, gx + 1, 28, 56, 104, neonc(hue), .32); else reflectUp(gx + 1, 28, 176, 130, neonc(hue), .32);
      var py = top ? 2 : 226, pw = Math.min(46, Math.floor(span) - 4), px = gx + 15 - Math.round(pw / 2);
      plate(s, px, py, pw, 11, hue); pixShape(s, f[1], px + 6, py + 5, 2.6, neonc(hue));
      s.label(px + 11, py, pw - 12, 11, (i < 9 ? '0' : '') + (i + 1) + ' ' + f[0], hue, null, f[0].length > 9 ? 8 : 9);
      var row = top ? 2 : 12, line = (i < 9 ? 'LINE 0' : 'LINE ') + (i + 1) + ' · ' + f[0];
      for (var tx = Math.floor((gx + 2) / TILE); tx <= Math.floor((gx + 27) / TILE); tx++) {
        if (i === 0) s.on(tx, row, { go: 'city', say: 'ELECTRONIC CITY' });
        else s.bumps[tx + ',' + row] = { text: line + '. This line opens in a later version of the game. For now, line 01 runs to Electronic City.' };
      }
    });
    for (var lx = 32; lx < W; lx += 64) { s.pool(lx, 116, 40, 22, 'rgba(210,205,255,A)', .14); s.pool(lx, 116, 14, 8, 'rgba(230,225,255,A)', .12); }
    var bx = 102, by = 72, bw = 180;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(bx + 4, by + 34, bw, 4);
    s.px(bx - 2, by - 2, bw + 4, 34, K.out); s.px(bx - 1, by - 1, bw + 2, 32, K.metal); s.px(bx - 1, by - 1, bw + 2, 1, K.metal4); s.px(bx, by, bw, 30, '#0B0910');
    for (var sc = by + 1; sc < by + 30; sc += 2) s.px(bx, sc, bw, 1, 'rgba(255,255,255,.02)');
    s.px(bx + 8, by + 30, 2, 8, K.metal); s.px(bx + bw - 10, by + 30, 2, 8, K.metal);
    s.label(bx, by + 2, bw, 10, 'EVERY GENRE · 15 LINES', 270, null, 11);
    s.px(bx + 10, by + 20, bw - 20, 1, '#3A3446');
    FAM.forEach(function (f, i) { var dx = bx + 12 + Math.round(i * (bw - 24) / 14); s.px(dx - 2, by + 18, 5, 5, K.out); s.glow(dx - 1, by + 19, 3, 3, neonc(f[2])); });
    s.e.fillStyle = 'rgba(194,176,251,.1)'; s.e.fillRect(bx, by, bw, 30);
    s.pool(bx + bw / 2, by + 40, 90, 12, 'rgba(194,176,251,A)', .12);
    s.block(bx - 2, by + 26, bw + 4, 12);
    for (var bt = Math.floor(bx / TILE); bt <= Math.floor((bx + bw) / TILE); bt++) s.act(bt, 6, { text: 'EVERY GENRE · 15 LINES, one per family on the home page. Line 01 runs to Electronic City in this prototype.' });
    var kx = 176, ky = 124;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(kx + 33, ky + 2, 4, 26);
    s.px(kx - 2, ky - 2, 36, 30, K.out); s.px(kx - 1, ky - 1, 34, 28, '#3A3448'); s.px(kx - 1, ky - 1, 34, 2, '#56506A');
    s.px(kx + 2, ky + 2, 28, 15, K.out); s.glow(kx + 3, ky + 3, 26, 13, '#1E2A4A'); pixShape(s, 'hex', kx + 16, ky + 9, 4, neonc(270));
    s.px(kx + 9, ky + 20, 14, 3, K.metal); s.px(kx + 9, ky + 20, 14, 1, K.metal4);
    s.label(kx, ky + 28, 32, 8, 'MAP', 270, null, 10);
    s.pool(kx + 16, ky + 30, 26, 8, 'rgba(194,176,251,A)', .18);
    s.block(kx - 2, ky - 2, 36, 30);
    [11, 12].forEach(function (t) { for (var r = 7; r <= 9; r++) s.act(t, r, { text: 'MAP · The whole atlas as a map: 2,098 genres, every family.', link: SITE + '/', linkText: 'OPEN THE MAP' }); });
    s.sprite(BENCH, PROPPAL, 40, 120, null, null, false, true); s.sprite(BENCH, PROPPAL, 324, 120, null, null, false, true);
    s.block(40, 120, 20, 10); s.block(324, 120, 20, 10);
    [[10, 110], [358, 110]].forEach(function (p, i) {
      s.px(p[0], p[1] + 14, 16, 12, K.out); s.px(p[0] + 1, p[1] + 15, 14, 10, '#3A3044'); s.px(p[0] + 1, p[1] + 15, 14, 2, '#56486A');
      blob(s, p[0], p[1], 16, 17, [[8, 8, 7], [4, 11, 4], [12, 11, 4]], ['#4E7A63', '#36604E', '#25463A', '#173027'], 30 + i);
      s.block(p[0], p[1] + 10, 16, 16);
    });
    var passer = look({ C: '#3E5A8C', c: '#5A7AB2', Q: '#28406A', B: '#4A6AA0', U: '#1E3050', N: '*#FFE07D', h: '#2A1E1A', s: '#D8A888', S: '#A87A62', j: '#3A2E2A', J: '#54443C', k: '#241C1A' });
    s.live = function (g2, e, l, t) {
      STAIRS.forEach(function (st, i) {
        for (var m = 0; m < 3; m++) { var ph = ((t / 2600) + m / 3 + i * .17) % 1, ax = st[0] + 6 + ((i * 7 + m * 9) % 18), ay = st[2] ? st[1] + 32 + Math.round(ph * 16) : st[1] - Math.round(ph * 16); g2.fillStyle = 'rgba(220,210,240,' + (.12 * (1 - ph)) + ')'; g2.fillRect(ax, ay, 2, 1); }
      });
      var cyc = t % 7000;
      if (cyc < 1800) {
        var pos = cyc / 1800 * (W + 160) - 80;
        STAIRS.forEach(function (st) { var deep = st[2] ? st[1] : st[1] + 26; for (var wx = Math.max(st[0], Math.round(pos - 70)); wx < Math.min(st[0] + 30, Math.round(pos + 70)); wx++) if ((wx - Math.round(pos)) % 8 < 5) { g2.fillStyle = 'rgba(255,236,190,.55)'; g2.fillRect(wx, deep + 1, 1, 4); e.fillStyle = 'rgba(255,236,190,.6)'; e.fillRect(wx, deep + 1, 1, 4); } });
      }
      drawWalker(s, g2, e, passer, Math.round((t * .026) % (W + 60) - 30), 160, false, Math.floor(t / 230) % 2);
    };
    s.start = { x: 11, y: 10, dir: 'up' };
    return s;
  }

  /* =================== Electronic City, built from its districts =================== */
  function kindOf(n) { return n.total >= 50 ? 'tower' : n.total >= 10 ? 'block' : n.total >= 1 ? 'house' : 'kiosk'; }
  var SIZE = { tower: [92, 102], block: [76, 76], house: [60, 66], kiosk: [36, 38] };
  function buildCity() {
    var districts = ROOT.kids, PLAZA = 128, BAND = 176, GAP = 20, LEFT = 72;
    var widths = districts.map(function (d) { return (d.kids || [d]).reduce(function (t, k) { return t + SIZE[kindOf(k)][0] + GAP; }, LEFT); });
    var cols = Math.max(24, Math.ceil((Math.max.apply(null, widths) + 40) / TILE)), rows = (PLAZA + districts.length * BAND + 48) / TILE;
    var s = new World(cols, rows, 'ELECTRONIC CITY'), W = s.W, H = s.H, g = s.g, R = rnd(5);
    // the plaza: the metro entrance and the family monument
    pavers(s, 0, 0, W, PLAZA);
    for (var py = 16; py < PLAZA - 8; py += 8) for (var px = 96; px < W - 96; px += 8) { s.px(px, py, 8, 8, ((px + py) / 8) % 2 ? '#221E2C' : '#1C1925'); s.px(px, py, 8, 1, '#2C2738'); s.px(px, py, 1, 8, '#2C2738'); }
    var mx = Math.round(W / 2) + 40, my = 64;
    s.px(mx - 24, my + 8, 48, 13, K.out); s.px(mx - 23, my + 9, 46, 11, '#3A3446'); s.px(mx - 23, my + 9, 46, 2, '#56506A'); s.px(mx - 23, my + 18, 46, 2, '#2A2534');
    pixShape(s, 'circle', mx, my - 8, 12, neonc(HUE)); pixShape(s, 'circle', mx, my - 8, 17, neonc(HUE, .55));
    for (var d = 0; d < 4; d++) { var ang = (-90 + 90 * d) * Math.PI / 180; s.glow(Math.round(mx - 1 + 14.5 * Math.cos(ang)), Math.round(my - 9 + 14.5 * Math.sin(ang)), 2, 2, neonc(HUE)); }
    s.glow(mx - 1, my - 9, 3, 3, neonc(HUE)); s.pool(mx, my + 4, 46, 16, 'oklch(0.80 0.105 ' + HUE + ' / A)', .3);
    s.block(mx - 24, my - 26, 48, 47);
    var monument = { text: 'ELECTRONIC CITY · ' + plural(ROOT.total, 'genre', 'genres') + ' in ' + plural(districts.length, 'district', 'districts') + '. ' + (ROOT.d || ''), link: pageUrl(ROOT), linkText: 'READ ABOUT ELECTRONIC MUSIC' };
    for (var mi = Math.floor((mx - 24) / TILE); mi <= Math.floor((mx + 23) / TILE); mi++) for (var mr = 1; mr <= 5; mr++) s.act(mi, mr, monument);
    // metro stairs back to the Terminal
    var sx0 = Math.round(W / 2) - 88, sy0 = 40;
    s.px(sx0 - 3, sy0 - 1, 36, 34, K.out);
    for (var st = 0; st < 32; st += 3) { var c = 10 + st; s.px(sx0, sy0 + st, 30, 3, 'rgb(' + c + ',' + (c - 2) + ',' + (c + 6) + ')'); s.px(sx0, sy0 + st, 30, 1, 'rgba(255,255,255,.07)'); }
    s.px(sx0 - 2, sy0 - 1, 2, 33, K.metal2); s.px(sx0 + 30, sy0 - 1, 2, 33, K.metal2); s.glow(sx0, sy0 - 1, 1, 33, neonc(270)); s.glow(sx0 + 29, sy0 - 1, 1, 33, neonc(270));
    plate(s, sx0 - 8, sy0 - 16, 46, 11, 270); s.label(sx0 - 8, sy0 - 16, 46, 11, 'TERMINAL', 270, null, 9);
    s.pool(sx0 + 15, sy0 + 38, 26, 9, 'rgba(194,176,251,A)', .2);
    s.block(sx0 - 3, sy0 - 16, 36, 22); s.block(sx0 - 3, sy0, 4, 33); s.block(sx0 + 29, sy0, 4, 33);
    var stairRow = Math.floor((sy0 + 24) / TILE);
    for (var tx = Math.floor((sx0 + 2) / TILE); tx <= Math.floor((sx0 + 27) / TILE); tx++) { s.on(tx, stairRow, { go: 'terminal' }); s.wall(tx, stairRow - 1); }
    s.start = { x: Math.floor((sx0 + 15) / TILE), y: stairRow + 1, dir: 'down' };
    lamp(s, sx0 - 30, 56, HUE); s.block(sx0 - 26, 74, 8, 6);
    lamp(s, mx + 50, 56, HUE); s.block(mx + 54, 74, 8, 6);
    // one street per district, alphabetical, its genres alphabetical along it
    var reflections = [], walkers = [];
    districts.forEach(function (dist, di) {
      var y0 = PLAZA + di * BAND, bottom = y0 + 112, items = dist.kids || [dist];
      pavers(s, 0, y0, W, 128); asphalt(s, 0, y0 + 131, W, 29);
      for (var lx2 = 4; lx2 < W; lx2 += 22) { s.px(lx2, y0 + 145, 11, 2, K.lane); s.px(lx2, y0 + 145, 11, 1, '#C8C2D8'); }
      curb(s, 0, y0 + 128, W); curb(s, 0, y0 + 160, W); pavers(s, 0, y0 + 164, W, 12);
      // the back lot: a fence and a few trees behind the roofs
      for (var fx = 0; fx < W; fx += 6) s.px(fx, y0 + 4, 1, 14, K.metal3);
      s.px(0, y0 + 4, W, 1, K.metal3); s.px(0, y0 + 11, W, 1, '#26222F');
      for (var tx2 = 30 + Math.floor(R() * 40); tx2 < W - 40; tx2 += 70 + Math.floor(R() * 60)) { tree(s, tx2, y0 + 2, di * 31 + tx2, .85); s.block(tx2 + 10, y0 + 22, 8, 8); }
      // the street sign
      s.px(18, bottom - 46, 2, 46, K.metal); s.px(18, bottom - 46, 1, 46, K.metal4);
      plate(s, 4, bottom - 64, 64, 20, HUE); s.label(4, bottom - 64, 64, 20, dist.name, HUE, null, 9);
      s.block(16, bottom - 12, 8, 12);
      var sign = { text: dist.name + ' · ' + plural(items.length, 'building', 'buildings') + ', ' + plural(dist.total, 'genre', 'genres') + ' in all. A district of Electronic City.' };
      s.act(1, bottom / TILE - 1, sign);
      var x = LEFT;
      items.forEach(function (n) {
        var kind = kindOf(n), w = SIZE[kind][0], h = SIZE[kind][1], y = bottom - h;
        if (kind === 'tower') tower(s, x, y, w, h, HUE, n.name);
        else if (kind === 'kiosk') kiosk(s, x, y, w, h, HUE, n.name);
        else house(s, x, y, w, h, HUE, n.name);
        s.block(x - 2, y + (kind === 'kiosk' ? -18 : 0), w + 4, h + (kind === 'kiosk' ? 18 : 0));
        var doorTile = Math.floor((x + w / 2) / TILE), doorRow = bottom / TILE - 1;
        s.on(doorTile, doorRow, { enter: n });
        var info = { text: n.name.toUpperCase() + ' · ' + (n.total ? plural(n.total, 'subgenre', 'subgenres') : 'no subgenre') + '. Walk in through the door.' };
        for (var bi = Math.floor(x / TILE); bi <= Math.floor((x + w - 1) / TILE); bi++) if (bi !== doorTile) s.act(bi, doorRow, info);
        reflections.push([x, w]);
        x += w + GAP;
        if (R() < .5 && x + 8 < W - 20) { lamp(s, x - GAP + 2, bottom - 18, HUE); s.block(x - GAP + 6, bottom, 8, 4); }
      });
      // a car parked in some streets, puddles, a bench on the far sidewalk
      if (di % 2 === 0) { var cx = 120 + Math.floor(R() * (W - 300)); car(s, cx, y0 + 129, HUE); s.block(cx, y0 + 135, 46, 18); }
      puddle(s, 60 + Math.floor(R() * (W - 120)), y0 + 154, 10, HUE); puddle(s, 60 + Math.floor(R() * (W - 120)), y0 + 140, 7, 343);
      reflections.forEach(function (r) { reflect(s, r[0], r[1], y0 + 131, y0 + 160, neonc(HUE), .18); }); reflections = [];
      walkers.push([y0 + 175, di]);
    });
    // the edge of the city
    var by2 = PLAZA + districts.length * BAND;
    grass(s, 0, by2, W, H - by2); hedge(s, 0, by2 + 2, W, 3);
    for (var ei = 0; ei < cols; ei++) { s.wall(ei, rows - 1); s.wall(ei, rows - 2); s.wall(ei, rows - 3); }
    var passer = LOOKS.cap;
    s.live = function (g2, e, l, t) {
      walkers.forEach(function (w, k) { drawWalker(s, g2, e, passer, Math.round(((t + k * 5000) * .028) % (W + 60) - 30), w[0] - 2, false, Math.floor(t / 230) % 2); });
    };
    s.rain = true;
    return s;
  }

  /* =================== inside a genre, or a group =================== */
  function buildInside(n) {
    var s = new World(20, 12, n.name.toUpperCase()), W = s.W, H = s.H, g = s.g, R = rnd(typeof n.id === 'number' ? n.id : hash(n.id));
    for (var y = 74; y < H; y += 16) for (var x = 0; x < W; x += 16) { s.px(x, y, 16, 16, R() < .5 ? '#1F1B27' : '#1C1924'); s.px(x, y, 16, 1, '#292432'); s.px(x, y, 1, 16, '#292432'); }
    s.px(0, 0, W, 74, '#1E1820');
    for (var by = 0; by < 72; by += 4) for (var bx = (by / 4 % 2) * 6; bx < W; bx += 12) { s.px(bx, by, 12, 4, R() < .5 ? '#2A1F26' : '#261C23'); s.px(bx, by, 12, 1, '#33262E'); s.px(bx, by, 1, 4, '#160F14'); }
    s.px(0, 72, W, 2, K.out); s.glow(0, 70, W, 1, neonc(HUE, .8));
    for (var i = 0; i < 20; i++) for (var j = 0; j < 4; j++) s.wall(i, j);
    var items = n.kids || [];
    if (!items.length) {
      plate(s, 80, 26, 160, 26, HUE); s.label(80, 26, 160, 26, 'NO SUBGENRE · THE END OF THIS BRANCH', HUE, null, 9);
    }
    items.forEach(function (k, i) {
      var span = W / items.length, dx = Math.round(i * span + span / 2 - 12), pw = Math.min(46, Math.floor(span) - 4);
      plate(s, dx + 12 - pw / 2, 3, pw, 19, HUE); s.label(dx + 12 - pw / 2, 3, pw, 19, k.name, HUE, null, 8);
      s.px(dx - 2, 27, 28, 45, K.out); s.px(dx - 1, 28, 26, 44, K.metal); s.px(dx, 29, 24, 43, '#0A080D');
      for (var q = 0; q < 6; q++) s.px(dx + 2, 32 + q * 7, 20, 3, 'rgba(194,176,251,' + (.03 + q * .03) + ')');
      for (var st = dx + 1; st < dx + 23; st += 3) s.glow(st, 29, 1, 6, neonc(HUE, .5));
      s.glow(dx, 28, 24, 1, neonc(HUE));
      s.label(dx - 8, 75, 40, 7, k.grp ? plural(k.kids.length, 'GENRE', 'GENRES') : k.total ? plural(k.total, 'SUBGENRE', 'SUBGENRES') : 'NO SUBGENRE', 270, null, 8);
      reflect(s, dx + 2, 20, 84, 110, neonc(HUE), .16);
      var t = Math.floor((dx + 12) / TILE);
      s.on(t, 3, { enter: k });
    });
    // the jukebox and the ABOUT terminal, for a genre; a group is only a hall of doors
    if (!n.grp) {
      var jx = 16, jy = 92;
      s.g.fillStyle = 'rgba(0,0,0,.4)'; s.g.fillRect(jx + 30, jy + 6, 5, 40);
      g.fillStyle = K.out; g.beginPath(); g.arc(jx + 15, jy + 13, 16, Math.PI, 0); g.fill(); s.px(jx - 1, jy + 12, 32, 34, K.out);
      g.fillStyle = '#4A3A62'; g.beginPath(); g.arc(jx + 15, jy + 13, 15, Math.PI, 0); g.fill(); s.px(jx, jy + 13, 30, 32, '#4A3A62');
      s.px(jx, jy + 13, 3, 32, '#5E4C7C'); s.px(jx + 27, jy + 13, 3, 32, '#36294A');
      for (var a = 0; a < 60; a++) { var an = Math.PI + a / 60 * Math.PI; s.glow(Math.round(jx + 15 + 13 * Math.cos(an)), Math.round(jy + 13 + 13 * Math.sin(an)), 1, 1, a % 10 < 5 ? neonc(HUE) : K.pink); }
      s.px(jx + 5, jy + 6, 20, 13, K.out); s.px(jx + 6, jy + 7, 18, 11, '#120F18'); for (var rr = 0; rr < 5; rr++) s.px(jx + 7, jy + 8 + rr * 2, 16, 1, rr % 2 ? K.warm2 : K.warm);
      s.e.fillStyle = 'rgba(246,201,124,.5)'; s.e.fillRect(jx + 6, jy + 7, 18, 11);
      s.px(jx + 5, jy + 22, 20, 12, K.out); s.px(jx + 6, jy + 23, 18, 10, '#241D30'); for (var gr = 0; gr < 6; gr++) s.px(jx + 7 + gr * 3, jy + 24, 2, 8, K.metal);
      s.glow(jx + 2, jy + 38, 26, 2, K.pink); s.px(jx + 2, jy + 41, 26, 3, '#36294A');
      s.label(jx - 3, jy + 47, 36, 8, 'JUKEBOX', HUE, null, 9); s.pool(jx + 15, jy + 46, 26, 9, 'rgba(255,111,168,A)', .2);
      s.block(jx, jy, 30, 46);
      var juke = n.a ? { text: 'JUKEBOX · The key artists of ' + n.name + ', with a track to play for each of them, on the full page.', link: pageUrl(n) + '#ga-d-listen', linkText: 'LISTEN ON THE FULL PAGE' }
        : { text: 'JUKEBOX · No key artist for ' + n.name + ' yet. You can suggest one on its page.', link: pageUrl(n), linkText: 'SUGGEST AN ARTIST' };
      for (var jr = 5; jr <= 8; jr++) for (var jc = 1; jc <= 2; jc++) s.act(jc, jr, juke);
      var tx = 276, ty = 92;
      s.g.fillStyle = 'rgba(0,0,0,.4)'; s.g.fillRect(tx + 30, ty + 6, 5, 40);
      s.px(tx - 1, ty - 1, 32, 46, K.out); s.px(tx, ty, 30, 44, '#2E2A3C'); s.px(tx, ty, 30, 2, '#46405A'); s.px(tx + 27, ty + 2, 3, 42, '#24202F');
      s.px(tx + 3, ty + 4, 24, 18, K.out); s.glow(tx + 4, ty + 5, 22, 16, darkc(HUE));
      for (var sl = ty + 6; sl < ty + 21; sl += 2) s.px(tx + 4, sl, 22, 1, 'rgba(0,0,0,.18)');
      pixShape(s, 'circle', tx + 15, ty + 11, 4, neonc(HUE)); s.glow(tx + 15, ty + 11, 1, 1, neonc(HUE)); s.glow(tx + 7, ty + 17, 16, 1, neonc(HUE, .7));
      s.px(tx + 3, ty + 26, 24, 12, '#1C1824'); for (var kk = 0; kk < 18; kk++) s.px(tx + 4 + (kk % 6) * 4, ty + 27 + Math.floor(kk / 6) * 4, 3, 2, kk === 17 ? neonc(HUE) : K.metal);
      s.label(tx - 3, ty + 47, 36, 8, 'ABOUT', HUE, null, 9); s.pool(tx + 15, ty + 46, 24, 9, 'oklch(0.80 0.105 ' + HUE + ' / A)', .2);
      s.block(tx, ty, 30, 46);
      var meta = [n.y, n.o].filter(Boolean).join(' · ');
      var about = { text: n.name.toUpperCase() + (meta ? ' · ' + meta : '') + '. ' + (n.d || 'Its page tells where it comes from and who plays it.'), link: pageUrl(n), linkText: 'READ THE FULL PAGE' };
      for (var ar = 5; ar <= 8; ar++) for (var ac = 17; ac <= 18; ac++) s.act(ac, ar, about);
    }
    // the dance floor, in the middle
    var fx = 104, fy = 108;
    s.px(144, H - 12, 32, 12, K.out); s.px(145, H - 11, 30, 11, deepc(HUE)); for (var m = 0; m < 30; m += 3) s.px(145 + m, H - 11, 1, 11, '#2B2440');
    s.label(180, H - 10, 40, 8, '▼ EXIT', 270, null, 9);
    s.on(9, 11, { exit: true }); s.on(10, 11, { exit: true });
    for (var ex = 0; ex < 20; ex++) if (ex !== 9 && ex !== 10) s.wall(ex, 11);
    [[2, 150], [302, 150]].forEach(function (p, i) {
      s.px(p[0] + 1, p[1] + 16, 14, 10, K.out); s.px(p[0] + 2, p[1] + 17, 12, 8, '#3A3044'); s.px(p[0] + 2, p[1] + 17, 12, 2, '#56486A');
      blob(s, p[0], p[1], 16, 19, [[8, 9, 7], [4, 12, 4], [12, 12, 4]], ['#4E7A63', '#36604E', '#25463A', '#173027'], 50 + i);
      s.block(p[0], p[1] + 12, 16, 14);
    });
    s.live = function (g2, e, l, t) {
      var beat = Math.floor(t / 420);
      for (var i2 = 0; i2 < 7; i2++) for (var j2 = 0; j2 < 4; j2++) {
        var x2 = fx + i2 * 16, y2 = fy + j2 * 11, lit = (i2 * 7 + j2 * 3 + beat) % 5, hue = [295, 343, 199, 295, 175][lit];
        g2.fillStyle = K.out; g2.fillRect(x2, y2, 16, 11);
        g2.fillStyle = lit < 2 ? neonc(hue, .9) : darkc(hue, .95); g2.fillRect(x2 + 1, y2 + 1, 14, 9);
        g2.fillStyle = 'rgba(255,255,255,.15)'; g2.fillRect(x2 + 1, y2 + 1, 14, 1);
        if (lit < 2) { e.fillStyle = neonc(hue, .45); e.fillRect(x2 + 1, y2 + 1, 14, 9); }
      }
    };
    s.start = { x: 9, y: 10, dir: 'up' };
    return s;
  }

  /* =================== the game: camera, moves, triggers, dialogue =================== */
  var cv = document.getElementById('game'), c = cv.getContext('2d');
  var narrow = window.innerWidth < 700, VC = narrow ? 13 : 20, VR = 12;
  cv.width = VC * TILE * Z; cv.height = VR * TILE * Z;
  var mk = function (w, h) { var x = document.createElement('canvas'); x.width = w; x.height = h; return x; };
  var dyn, dynE, dynL;
  var dlg = document.getElementById('dlg'), dlgText = document.getElementById('dlg-text'), dlgLink = document.getElementById('dlg-link');
  var banner = document.getElementById('banner'), fade = document.getElementById('fade');
  var world = null, stack = [], cache = {}, hero = { x: 0, y: 0, dir: 'up', moving: null, frame: 0 }, held = [], busy = false, bannerTimer = 0;
  var drops = []; (function () { var Rr = rnd(9); for (var i = 0; i < 110; i++) drops.push([Rr() * cv.width, Rr() * cv.height, 8 + Rr() * 12]); })();

  function enterWorld(w, at) {
    world = w;
    dyn = mk(w.W, w.H); dynE = mk(w.W, w.H); dynL = mk(w.W, w.H);
    hero.x = at.x; hero.y = at.y; hero.dir = at.dir || 'up'; hero.moving = null;
    banner.textContent = w.name; banner.hidden = false; clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { banner.hidden = true; }, 2600);
  }
  // After a door or a stairway, a key still held does not walk straight back through it:
  // the hero waits for the key to be let go.
  var lock = false;
  function travel(fn) {
    busy = true; fade.style.opacity = 1; held = []; lock = true;
    setTimeout(function () { fn(); fade.style.opacity = 0; setTimeout(function () { busy = false; }, 200); }, 260);
  }
  function say(o) {
    dlgText.textContent = o.text;
    if (o.link) { dlgLink.href = o.link; dlgLink.textContent = o.linkText + ' ↗'; dlgLink.hidden = false; } else dlgLink.hidden = true;
    dlg.hidden = false;
  }
  function close() { dlg.hidden = true; held = []; }
  var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function arrive() {
    var t = world.trig[hero.x + ',' + hero.y]; if (!t) return;
    if (t.go === 'city') travel(function () { stack = []; enterWorld(cache.city || (cache.city = buildCity()), cache.city.start); });
    else if (t.go === 'terminal') travel(function () { stack = []; enterWorld(cache.terminal, { x: 1, y: 3, dir: 'down' }); });
    else if (t.enter) {
      var n = t.enter, back = { w: world, x: hero.x, y: hero.y + 1, dir: 'down' };
      travel(function () { stack.push(back); var w = cache[n.id] || (cache[n.id] = buildInside(n)); enterWorld(w, w.start); });
    } else if (t.exit) {
      var b = stack.pop();
      if (b) travel(function () { enterWorld(b.w, b); });
    }
  }
  function tryMove(dir) {
    hero.dir = dir;
    var nx = hero.x + D[dir][0], ny = hero.y + D[dir][1];
    if (!world.free(nx, ny)) { var bump = world.bumps[nx + ',' + ny]; if (bump) say(bump); return; }
    hero.moving = { fx: hero.x, fy: hero.y, t0: performance.now() };
    hero.x = nx; hero.y = ny; hero.frame = (hero.frame % 2) + 1;
  }
  function action() {
    if (!dlg.hidden) { close(); return; }
    var fx = hero.x + D[hero.dir][0], fy = hero.y + D[hero.dir][1];
    var a = world.acts[fx + ',' + fy] || world.bumps[fx + ',' + fy];
    if (a) say(a);
  }
  var STEP = 150;
  function heroPixel(now) {
    var px = hero.x * TILE, py = hero.y * TILE;
    if (hero.moving) {
      var k = Math.min(1, (now - hero.moving.t0) / STEP);
      px = (hero.moving.fx + (hero.x - hero.moving.fx) * k) * TILE; py = (hero.moving.fy + (hero.y - hero.moving.fy) * k) * TILE;
      if (k >= 1) { hero.moving = null; arrive(); }
    }
    return [px, py];
  }
  var vig = c.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * .35, cv.width / 2, cv.height / 2, cv.width * .62);
  vig.addColorStop(0, 'rgba(6,5,9,0)'); vig.addColorStop(1, 'rgba(6,5,9,.5)');
  function frame(now) {
    requestAnimationFrame(frame);
    if (!world) return;
    if (!hero.moving && !busy && dlg.hidden && held.length) tryMove(held[held.length - 1]);
    var hp = heroPixel(now), VW = VC * TILE, VH = VR * TILE;
    var cx = Math.round(hp[0] + 8 - VW / 2), cy = Math.round(hp[1] + 8 - VH / 2);
    cx = world.W <= VW ? Math.round((world.W - VW) / 2) : Math.max(0, Math.min(world.W - VW, cx));
    cy = world.H <= VH ? Math.round((world.H - VH) / 2) : Math.max(0, Math.min(world.H - VH, cy));
    var dg = dyn.getContext('2d'), de = dynE.getContext('2d'), dl = dynL.getContext('2d');
    dg.clearRect(0, 0, world.W, world.H); de.clearRect(0, 0, world.W, world.H); dl.clearRect(0, 0, world.W, world.H);
    var t = still ? 0 : now;
    world.live && world.live(dg, de, dl, t);
    var step = hero.moving ? hero.frame : 0;
    drawHero(dg, de, Math.round(hp[0]) - 1, Math.round(hp[1]) + 15, hero.dir, step);
    var CW = cv.width, CH = cv.height;
    c.fillStyle = '#08070A'; c.fillRect(0, 0, CW, CH);
    function blit(src) {
      var sx = Math.max(0, cx), sy = Math.max(0, cy), sw = Math.min(world.W, cx + VW) - sx, sh = Math.min(world.H, cy + VH) - sy;
      if (sw > 0 && sh > 0) c.drawImage(src, sx, sy, sw, sh, (sx - cx) * Z, (sy - cy) * Z, sw * Z, sh * Z);
    }
    c.imageSmoothingEnabled = false; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.globalAlpha = 1;
    blit(world.base); blit(dyn);
    c.imageSmoothingEnabled = true; c.globalCompositeOperation = 'lighter';
    blit(world.lite); blit(dynL);
    [[16, .5], [5, .45]].forEach(function (b) { c.filter = 'blur(' + b[0] + 'px)'; c.globalAlpha = b[1]; blit(world.emis); blit(dynE); });
    c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = vig; c.fillRect(0, 0, CW, CH);
    c.save(); c.translate(-cx * Z, -cy * Z);
    world.labels.forEach(function (l) { if (l.x + l.w > cx && l.x < cx + VW && l.y + l.h > cy && l.y < cy + VH) drawLabel(c, l); });
    c.restore();
    if (world.rain && !still) {
      c.strokeStyle = 'rgba(194,176,251,.18)'; c.lineWidth = 1.5;
      drops.forEach(function (d) { var y = (d[1] + now * .55 * d[2] / 10) % CH, x = (d[0] + y * .22) % CW; c.beginPath(); c.moveTo(x, y); c.lineTo(x - d[2] * .22, y - d[2]); c.stroke(); });
    }
  }

  /* ---------- controls: keyboard, and a pad on screen ---------- */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', z: 'up', s: 'down', a: 'left', q: 'left', d: 'right' };
  function press(dir) { if (held.indexOf(dir) < 0) held.push(dir); }
  function release(dir) { held = held.filter(function (h) { return h !== dir; }); }
  window.addEventListener('keydown', function (ev) {
    var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (KEYS[k]) { ev.preventDefault(); if (!dlg.hidden || (lock && ev.repeat)) return; lock = false; press(KEYS[k]); }
    else if (k === ' ' || k === 'Enter' || k === 'e') { ev.preventDefault(); if (!ev.repeat) action(); }
    else if (k === 'Escape' || k === 'x') close();
  });
  window.addEventListener('keyup', function (ev) { var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; if (KEYS[k]) release(KEYS[k]); lock = false; });
  window.addEventListener('blur', function () { held = []; });
  [].forEach.call(document.querySelectorAll('[data-dir]'), function (b) {
    var dir = b.getAttribute('data-dir');
    b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); b.setPointerCapture && b.setPointerCapture(ev.pointerId); if (dlg.hidden) press(dir); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { b.addEventListener(n, function () { release(dir); }); });
  });
  document.getElementById('btn-a').addEventListener('click', action);
  document.getElementById('btn-b').addEventListener('click', close);
  dlg.addEventListener('click', function (ev) { if (ev.target !== dlgLink) close(); });

  cache.terminal = buildTerminal();
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    enterWorld(cache.terminal, cache.terminal.start);
    requestAnimationFrame(frame);
  });
