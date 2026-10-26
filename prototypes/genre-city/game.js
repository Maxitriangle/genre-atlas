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

  /* ---------- the hero, seen from four sides, two steps each ----------
   * 16 by 22 pixels: smaller than the passers-by, so the buildings keep their scale. */
  var HERO_FRONT = mirror(['....oooo', '..ooHHHH', '.oHHHHHH', '.oHHhhhh', 'nphhqqqq', 'nphqssss', 'nphssEss', '.ohsssss', '..ohSSSS',
    '...ojJjz', '..ojJjjz', '.ojJjjjz', '.ojJojjz', '.ojjojjz', '.osSojjz', '...okkkk', '...olLlo', '...olLlo', '...olllo', '...olLlo', '...oFFFo', '...ooooo']);
  var HERO_BACK = mirror(['....oooo', '..ooHHHH', '.oHHHHHH', '.oHHHHHH', 'nphHHHHH', 'nphHHHHH', 'nphHHHHH', '.ohHHHHH', '..ohhhhh',
    '...ojJjj', '..ojJjjj', '.ojJjjjj', '.ojJojjj', '.ojjojjj', '.osSojjj', '...okkkk', '...olLlo', '...olLlo', '...olllo', '...olLlo', '...oFFFo', '...ooooo']);
  var HERO_SIDE = ['.....oooooo.....', '...ooHHHHHHo....', '..oHHHHHHHHHo...', '..oHHHHHhqqqo...', '..oHpnnqsssso...', '..oHpnnqssEso...',
    '..oHHppqssssso..', '...oHHhqSSSo....', '....oohhSSo.....'].concat(SIDE_BODY);
  var HERO_STEPS = [SIDE_LEGS[1], SIDE_LEGS[0]];
  function heroRows(dir, frame) {
    if (dir === 'left' || dir === 'right') return HERO_SIDE.concat(HERO_STEPS[frame % 2]);
    var rows = (dir === 'up' ? HERO_BACK : HERO_FRONT).slice();
    if (frame) {                                  // one leg lifted: that half of the legs moves up a pixel
      var from = rows.length - 6, left = frame === 1;
      for (var j = from; j < rows.length; j++) {
        var below = j + 1 < rows.length ? rows[j + 1] : '................';
        var r = rows[j].split(''), b = below.split('');
        for (var i = left ? 0 : 8; i < (left ? 8 : 16); i++) r[i] = b[i] || '.';
        rows[j] = r.join('');
      }
    }
    return rows;
  }
  function drawHero(g, e, x, feetY, dir, frame) {
    var rows = heroRows(dir, frame);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x + 3, feetY - 1, 10, 2); g.fillRect(x + 2, feetY, 12, 1);
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

