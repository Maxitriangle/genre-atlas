
  var Z = 3;                                     // canvas pixels per art pixel
  var MONO = '"Azeret Mono", ui-monospace, Menlo, monospace';
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var POLY = { tri_up: [3, -90, 1.18], tri_down: [3, 90, 1.18], square: [4, 45, 1.1], diamond: [4, 0, 1.05], pent: [5, -90, 1.04], hex: [6, 0, 1], hex_r: [6, 30, 1], oct: [8, 22.5, 1] };
  function neonc(h, a) { return 'oklch(0.80 0.105 ' + h + (a != null ? ' / ' + a : '') + ')'; }
  function deepc(h, a) { return 'oklch(0.42 0.09 ' + h + (a != null ? ' / ' + a : '') + ')'; }
  function darkc(h, a) { return 'oklch(0.28 0.05 ' + h + (a != null ? ' / ' + a : '') + ')'; }
  function rnd(seed) { var s = (seed % 2147483646) + 1; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(hex, to, f) { var a = rgb(hex), b = rgb(to); return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * f); }).join(',') + ')'; }

  // The night palette, sampled from the atlas: near-black violet, lavender ink.
  var K = {
    out: '#0A090D', ink: '#E4DFF5',
    asph: '#17141C', asph2: '#1C1922', asph3: '#110F15', lane: '#A49DB5',
    walk: '#2A2534', walk2: '#231F2C', walk3: '#332D3F', walk4: '#3A3447', curb: '#433C50', curb2: '#0F0D13',
    grass: '#16231E', grass2: '#1D2E27', grass3: '#294034', grass4: '#0F1813', grass5: '#35523F',
    roof: '#3A3150', roof2: '#4B4068', roof3: '#2A2340', roof4: '#221C33', ridge: '#615486', eave: '#0D0B11', moss: '#2C4436',
    wall: '#2D2738', wall2: '#262030', wall3: '#383149', wall4: '#211C2A', found: '#18141E',
    glass: '#101826', glass2: '#253750', glass3: '#3A5272', warm: '#F6C97C', warm2: '#D9984E', warm3: '#FFE6B0',
    metal: '#4A4459', metal2: '#615B76', metal3: '#2E2A38', metal4: '#7A7490',
    floor: '#221E2A', floor2: '#1C1923', floor3: '#2A2534',
    pink: '#FF6FA8', cyan: '#7DF9FF', red: '#FF4F6B', green: '#7DFFB0', amber: '#FFC86B'
  };

  /* ---------- a scene: art at low resolution, scaled up, light, bloom and text on top ---------- */
  function Scene(id, cols, rows) {
    var cv = document.getElementById(id);
    this.W = cols * 16; this.H = rows * 16;
    cv.width = this.W * Z; cv.height = this.H * Z;
    this.cv = cv; this.c = cv.getContext('2d');
    var mk = function (w, h) { var x = document.createElement('canvas'); x.width = w; x.height = h; return x; };
    this.base = mk(this.W, this.H); this.emis = mk(this.W, this.H); this.lite = mk(this.W, this.H);
    this.dyn = mk(this.W, this.H); this.dynE = mk(this.W, this.H); this.dynL = mk(this.W, this.H);
    this.g = this.base.getContext('2d'); this.e = this.emis.getContext('2d'); this.l = this.lite.getContext('2d');
    this.labels = [];
  }
  Scene.prototype.px = function (x, y, w, h, col) { this.g.fillStyle = col; this.g.fillRect(x, y, w, h); };
  Scene.prototype.glow = function (x, y, w, h, col) { this.px(x, y, w, h, col); this.e.fillStyle = col; this.e.fillRect(x, y, w, h); };
  // Soft light thrown on the ground: an additive radial pool.
  function pool(l, x, y, rx, ry, col, a) {
    l.save(); l.translate(x, y); l.scale(1, ry / rx);
    var gr = l.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0));
    l.fillStyle = gr; l.beginPath(); l.arc(0, 0, rx, 0, 7); l.fill(); l.restore();
  }
  Scene.prototype.pool = function (x, y, rx, ry, col, a) { pool(this.l, x, y, rx, ry, col, a); };
  // A sprite from rows of letters; '.' is transparent; '*' before a colour makes it glow.
  // shade: pixels on the right edge of a shape darken, on the left edge brighten.
  Scene.prototype.sprite = function (rows, pal, x, y, g, e, flip, shade) {
    g = g || this.g; e = e || this.e;
    var H = rows.length;
    function at(i, j) { return j < 0 || j >= H || i < 0 || i >= rows[j].length ? '.' : rows[j][i]; }
    for (var j = 0; j < H; j++) for (var i = 0; i < rows[j].length; i++) {
      var k = rows[j][i], col = pal[k]; if (k === '.' || !col) continue;
      var glowing = col[0] === '*'; if (glowing) col = col.slice(1);
      if (shade && !glowing && k !== 'o' && col[0] === '#') {
        var r = at(i + 1, j), l = at(i - 1, j);
        if (r === 'o' || r === '.') col = mix(col, '#0A090D', .32);
        else if (l === 'o' || l === '.') col = mix(col, '#FFFFFF', .14);
      }
      var xx = flip ? x + rows[j].length - 1 - i : x + i;
      g.fillStyle = col; g.fillRect(xx, y + j, 1, 1);
      if (glowing) { e.fillStyle = col; e.fillRect(xx, y + j, 1, 1); }
    }
  };
  Scene.prototype.label = function (x, y, w, h, text, hue, shape, size, vertical) { this.labels.push({ x: x, y: y, w: w, h: h, t: text, hue: hue, shape: shape, size: size || 10, v: vertical }); };
  Scene.prototype.render = function (live, opts) {
    opts = opts || {};
    var self = this, c = this.c, R = rnd(hash(this.cv.id)), drops = [], splash = [];
    for (var i = 0; i < 110; i++) drops.push([R() * this.cv.width, R() * this.cv.height, 8 + R() * 12]);
    for (var k = 0; k < 26; k++) splash.push([R() * this.W, opts.wetTop + R() * (this.H - opts.wetTop), R() * 1000]);
    var vig = c.createRadialGradient(this.cv.width / 2, this.cv.height / 2, this.cv.height * .35, this.cv.width / 2, this.cv.height / 2, this.cv.width * .62);
    vig.addColorStop(0, 'rgba(6,5,9,0)'); vig.addColorStop(1, 'rgba(6,5,9,.55)');
    function frame(t) {
      var dg = self.dyn.getContext('2d'), de = self.dynE.getContext('2d'), dl = self.dynL.getContext('2d');
      dg.clearRect(0, 0, self.W, self.H); de.clearRect(0, 0, self.W, self.H); dl.clearRect(0, 0, self.W, self.H);
      live && live(dg, de, dl, t);
      if (opts.rain) splash.forEach(function (p) {
        var ph = ((t + p[2]) % 900) / 900; if (ph > .3) return;
        var r = Math.round(ph * 8); dg.fillStyle = 'rgba(200,190,240,' + (.5 - ph) + ')';
        dg.fillRect(Math.round(p[0]) - r, Math.round(p[1]), 1, 1); dg.fillRect(Math.round(p[0]) + r, Math.round(p[1]), 1, 1);
        if (ph < .1) dg.fillRect(Math.round(p[0]), Math.round(p[1]) - 1, 1, 1);
      });
      var CW = self.cv.width, CH = self.cv.height;
      c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.globalAlpha = 1;
      c.imageSmoothingEnabled = false;
      c.drawImage(self.base, 0, 0, CW, CH);
      c.drawImage(self.dyn, 0, 0, CW, CH);
      // light pools, then the bloom of everything that glows
      c.imageSmoothingEnabled = true; c.globalCompositeOperation = 'lighter';
      c.drawImage(self.lite, 0, 0, CW, CH); c.drawImage(self.dynL, 0, 0, CW, CH);
      [[16, .5], [5, .45]].forEach(function (b) {
        c.filter = 'blur(' + b[0] + 'px)'; c.globalAlpha = b[1];
        c.drawImage(self.emis, 0, 0, CW, CH); c.drawImage(self.dynE, 0, 0, CW, CH);
      });
      c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.fillStyle = vig; c.fillRect(0, 0, CW, CH);
      self.labels.forEach(function (l) { drawLabel(c, l); });
      if (opts.rain) {
        c.strokeStyle = 'rgba(194,176,251,.18)'; c.lineWidth = 1.5;
        drops.forEach(function (d) {
          var y = (d[1] + t * .55 * d[2] / 10) % CH, x = (d[0] + y * .22) % CW;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - d[2] * .22, y - d[2]); c.stroke();
        });
      }
    }
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      frame(0);
      if (!still) (function loop(t) { frame(t); requestAnimationFrame(loop); })(0);
    });
  };
  // Shop signs: the family glyph and the genre name. Never cut inside a word.
  function drawLabel(c, l) {
    var X = l.x * Z, Y = l.y * Z, W = l.w * Z, H = l.h * Z, col = neonc(l.hue);
    c.font = '600 ' + l.size + 'px ' + MONO; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.shadowColor = col; c.shadowBlur = 8; c.fillStyle = col;
    if (l.v) {
      var ch = l.t.toUpperCase().split(''), step = H / ch.length;
      ch.forEach(function (s, i) { c.fillText(s, X + W / 2, Y + step * (i + .5)); });
      c.shadowBlur = 0; return;
    }
    var icon = l.shape ? H * .62 : 0, room = W - icon - 10, words = l.t.toUpperCase().split(' '), lines = [''];
    words.forEach(function (w) { var s = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w; if (c.measureText(s).width > room && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = s; });
    var cx = X + icon + (W - icon) / 2, lh = l.size + 2, y0 = Y + H / 2 - (lines.length - 1) * lh / 2;
    lines.forEach(function (s, i) { c.fillText(s, cx, y0 + i * lh); });
    if (l.shape) {
      c.strokeStyle = col; c.lineWidth = 1.6; var r = H * .26, ix = X + 4 + icon / 2, iy = Y + H / 2;
      shapePath(c, l.shape, ix, iy, r); c.stroke();
      c.beginPath(); c.arc(ix, iy, 1.6, 0, 7); c.fill();
    }
    c.shadowBlur = 0;
  }
  function shapePath(c, kind, x, y, r) {
    c.beginPath();
    if (kind === 'circle' || !POLY[kind]) { c.arc(x, y, r, 0, Math.PI * 2); return; }
    var p = POLY[kind];
    for (var i = 0; i < p[0]; i++) { var a = (p[1] + 360 * i / p[0]) * Math.PI / 180; c[i ? 'lineTo' : 'moveTo'](x + r * p[2] * Math.cos(a), y + r * p[2] * Math.sin(a)); }
    c.closePath();
  }
  // The same glyph shapes, in pixels, for monuments, badges and gates.
  function pixShape(s, kind, cx, cy, r, col, g, e) {
    var steps = Math.max(60, Math.round(r * 14)), p = POLY[kind], seen = {};
    for (var i = 0; i < steps; i++) {
      var u = i / steps, x, y;
      if (kind === 'circle' || !p) { var a = u * Math.PI * 2; x = cx + r * Math.cos(a); y = cy + r * Math.sin(a); }
      else {
        var n = p[0], k = Math.floor(u * n), f = u * n - k, a0 = (p[1] + 360 * k / n) * Math.PI / 180, a1 = (p[1] + 360 * (k + 1) / n) * Math.PI / 180, rr = r * p[2];
        x = cx + rr * ((1 - f) * Math.cos(a0) + f * Math.cos(a1)); y = cy + rr * ((1 - f) * Math.sin(a0) + f * Math.sin(a1));
      }
      var key = Math.round(x) + ',' + Math.round(y); if (seen[key]) continue; seen[key] = 1;
      if (g) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); e.fillStyle = col; e.fillRect(Math.round(x), Math.round(y), 1, 1); }
      else s.glow(Math.round(x), Math.round(y), 1, 1, col);
    }
  }
  // Organic shapes (foliage, hedges): a union of circles, lit from the top left, outlined.
  function blob(s, x, y, w, h, circles, cols, seed) {
    var R = rnd(seed), m = [];
    for (var j = 0; j < h; j++) { m[j] = []; for (var i = 0; i < w; i++) {
      var inside = circles.some(function (c) { var dx = i + .5 - c[0], dy = j + .5 - c[1]; return dx * dx + dy * dy <= c[2] * c[2]; });
      m[j][i] = inside;
    } }
    for (var jj = 0; jj < h; jj++) for (var ii = 0; ii < w; ii++) {
      if (!m[jj][ii]) continue;
      var edge = jj === 0 || ii === 0 || jj === h - 1 || ii === w - 1 || !m[jj - 1][ii] || !m[jj + 1][ii] || !m[jj][ii - 1] || !m[jj][ii + 1];
      if (edge) { s.px(x + ii, y + jj, 1, 1, K.out); continue; }
      // light: which circle owns the pixel, and where in it
      var best = null, bd = 1e9;
      circles.forEach(function (c) { var dx = ii + .5 - c[0], dy = jj + .5 - c[1], d = dx * dx + dy * dy - c[2] * c[2]; if (d < bd) { bd = d; best = c; } });
      var lx = (ii + .5 - best[0]) / best[2], ly = (jj + .5 - best[1]) / best[2], v = -lx * .55 - ly * .8 + (R() - .5) * .5;
      var col = v > .55 ? cols[0] : v > .05 ? cols[1] : v > -.5 ? cols[2] : cols[3];
      if (R() < .08) col = cols[Math.min(3, cols.indexOf(col) + 1)];
      s.px(x + ii, y + jj, 1, 1, col);
    }
  }

  /* ---------- people: 18 px wide, drawn as a left half and mirrored, shaded at the edges ---------- */
  var HEADS = {
    hood: [
      '......ooo', '....ooppp', '...opPHHH', '..opHHHHH', '..oHHHHHH', '.oHHHHhhh', 'nnpHhqqqq',
      'nnpHqrrrr', 'nnpHqrrss', 'nnpHqswEs', '.opHqsEEs', '..oHqbsss', '..oHhssSm', '...ohhSSS'],
    cap: [
      '.....oooo', '...ooCccc', '..oCcccCC', '..oCcCCCC', '..oCCCCCN', '..oCCCCCC', '..oQBBBBB',
      '..ohoUUUU', '..ohSSSSS', '..ohswEss', '..ohsEEss', '..ohbssss', '...ossssm', '....oSSSS'],
    hair: [
      '.....oooo', '...ooRRRR', '..oRRrrrr', '.oRRrrRRR', '.oRrRRRRR', '.oRRqRRqR', '.oRRqsqss',
      '.oRqsssss', '.oRqswEss', '.oRqsEEss', '.oRRbssss', '.oRRssssm', '.oRRoSSSS', '.oRRRoooo'],
    beanie: [
      '.....oooo', '...ooVvvv', '..oVvvVVV', '..oVvVVVV', '..oWVWVWV', '..oVWVWVW', '..oqqssss',
      '..oqswEss', '..oqsEEss', '..oqbssss', '...ossssm', '....oSSSS'],
    bun: [
      '......ooo', '.....oRRR', '.....oRrR', '...ooRRRR', '..oRRrrrr', '.oRrrRRRR', '.oRRRRRqq',
      '.oRRqssss', '.oRqswEss', '.oRqsEEss', '..oRbssss', '..oRssssm', '...ooSSSS']
  };
  var BODIES = {
    jacket: [
      '...ojJjkz', '..ojJJjkz', '.ojJJjjkz', '.ojJjjjkz', 'ojJjjjjkz', 'osJjjjjkz', 'osSojjjkz',
      '.oo.okkkk', '...odllll', '..olLllo.', '..olLllo.', '..ollllo.', '..oFFFfo.', '..oooooo.'],
    coat: [
      '...ojJjjo', '..ojJJjjz', '.ojJJjjjj', '.ojJjjjjz', 'ojJjjjjjj', 'osJjjjjjz', 'osSjjjjjj',
      '.oojjjjjk', '..ojjjjkk', '..okkkkoo', '..olLlo..', '..olllo..', '..oFFfo..', '..ooooo..'],
    tee: [
      '...ojJjjj', '..osjJjjj', '.osSjJjjj', '.osSjjjPP', 'osSojjjPP', 'oSsojjjjj', '.oo.ojjjj',
      '...okkkkk', '...odllll', '..olLllo.', '..olLllo.', '..ollllo.', '..oFFFfo.', '..oooooo.']
  };
  function mirror(half) { return half.map(function (r) { return r + r.split('').reverse().join(''); }); }
  function person(head, body) {
    var rows = mirror(HEADS[head]).concat(mirror(BODIES[body || 'jacket']));
    if (head === 'hair') {                       // long hair falls over the shoulders
      var top = HEADS.hair.length;
      for (var j = 0; j < 3; j++) { var r = rows[top + j].split(''); r[1] = 'R'; r[2] = j < 2 ? 'R' : r[2]; r[16] = 'R'; r[15] = j < 2 ? 'R' : r[15]; r[0] = 'o'; r[17] = 'o'; rows[top + j] = r.join(''); }
    }
    return rows;
  }
  function look(o) {
    var b = { o: K.out, s: '#F2D2B8', S: '#C99A82', E: '#1C1424', w: '#FFFFFF', b: '#E79A9A', m: '#9C4E5E', q: '#2A1E2C',
      j: '#2E2838', J: '#463D58', k: '#1E1A26', z: '#5E5872', l: '#25213A', L: '#353050', d: '#1A1726', F: '#4E4462', f: '#16121C', P: '#7A7490', p: '#3A3348', n: '*#7DF9FF' };
    for (var k in o) b[k] = o[k];
    return b;
  }
  function drawPerson(s, g, e, kind, pal, x, feetY, flip, bob) {
    var rows = person(kind[0], kind[1]);
    var y = feetY - rows.length - (bob || 0);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + 4, feetY - 1, 10, 2); g.fillRect(x + 3, feetY, 12, 1);
    s.sprite(rows, pal, x, y, g, e, flip, true);
  }
  // A passer-by, seen from the side: two walking poses. Only people who walk are drawn
  // until there are quests, so nobody standing still seems to wait for a chat.
  var SIDE_HEAD = [
    '......oooooo......', '....ooCCCCCCo.....', '...oCcccCCCCCo....', '...oCCCCCCCCCo....', '...oCCCCCCCCCBBBo.', '...oQQQQQQQQQoooo.',
    '...ohhhhsssssso...', '...ohhhssssEsso...', '...ohhhsssssssso..', '...ohhSssssssso...', '....ohSSssmsso....', '.....oSSSSSoo.....', '.....ooSSSo.......'];
  var SIDE_BODY = ['....ojjjjjjo......', '...ojJjjjjjjo.....', '...ojJjjjjjjo.....', '...ojJjjjjjko.....', '...ojJjsSjjko.....', '...ojjjSSjjko.....', '....okkkkkko......', '....oddddddo......'];
  var SIDE_LEGS = [
    ['...olLlo.olLo.....', '..olLlo...olLo....', '..ollo.....ollo...', '.oFFfo.....oFFfo..', '.ooooo.....ooooo..'],
    ['....olLLlo........', '....olLLlo........', '....ollllo........', '....oFFFFfo.......', '....ooooooo.......']];
  function drawWalker(s, g, e, pal, x, feetY, left, frame) {
    var rows = SIDE_HEAD.concat(SIDE_BODY, SIDE_LEGS[frame]);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + 3, feetY - 1, 11, 2);
    s.sprite(rows, pal, x, feetY - rows.length - (frame ? 1 : 0), g, e, left, true);
  }
  var LOOKS = {
    hero: look({ H: '#C9B8FF', h: '#9583DA', P: '#E7DEFF', p: '#353048', q: '#2A1F3A', r: '#3B2B3F', j: '#2C2738', J: '#433A57', k: '#1C1826', z: '*#C2B0FB', n: '*#7DF9FF', F: '#C2B0FB', f: '#4A3D78' }),
    cap: look({ C: '#E05C8A', c: '#F48DB0', Q: '#8E2F57', N: '*#FFE07D', B: '#F07AA0', U: '#5A1F3A', h: '#2B1D1E', s: '#C88E6C', S: '#9A6650', j: '#3A3A4A', J: '#54546A', k: '#24242F', z: '#E05C8A' }),
    hair: look({ R: '#7B57C9', r: '#A587EA', q: '#4B3285', j: '#22394A', J: '#33546B', k: '#172633', z: '*#7DF9FF', P: '*#7DF9FF' }),
    beanie: look({ V: '#3E8C7A', v: '#62B39E', W: '#2C6658', q: '#5A4038', s: '#E8C2A4', j: '#4A3A2C', J: '#66523E', k: '#2E241B', z: '#8C7A60' }),
    bun: look({ R: '#F1E7FF', r: '#FFFFFF', q: '#B8A8D8', s: '#E9C0A6', j: '#5A2E4E', J: '#7C4469', k: '#3A1D33', P: '*#FF6FA8' })
  };

  /* ---------- ground ---------- */
  function asphalt(s, x, y, w, h) {
    var R = rnd(x * 31 + y * 17 + 5);
    s.px(x, y, w, h, K.asph);
    for (var i = 0; i < w * h / 7; i++) s.px(x + Math.floor(R() * w), y + Math.floor(R() * h), 1, 1, R() < .5 ? K.asph2 : K.asph3);
    for (var p = 0; p < w / 60; p++) {                          // patched repairs
      var px = x + Math.floor(R() * (w - 20)), py = y + 2 + Math.floor(R() * (h - 10)), pw = 8 + Math.floor(R() * 14);
      s.px(px, py, pw, 5, '#141218'); s.px(px, py, pw, 1, '#1E1B25');
    }
    for (var c = 0; c < w / 40; c++) {                          // cracks
      var cx = x + Math.floor(R() * w), cy = y + Math.floor(R() * h);
      for (var k = 0; k < 7; k++) { s.px(cx, cy, 1, 1, '#0C0A10'); cx += R() < .5 ? 1 : 0; cy += 1; }
    }
  }
  function pavers(s, x, y, w, h) {
    var R = rnd(x * 13 + y * 7 + 3);
    for (var j = y; j < y + h; j += 8) for (var i = x - ((j - y) / 8 % 2) * 4; i < x + w; i += 8) {
      var tone = [K.walk, K.walk, '#2D2837', '#27222F'][Math.floor(R() * 4)];
      var ix = Math.max(i, x), iw = Math.min(i + 8, x + w) - ix; if (iw <= 0) continue;
      var ih = Math.min(8, y + h - j);
      s.px(ix, j, iw, ih, tone);
      s.px(ix, j, iw, 1, K.walk4); if (i >= x) s.px(i, j, 1, ih, K.walk3);
      s.px(ix, j + ih - 1, iw, 1, K.walk2);
      if (R() < .12) s.px(ix + 2 + Math.floor(R() * 3), j + 2 + Math.floor(R() * 3), 2, 1, '#3F3950');   // wet sheen
      if (R() < .05) { s.px(ix + 1, j + 7, 1, 1, K.grass3); s.px(ix + 2, j + 6, 1, 1, K.grass5); }       // weed in a joint
    }
  }
  function curb(s, x, y, w) {
    s.px(x, y, w, 1, K.walk4); s.px(x, y + 1, w, 2, K.curb); s.px(x, y + 3, w, 1, K.curb2);
    for (var i = x; i < x + w; i += 16) s.px(i, y + 1, 1, 2, K.walk2);
  }
  function grass(s, x, y, w, h) {
    var R = rnd(x * 7 + y * 29 + 11);
    s.px(x, y, w, h, K.grass);
    for (var i = 0; i < w * h / 3.5; i++) {
      var gx = x + Math.floor(R() * w), gy = y + 1 + Math.floor(R() * (h - 2)), v = R();
      s.px(gx, gy, 1, 1, v < .4 ? K.grass3 : v < .8 ? K.grass2 : K.grass4);
      if (v < .15) s.px(gx, gy - 1, 1, 1, K.grass5);
    }
  }
  function flowers(s, x, y, w, h, hues, n) {
    var R = rnd(x * 3 + y * 5 + n);
    for (var i = 0; i < n; i++) {
      var fx = x + 1 + Math.floor(R() * (w - 3)), fy = y + 1 + Math.floor(R() * (h - 4)), col = neonc(hues[Math.floor(R() * hues.length)]);
      s.px(fx + 1, fy + 2, 1, 2, K.grass5); s.px(fx + 2, fy + 3, 1, 1, K.grass3);
      s.glow(fx + 1, fy, 1, 1, col); s.glow(fx, fy + 1, 1, 1, col); s.glow(fx + 2, fy + 1, 1, 1, col); s.px(fx + 1, fy + 1, 1, 1, K.warm3);
    }
  }
  // A neon or a lit window, reflected on wet ground below it: dithered, fading.
  function reflect(s, x, w, y0, y1, col, a) {
    var g = s.g;
    for (var yy = y0; yy < y1; yy++) {
      var f = 1 - (yy - y0) / (y1 - y0); g.globalAlpha = a * f * f;
      for (var xx = x; xx < x + w; xx++) if ((xx - x) % 4 === 0 && ((xx + yy) % 2 === 0 || f > .8)) { g.fillStyle = col; g.fillRect(xx, yy, 1, 1); }
    }
    g.globalAlpha = 1;
  }

  /* ---------- small things ---------- */
  var PROPPAL = { o: K.out, L: '*#F6EEFF', m: K.metal, M: K.metal2, N: K.metal4, t: K.metal3, W: '#5B4B68', w: '#43364F', K: K.out, r: '*#FF4F6B', g: '*#7DFFB0' };
  var LAMP = [
    '....ooooooooo..', '...oMMMMMMMMMo.', '...oNNNNNNNNMo.', '....oLLLLLLLo..', '.....oooooooo..', '.....om........', '.....om........', '.....om........',
    '.....om........', '.....om........', '.....om........', '.....om........', '.....om........', '.....om........', '.....om........', '.....om........',
    '.....om........', '.....om........', '....oNMo.......', '...oMMMMo......', '..ommmmmmo.....', '..oooooooo.....'];
  var BENCH = ['.oooooooooooooooooo.', 'oWWWWWWWWWWWWWWWWWWo', 'owwwwwwwwwwwwwwwwwwo', 'oooooooooooooooooooo', 'oWWWWWWWWWWWWWWWWWWo', 'owwwwwwwwwwwwwwwwwwo',
    'oooooooooooooooooooo', '.oMo............oMo.', '.omo............omo.', '.ooo............ooo.'];
  var BIN = ['.oooooooo.', 'oNNNNNNNNo', 'oMMMMMMMMo', 'oooooooooo', '.omMmMmMo.', '.omMmMmMo.', '.omMmMmMo.', '.omMmMmMo.', '.omMmMmMo.', '.oooooooo.'];
  var HYDRANT = ['..ooo..', '.oRRRo.', 'ooRRRoo', 'oRrRRRo', 'ooRRRoo', '.oRRRo.', '.oRrRo.', 'ooooooo'];
  var CONE = ['...o...', '..oCo..', '..oWo..', '.oCCCo.', '.oWWWo.', 'oCCCCCo', 'ooooooo'];
  var CRATE = ['oooooooooooo', 'oCcCcCcCcCco', 'oooooooooooo', 'oCcvvvvvvcCo', 'oCcv****vcCo', 'oCcvvvvvvcCo', 'oooooooooooo'];
  var DUMP = [
    'oooooooooooooooooooooo', 'oNNNNNNNNNNNNNNNNNNNNo', 'oMMMMMMMMMMMMMMMMMMMMo', 'oooooooooooooooooooooo', 'oGGGGGGGGGGGGGGGGGGGGo', 'oGggggggggggggggggggGo',
    'oGgGGGGGGGGGGGGGGGGgGo', 'oGgGGGGGGGGGGGGGGGGgGo', 'oGggggggggggggggggggGo', 'oGGGGGGGGGGGGGGGGGGGGo', 'oooooooooooooooooooooo', '.oo................oo.'];
  var AC = ['oooooooooooo', 'oNNNNNNNNNNo', 'oMoooooooomo', 'oMoMNMNMNomo', 'oMoNMNMNMomo', 'oMoMNMNMNomo', 'oMoooooooomo', 'oMMMMMMMMMMo', 'oooooooooooo'];
  var DISH = ['..oooooo..', '.oNNNNNNo.', 'oNMMMMMMNo', 'oMmmmmmmMo', '.oMmmmmMo.', '..oMMMMo..', '....om....', '...oooo...'];
  var VEND = [
    'oooooooooooooo', 'oMMMMMMMMMMMMo', 'oMooooooooomMo', 'oMoAAAAAAAomMo', 'oMoAaaaaaAomMo', 'oMoAAAAAAAomMo', 'oMooooooooomMo', 'oMorrggbbyomMo',
    'oMoRRGGBBYomMo', 'oMorrggbbyomMo', 'oMoRRGGBBYomMo', 'oMooooooooomMo', 'oMMMMMMMMMMMMo', 'oMooooooooMMMo', 'oMoKKKKKKoM*Mo', 'oMooooooooMMMo', 'oMMMMMMMMMMMMo', 'oooooooooooooo'];
  var VENDPAL = { o: K.out, M: '#3B3350', m: K.metal2, A: '*#7DF9FF', a: '*#E8FDFF', r: '#FF5F7E', R: '#B23A55', g: '#7DFFB0', G: '#3E9B6E', b: '#7DB8FF', B: '#3E6AB2', y: '#FFE07D', Y: '#B29A3E', K: '#16121C', '*': '*#FF6FA8' };
  function lamp(s, x, y, hue, cold) {
    var col = cold ? 'rgba(200,230,255,A)' : 'rgba(255,214,150,A)';
    s.pool(x + 8, y + 24, 30, 11, col, .22); s.pool(x + 8, y + 24, 12, 5, col, .25);
    s.sprite(LAMP, PROPPAL, x, y, null, null, false, true);
    s.e.fillStyle = cold ? '#D8ECFF' : '#FFE2B0'; s.e.fillRect(x + 4, y + 3, 8, 1);
  }
  function tree(s, x, y, seed, size) {
    var k = size || 1, w = Math.round(30 * k), h = Math.round(26 * k);
    s.g.fillStyle = 'rgba(0,0,0,.35)'; s.g.beginPath(); s.g.ellipse(x + w / 2 + 3, y + h + 9, w * .42, 4, 0, 0, 7); s.g.fill();
    s.px(x + w / 2 - 2, y + h - 4, 5, 13, K.out); s.px(x + w / 2 - 1, y + h - 4, 3, 12, '#4A3838'); s.px(x + w / 2 - 1, y + h - 4, 1, 12, '#5E4646');
    blob(s, x, y, w, h, [[w * .5, h * .38, w * .3], [w * .27, h * .58, w * .24], [w * .73, h * .58, w * .24], [w * .5, h * .7, w * .26], [w * .36, h * .28, w * .2]],
      ['#4E7A63', '#36604E', '#25463A', '#173027'], seed);
  }
  function hedge(s, x, y, w, seed) {
    var cs = []; for (var i = 6; i < w; i += 9) cs.push([i, 7, 6.5]);
    blob(s, x, y, w, 14, cs, ['#3E6B55', '#2C5242', '#1F3D31', '#142A21'], seed);
  }
  function car(s, x, y, hue) {
    s.g.fillStyle = 'rgba(0,0,0,.45)'; s.g.fillRect(x + 3, y + 22, 40, 3);
    s.glow(x + 4, y + 23, 38, 1, neonc(hue, .8)); s.pool(x + 23, y + 24, 26, 5, 'oklch(0.80 0.105 ' + hue + ' / A)', .35);
    s.px(x, y + 6, 46, 17, K.out); s.px(x + 1, y + 7, 44, 15, '#3B2F55'); s.px(x + 1, y + 7, 44, 2, '#5A4A80'); s.px(x + 1, y + 20, 44, 2, '#2A2140');
    s.px(x + 10, y, 26, 8, K.out); s.px(x + 11, y + 1, 24, 6, '#46386A'); s.px(x + 11, y + 1, 24, 1, '#6E5D9C');
    s.px(x + 11, y + 8, 24, 7, K.out); s.px(x + 12, y + 9, 10, 5, '#1B2636'); s.px(x + 24, y + 9, 10, 5, '#1B2636');
    s.px(x + 13, y + 9, 4, 1, K.glass3); s.px(x + 25, y + 9, 3, 1, K.glass3);
    s.px(x + 2, y + 16, 42, 1, '#2A2140'); s.px(x + 22, y + 15, 1, 6, '#2A2140');
    s.glow(x + 1, y + 10, 3, 4, '#FFF1C8'); s.glow(x + 42, y + 10, 3, 4, K.red);
    s.px(x + 5, y + 21, 7, 4, K.out); s.px(x + 34, y + 21, 7, 4, K.out); s.px(x + 6, y + 21, 5, 1, '#3A3446'); s.px(x + 35, y + 21, 5, 1, '#3A3446');
    s.pool(x - 8, y + 13, 22, 8, 'rgba(255,240,200,A)', .2);
  }
  function puddle(s, x, y, w, hue) {
    s.g.fillStyle = '#0D0B12'; s.g.beginPath(); s.g.ellipse(x, y, w, w * .32, 0, 0, 7); s.g.fill();
    s.g.fillStyle = '#1A1724'; s.g.beginPath(); s.g.ellipse(x - 1, y - 1, w * .7, w * .18, 0, 0, 7); s.g.fill();
    s.px(Math.round(x - w * .5), Math.round(y - 1), Math.round(w * .55), 1, neonc(hue, .55));
    s.px(Math.round(x + 1), Math.round(y + 1), Math.round(w * .35), 1, 'rgba(236,230,255,.3)');
  }
  function manhole(s, x, y) {
    s.g.fillStyle = K.out; s.g.beginPath(); s.g.ellipse(x, y, 9, 4, 0, 0, 7); s.g.fill();
    s.g.fillStyle = '#2A2632'; s.g.beginPath(); s.g.ellipse(x, y, 8, 3, 0, 0, 7); s.g.fill();
    for (var i = -6; i <= 6; i += 3) s.px(x + i, y - 1, 2, 1, '#3A3546'); s.px(x - 5, y + 1, 10, 1, '#1E1B25');
  }
  function grate(s, x, y) { s.px(x, y, 12, 4, K.out); for (var i = 1; i < 12; i += 2) s.px(x + i, y + 1, 1, 2, '#2E2A38'); }
  function poster(s, x, y, hue, R) {
    s.px(x - 1, y - 1, 10, 13, K.out); s.px(x, y, 8, 11, '#D8D0E8'); s.px(x, y, 8, 5, neonc(hue));
    pixShape(s, ['circle', 'tri_up', 'diamond'][Math.floor(R() * 3)], x + 4, y + 2, 1.8, '#1A1622');
    s.px(x + 1, y + 6, 6, 1, '#4A4459'); s.px(x + 1, y + 8, 4, 1, '#6E6880'); s.px(x + 5, y + 10, 3, 1, '#2A2534');
    if (R() < .5) s.px(x + 6, y, 2, 2, 'rgba(0,0,0,.35)');      // a torn corner
  }
  function tag(s, x, y, hue) {                                   // a small graffiti tag
    var g = s.g; g.globalAlpha = .75;
    [[0, 3], [1, 2], [2, 1], [3, 2], [4, 3], [5, 2], [6, 1], [7, 1], [8, 2], [9, 3], [10, 3], [11, 2], [12, 1]].forEach(function (p) { g.fillStyle = neonc(hue); g.fillRect(x + p[0], y + p[1], 1, 1); });
    g.fillRect(x + 3, y + 4, 6, 1); g.globalAlpha = 1;
  }

  /* ---------- buildings: roof seen from above, front wall below, as on the Game Boy ---------- */
  function roofTiles(s, x, y, w, h, R) {
    s.px(x - 2, y - 1, w + 4, h + 1, K.out);
    for (var ry = y; ry < y + h - 3; ry += 3) for (var sx = x - ((ry - y) / 3 % 2 ? 3 : 0); sx < x + w; sx += 6) {
      var ix = Math.max(sx, x), iw = Math.min(sx + 6, x + w) - ix; if (iw <= 0) continue;
      var v = R(), base = v < .1 ? '#43395C' : v < .2 ? '#332B48' : K.roof;
      s.px(ix, ry, iw, 3, base); s.px(ix, ry, iw, 1, v < .1 ? '#5A4E7A' : K.roof2); s.px(ix + iw - 1, ry + 1, 1, 2, K.roof3);
      if (ry > y + h * .5 && R() < .12) s.px(ix + 1, ry + 2, 2, 1, K.moss);
    }
    s.px(x - 1, y, w + 2, 3, K.ridge); s.px(x - 1, y, w + 2, 1, '#7A6CA2'); s.px(x - 1, y + 3, w + 2, 1, K.roof4);
    s.px(x - 1, y, 2, h - 2, K.roof4); s.px(x + w - 1, y, 2, h - 2, K.roof4);
    s.px(x - 2, y + h - 3, w + 4, 3, K.eave); s.px(x - 2, y + h - 3, w + 4, 1, '#2A2436');
  }
  function planks(s, x, y, w, h, R) {
    s.px(x, y, w, h, K.wall);
    for (var py = y; py < y + h; py += 4) {
      s.px(x, py, w, 1, K.wall3); s.px(x, py + 3, w, 1, K.wall2);
      var seam = x + 6 + Math.floor(R() * (w - 12)); s.px(seam, py, 1, 4, K.wall4); s.px(seam - 2, py + 1, 1, 1, '#4A4258');
    }
    for (var gy = 0; gy < 8; gy++) { s.g.fillStyle = 'rgba(10,8,14,' + (gy * .045) + ')'; s.g.fillRect(x, y + h - 8 + gy, w, 1); }   // grime at the foot
  }
  function drainpipe(s, x, y, h) {
    s.px(x, y, 3, h, K.out); s.px(x + 1, y, 1, h, K.metal2);
    for (var b = y + 6; b < y + h - 4; b += 10) s.px(x - 1, b, 5, 2, K.metal3);
    s.px(x - 2, y + h - 3, 5, 3, K.out); s.px(x - 1, y + h - 2, 3, 1, K.metal2);
  }
  function windowW(s, x, y, w, h, o) {
    var R = o.R, lit = o.lit, glass = lit ? (o.cold ? neonc(o.hue) : K.warm) : K.glass;
    s.px(x - 2, y - 2, w + 4, h + 4, K.out); s.px(x - 1, y - 1, w + 2, h + 2, '#4A4258'); s.px(x - 1, y - 1, w + 2, 1, '#615A72');
    if (lit) {
      s.glow(x, y, w, h, glass);
      s.px(x, y, w, 1, o.cold ? neonc(o.hue) : K.warm3);
      if (o.silhouette) { s.px(x + 2, y + h - 6, 4, 6, 'rgba(40,24,40,.75)'); s.px(x + 3, y + h - 8, 2, 2, 'rgba(40,24,40,.75)'); }
      if (o.plant) { s.px(x + w - 5, y + h - 4, 3, 4, '#2E5444'); s.px(x + w - 6, y + h - 6, 2, 2, '#3E6B55'); }
      if (o.blinds) for (var b = y + 1; b < y + h; b += 2) s.px(x, b, w, 1, 'rgba(60,40,30,.5)');
      if (o.curtain) { s.px(x, y, 2, h, '#8E3F6A'); s.px(x + w - 2, y, 2, h, '#8E3F6A'); s.px(x, y, 1, h, '#B05A88'); }
      s.pool(x + w / 2, y + h + 18, w * 1.4, 5, o.cold ? 'oklch(0.80 0.105 ' + o.hue + ' / A)' : 'rgba(255,200,120,A)', .12);
    } else {
      s.px(x, y, w, h, glass); s.px(x + 1, y + 1, 2, 1, K.glass3); s.px(x + 1, y + 2, 1, 1, K.glass2); s.px(x + w - 3, y + h - 2, 2, 1, K.glass2);
    }
    s.px(x + Math.floor(w / 2), y, 1, h, '#4A4258'); s.px(x, y + Math.floor(h / 2), w, 1, '#4A4258');
    s.px(x - 2, y + h + 1, w + 4, 1, K.metal4); s.px(x - 2, y + h + 2, w + 4, 1, K.out);
    if (o.box) {                                                 // a flower box under the sill
      s.px(x - 1, y + h + 3, w + 2, 4, K.out); s.px(x, y + h + 3, w, 3, '#5A3F3A'); s.px(x, y + h + 3, w, 1, '#7A5650');
      for (var f = x; f < x + w; f += 3) { s.px(f, y + h + 1, 2, 2, '#3E6B55'); if (R() < .6) s.glow(f + (R() < .5 ? 0 : 1), y + h, 1, 1, neonc([343, 199, 295][Math.floor(R() * 3)])); }
    }
  }
  function shopWindow(s, x, y, w, h, hue, R) {
    s.px(x - 2, y - 2, w + 4, h + 4, K.out); s.px(x - 1, y - 1, w + 2, h + 2, K.metal);
    s.glow(x, y, w, h, '#2A2040'); s.px(x, y, w, h, '#2A2040');
    s.e.fillStyle = 'rgba(194,176,251,.25)'; s.e.fillRect(x, y, w, h);
    for (var sh = y + 6; sh < y + h; sh += 8) {                   // shelves of records
      s.px(x, sh, w, 1, '#5A4E70');
      for (var r = x + 1; r < x + w - 4; r += 5) {
        var c = ['#E05C8A', '#7DB8FF', '#FFE07D', '#7DFFB0', '#C2B0FB'][Math.floor(R() * 5)];
        s.px(r, sh - 5, 4, 5, K.out); s.px(r, sh - 5, 4, 4, '#121016'); s.px(r + 1, sh - 4, 2, 2, c);
      }
    }
    s.px(x, y, w, 1, 'rgba(255,255,255,.35)'); s.px(x + 1, y + 1, 1, h - 2, 'rgba(255,255,255,.15)');
    s.glow(x + w - 12, y + h - 5, 10, 3, K.pink);                 // OPEN
    s.pool(x + w / 2, y + h + 12, w * 1.2, 6, 'oklch(0.80 0.105 ' + hue + ' / A)', .16);
  }
  function door(s, x, y, hue, R) {
    s.px(x - 2, y - 2, 18, 22, K.out); s.px(x - 1, y - 1, 16, 21, K.metal);
    s.px(x, y, 14, 20, '#2A1F33'); s.px(x, y, 14, 1, '#3B2E48');
    s.px(x + 2, y + 2, 10, 7, K.out); s.glow(x + 3, y + 3, 8, 5, deepc(hue)); s.px(x + 3, y + 3, 3, 1, neonc(hue, .8));
    s.px(x + 2, y + 11, 10, 7, '#241A2D'); s.px(x + 2, y + 11, 10, 1, '#352944');
    s.px(x + 11, y + 12, 2, 2, K.warm);
    s.px(x - 4, y + 20, 22, 2, K.curb); s.px(x - 3, y + 22, 20, 1, K.curb2);    // step
    s.px(x, y + 19, 14, 1, '#4A3D52');
    // wall lamps either side
    [x - 7, x + 17].forEach(function (lx) { s.px(lx - 1, y + 3, 5, 6, K.out); s.glow(lx, y + 4, 3, 4, K.warm3); s.pool(lx + 1, y + 6, 12, 10, 'rgba(255,214,150,A)', .25); });
  }
  function plate(s, x, y, w, h, hue) {
    s.px(x - 2, y - 2, w + 4, h + 4, K.out); s.px(x - 1, y - 1, w + 2, h + 2, '#2B2537'); s.px(x, y, w, h, '#0D0B11');
    s.glow(x + 1, y + 1, w - 2, 1, neonc(hue)); s.glow(x + 1, y + h - 2, w - 2, 1, neonc(hue)); s.glow(x + 1, y + 1, 1, h - 2, neonc(hue)); s.glow(x + w - 2, y + 1, 1, h - 2, neonc(hue));
    s.e.fillStyle = neonc(hue, .25); s.e.fillRect(x + 2, y + 2, w - 4, h - 4);
  }
  function house(s, x, y, w, h, hue, name, num) {
    var R = rnd(hash(name)), rh = 28, wy = y + rh;
    s.g.fillStyle = 'rgba(0,0,0,.4)'; s.g.fillRect(x + w + 2, y + 6, 5, h - 6);                 // cast shadow
    roofTiles(s, x, y, w, rh, R);
    // chimney, skylight, AC
    s.px(x + w - 15, y - 9, 9, 13, K.out); s.px(x + w - 14, y - 8, 7, 12, '#5A3F48'); s.px(x + w - 14, y - 8, 7, 2, '#7A5560'); s.px(x + w - 14, y - 4, 7, 1, '#3A2830');
    s.px(x + w - 15, y - 10, 9, 2, K.out);
    s.px(x + 6, y + 8, 12, 9, K.out); s.px(x + 7, y + 9, 10, 7, '#18202E'); s.px(x + 7, y + 9, 10, 1, K.glass3); s.px(x + 12, y + 9, 1, 7, K.out);
    s.e.fillStyle = 'rgba(160,190,255,.15)'; s.e.fillRect(x + 7, y + 9, 10, 7);
    s.sprite(AC, PROPPAL, x + 24, y + 6, null, null, false, true);
    planks(s, x, wy, w, h - rh, R);
    s.px(x - 1, wy, 1, h - rh, K.out); s.px(x + w, wy, 1, h - rh, K.out); s.px(x - 1, y + h, w + 2, 1, K.out);
    // sign under the eave
    plate(s, x + 3, wy + 2, w - 6, 11, hue); s.label(x + 3, wy + 2, w - 6, 11, name, hue, 'circle', 10);
    // record shop window, door, a window with flowers
    shopWindow(s, x + 4, wy + 18, 16, 16, hue, R);
    door(s, Math.round(x + w / 2 - 7), y + h - 22, hue, R);
    windowW(s, x + w - 19, wy + 18, 14, 11, { R: R, lit: true, box: true, curtain: R() < .5, plant: true });
    drainpipe(s, x + w - 3, wy, h - rh);
    // house number and letterbox
    s.px(x + w / 2 + 11, y + h - 26, 5, 4, K.out); s.px(x + w / 2 + 12, y + h - 25, 3, 2, '#D8D0E8');
    s.px(x + 3, y + h - 9, 6, 6, K.out); s.px(x + 4, y + h - 8, 4, 4, '#3E5A8C'); s.px(x + 4, y + h - 8, 4, 1, '#5A7AB2');
  }
  // The vertical blade spells a short name: initials of a long one, or its first letters.
  function initials(name) {
    var w = name.split(/[\s-]+/).filter(Boolean);
    return (w.length > 1 ? w.map(function (x) { return x[0]; }).join('') : name).slice(0, 4).toUpperCase();
  }
  function tower(s, x, y, w, h, hue, name) {
    var R = rnd(hash(name)), rh = 18, wy = y + rh;
    s.g.fillStyle = 'rgba(0,0,0,.4)'; s.g.fillRect(x + w + 2, y + 8, 6, h - 8);
    // flat roof with gravel, parapet, water tank, AC units, a dish
    s.px(x - 1, y - 1, w + 2, rh + 1, K.out); s.px(x, y, w, rh, '#36313F');
    for (var i = 0; i < w * rh / 4; i++) s.px(x + Math.floor(R() * w), y + Math.floor(R() * rh), 1, 1, R() < .5 ? '#3F3A4A' : '#2C2834');
    s.px(x, y, w, 2, '#4C465A'); s.px(x, y + rh - 3, w, 3, '#24202C'); s.px(x, y, 2, rh, '#4C465A'); s.px(x + w - 2, y, 2, rh, '#24202C');
    s.sprite(AC, PROPPAL, x + 6, y + 4, null, null, false, true); s.sprite(AC, PROPPAL, x + 20, y + 5, null, null, false, true);
    // water tank
    var tx = x + 40;
    s.px(tx, y - 10, 22, 22, K.out); s.px(tx + 1, y - 9, 20, 20, '#5A4048'); s.px(tx + 1, y - 9, 20, 3, '#7A5862'); s.px(tx + 1, y - 3, 20, 1, '#3A2830'); s.px(tx + 1, y + 4, 20, 1, '#3A2830');
    s.px(tx + 3, y - 9, 2, 20, '#8A6872'); s.px(tx + 2, y + 11, 3, 3, K.out); s.px(tx + 17, y + 11, 3, 3, K.out);
    s.sprite(DISH, PROPPAL, x + w - 18, y + 3, null, null, false, true);
    s.px(x + w - 7, y - 26, 1, 30, K.metal2); s.px(x + w - 10, y - 18, 7, 1, K.metal2); s.px(x + w - 9, y - 11, 5, 1, K.metal2);
    // wall of panels
    s.px(x, wy, w, h - rh, '#25212F');
    for (var py = wy; py < y + h; py += 13) for (var px = x; px < x + w; px += 16) { s.px(px, py, 16, 1, '#302A3C'); s.px(px, py, 1, 13, '#302A3C'); s.px(px + 15, py + 1, 1, 12, '#1D1926'); }
    s.px(x - 1, wy, 1, h - rh, K.out); s.px(x + w, wy, 1, h - rh, K.out); s.px(x - 1, y + h, w + 2, 1, K.out);
    // three floors of windows
    for (var f = 0; f < 3; f++) for (var c = 0; c < 5; c++) {
      var wx = x + 16 + c * 12, wyy = wy + 4 + f * 13, lit = R() < .6;
      windowW(s, wx, wyy, 8, 7, { R: R, lit: lit, cold: R() < .3, hue: hue, blinds: lit && R() < .3, silhouette: lit && R() < .15 });
    }
    // fire escape on the right
    var fx = x + w - 15;
    for (var fl = 0; fl < 3; fl++) {
      var fy = wy + 12 + fl * 13;
      s.px(fx - 1, fy, 15, 3, K.out); for (var gx = fx; gx < fx + 13; gx += 2) s.px(gx, fy + 1, 1, 1, K.metal2);
      s.px(fx - 1, fy - 6, 1, 6, K.metal); s.px(fx + 13, fy - 6, 1, 6, K.metal); s.px(fx - 1, fy - 6, 15, 1, K.metal);
      for (var ly = fy - 10; ly < fy; ly += 2) s.px(fx + (fl % 2 ? 9 : 3), ly, 3, 1, K.metal2);
    }
    // vertical neon blade
    s.px(x + 2, wy + 3, 11, 40, K.out); s.px(x + 3, wy + 4, 9, 38, '#0D0B11');
    s.glow(x + 3, wy + 4, 9, 1, neonc(hue)); s.glow(x + 3, wy + 41, 9, 1, neonc(hue)); s.glow(x + 3, wy + 4, 1, 38, neonc(hue)); s.glow(x + 11, wy + 4, 1, 38, neonc(hue));
    s.label(x + 3, wy + 5, 9, 36, initials(name), hue, null, 11, true);
    reflect(s, x + 4, 7, y + h + 19, y + h + 49, neonc(hue), .35);
    // sign and glass lobby
    plate(s, x + 16, y + h - 40, w - 32, 12, hue); s.label(x + 16, y + h - 40, w - 32, 12, name, hue, 'circle', 12);
    var lx = x + w / 2 - 20, ly0 = y + h - 25;
    s.px(lx - 2, ly0 - 2, 44, 27, K.out); s.px(lx - 1, ly0 - 1, 42, 26, K.metal);
    s.glow(lx, ly0, 40, 25, '#3A2E58'); s.px(lx, ly0, 40, 25, '#3A2E58');
    s.px(lx, ly0, 40, 6, deepc(hue)); s.px(lx + 2, ly0 + 9, 6, 14, '#2E5444'); s.px(lx + 3, ly0 + 7, 4, 3, '#3E6B55');       // lobby plant
    s.px(lx + 32, ly0 + 9, 6, 14, '#2E5444'); s.px(lx + 33, ly0 + 7, 4, 3, '#3E6B55');
    s.px(lx + 10, ly0 + 2, 20, 23, K.out); s.px(lx + 11, ly0 + 3, 9, 22, '#5A4A8C'); s.px(lx + 20, ly0 + 3, 9, 22, '#5A4A8C');
    s.px(lx + 11, ly0 + 3, 1, 22, '#8C7AC8'); s.px(lx + 18, ly0 + 13, 1, 3, K.warm); s.px(lx + 21, ly0 + 13, 1, 3, K.warm);
    s.e.fillStyle = 'rgba(194,176,251,.2)'; s.e.fillRect(lx, ly0, 40, 25);
    s.px(lx - 6, y + h, 52, 2, K.curb); s.px(lx - 5, y + h + 2, 50, 1, K.curb2);
    s.pool(x + w / 2, y + h + 10, 40, 10, 'oklch(0.80 0.105 ' + hue + ' / A)', .16);
    poster(s, x + 3, y + h - 20, 343, R); poster(s, x + w - 12, y + h - 22, 199, R);
  }
  function kiosk(s, x, y, w, h, hue, name, vendor) {
    var R = rnd(hash(name));
    s.g.fillStyle = 'rgba(0,0,0,.4)'; s.g.fillRect(x + w + 1, y + 10, 4, h - 10);
    // back wall and shelves inside
    s.px(x - 1, y + 6, w + 2, h - 6, K.out); s.px(x, y + 7, w, h - 8, '#1C1724');
    for (var sh = y + 14; sh < y + 24; sh += 5) { s.px(x + 2, sh, w - 4, 1, '#3A3248'); for (var b = x + 3; b < x + w - 4; b += 4) s.glow(b, sh - 3, 2, 3, [K.pink, K.cyan, K.amber, K.green][Math.floor(R() * 4)]); }
    s.e.fillStyle = 'rgba(255,200,140,.25)'; s.e.fillRect(x, y + 7, w, 20);
    vendor && vendor(x + w / 2 - 9, y + 38);
    // counter
    s.px(x - 2, y + 26, w + 4, 12, K.out); s.px(x - 1, y + 27, w + 2, 10, '#3E3550'); s.px(x - 1, y + 27, w + 2, 2, '#5A4E70');
    for (var st = x + 2; st < x + w - 2; st += 6) s.px(st, y + 30, 4, 6, '#2E2740');
    s.px(x + 3, y + 24, 3, 3, '#E8E0F8'); s.px(x + 7, y + 24, 3, 3, '#E8E0F8'); s.glow(x + w - 8, y + 23, 4, 4, K.amber);   // cups and a lamp
    // striped awning
    s.px(x - 4, y, w + 8, 12, K.out);
    for (var i = x - 3; i < x + w + 3; i += 4) { s.px(i, y + 1, 2, 9, neonc(hue)); s.px(i + 2, y + 1, 2, 9, '#ECE6FA'); s.px(i, y + 10, 2, 2, neonc(hue)); s.px(i + 2, y + 10, 2, 1, '#ECE6FA'); }
    s.px(x - 3, y + 1, w + 6, 1, 'rgba(255,255,255,.35)'); s.px(x - 3, y + 8, w + 6, 1, 'rgba(0,0,0,.2)');
    // sign on two poles
    s.px(x + 2, y - 6, 2, 7, K.metal); s.px(x + w - 4, y - 6, 2, 7, K.metal);
    plate(s, x - 6, y - 18, w + 12, 12, hue); s.label(x - 6, y - 18, w + 12, 12, name, hue, null, 10);
    // a crate of records out front
    s.sprite(CRATE, { o: K.out, C: '#6A4A3A', c: '#8A6450', v: '#2A2030', '*': '*' + neonc(hue) }, x + w - 6, y + h - 7, null, null, false, true);
    s.pool(x + w / 2, y + h + 6, 26, 7, 'rgba(255,200,140,A)', .22);
  }

