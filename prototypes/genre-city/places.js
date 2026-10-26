  /* =====================================================================
   * Places. How deep a genre goes decides what it is in the game:
   *   no subgenre             a kiosk: its page is read at the counter
   *   up to 8 subgenres       a house: one room, every subgenre in sight
   *   grouped, under 50       a tower: an elevator, one floor per group
   *   grouped, 50 and more    a quarter: open air, a plaza and its districts
   * Electronic City itself is the quarter of the whole family.
   * ===================================================================== */
  function kindOf(n) {
    if (!n.kids.length) return 'kiosk';
    if (!n.kids.some(function (k) { return k.grp; })) return 'house';
    return n.total >= 50 ? 'quarter' : 'tower';
  }
  function artSize(n) {
    var k = kindOf(n);
    return k === 'kiosk' ? [36, 38] : k === 'house' ? (n.total >= 10 ? [76, 74] : [60, 66]) : k === 'tower' ? [92, 102] : [96, 84];
  }
  // A group's genres, nested groups included, each with the path of groups it sits in.
  function flatten(g, path) {
    path = path || [];
    return g.kids.reduce(function (out, k) {
      if (k.grp) return out.concat(flatten(k, path.concat(k.name)));
      out.push({ n: k, path: path }); return out;
    }, []);
  }
  function ceil16(v) { return Math.ceil(v / TILE) * TILE; }
  function info(n, path) {
    var meta = [n.y, n.o].filter(Boolean).join(' · ');
    return { text: n.name.toUpperCase() + (meta ? ' · ' + meta : '') + (path && path.length ? ' · ' + path.join(' › ') : '') + '. ' +
      (n.d || 'Its page tells where it comes from and who plays it.'),
      link: pageUrl(n), linkText: 'READ THE FULL PAGE', link2: n.a ? pageUrl(n) + '#ga-d-listen' : null, link2Text: 'LISTEN' };
  }
  function what(n) {
    var k = kindOf(n);
    return n.name.toUpperCase() + ' · ' + (k === 'kiosk' ? 'no subgenre. Read its page at the counter.' :
      plural(n.total, 'subgenre', 'subgenres') + (k === 'quarter' ? '. A whole quarter: walk through the arch.' : k === 'tower' ? '. A tower: take the elevator.' : '. Walk in through the door.'));
  }

  /* ---------- the arch at the mouth of a quarter ---------- */
  function arch(s, x, y, w, h, hue, name) {
    s.pool(x + w / 2, y + h + 4, w * .7, 10, 'oklch(0.80 0.105 ' + hue + ' / A)', .3);
    for (var gy = 0; gy < h - 24; gy++) { s.g.globalAlpha = .06 + gy * .006; s.g.fillStyle = neonc(hue); s.g.fillRect(x + 14, y + 22 + gy, w - 28, 1); }
    s.g.globalAlpha = 1;
    [x, x + w - 14].forEach(function (px, i) {
      s.g.fillStyle = 'rgba(0,0,0,.4)'; s.g.fillRect(px + 14, y + 26, 4, h - 26);
      s.px(px - 1, y + 16, 16, h - 15, K.out); s.px(px, y + 17, 14, h - 17, '#2E2A38'); s.px(px, y + 17, 3, h - 17, '#3E384C'); s.px(px + 11, y + 17, 3, h - 17, '#24202C');
      s.glow(i ? px : px + 13, y + 22, 1, h - 24, neonc(hue));
      for (var b = y + 30; b < y + h - 6; b += 12) s.px(px + 3, b, 8, 1, '#24202C');
    });
    s.px(x - 4, y - 1, w + 8, 22, K.out); s.px(x - 3, y, w + 6, 20, '#2E2A38'); s.px(x - 3, y, w + 6, 2, '#4A4458'); s.px(x - 3, y + 18, w + 6, 2, '#1E1B26');
    plate(s, x + 4, y + 3, w - 8, 14, hue); s.label(x + 4, y + 3, w - 8, 14, name, hue, null, 10);
    s.px(x + 14, y + h - 2, w - 28, 2, K.curb);
  }
  function post(s, x, y, name, hue, w) {                    // a street sign on a pole
    w = w || 104;
    s.px(x + 6, y + 18, 2, 30, K.metal); s.px(x + 6, y + 18, 1, 30, K.metal4);
    plate(s, x, y, w, 20, hue); s.label(x, y, w, 20, name, hue, null, 9);
    s.g.fillStyle = 'rgba(0,0,0,.35)'; s.g.fillRect(x + 8, y + 46, 6, 2);
  }

  /* =================== a quarter: a plaza in the middle, up to 8 districts around it =================== */
  // Districts go round the plaza clockwise from the north, in alphabetical order, like the
  // ring of the map. Each keeps its cell: a new genre only grows the street it belongs to.
  var RING4 = [[1, 0], [2, 1], [1, 2], [0, 1]], RING8 = [[1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0]];
  function buildQuarter(node, opts) {
    opts = opts || {};
    var hue = HUE, ROAD = 48, M = 32, GAP = 16;
    var cells = node.kids.map(function (top) { return { top: top, items: top.grp ? flatten(top) : [{ n: top, path: [] }] }; });
    var ring = cells.length <= 4 ? RING4 : RING8;
    cells.forEach(function (c, ci) {
      c.pos = ring[ci];
      // above and below the plaza a district grows downwards, beside it sideways
      var per = c.pos[0] === 1 ? Math.max(3, Math.ceil(c.items.length / 3)) : c.pos[1] === 1 ? Math.max(3, Math.ceil(c.items.length / 2)) : (c.items.length > 8 ? 5 : 4); c.rows = [];
      for (var i = 0; i < c.items.length; i += per) c.rows.push(c.items.slice(i, i + per));
      c.rowH = c.rows.map(function (r) { return ceil16(Math.max.apply(null, r.map(function (it) { return artSize(it.n)[1]; })) + 22); });
      c.w = Math.max.apply(null, c.rows.map(function (r) { return r.reduce(function (t, it) { return t + artSize(it.n)[0]; }, 0) + GAP * (r.length - 1); })) + 32;
      c.h = c.rowH.reduce(function (t, h) { return t + h + TILE; }, 0) + 72;
    });
    // column widths and row heights fit what they hold; the plaza keeps the size of a plaza
    var colW = [0, 320, 0], rowH = [0, 256, 0];
    cells.forEach(function (c) { colW[c.pos[0]] = Math.max(colW[c.pos[0]], c.w); rowH[c.pos[1]] = Math.max(rowH[c.pos[1]], c.h); });
    colW = colW.map(function (v) { return ceil16(Math.max(v, 224)); }); rowH = rowH.map(function (v) { return ceil16(Math.max(v, 192)); });
    var W = 2 * M + colW[0] + colW[1] + colW[2] + 2 * ROAD, H = 2 * M + rowH[0] + rowH[1] + rowH[2] + 2 * ROAD;
    var CW = colW[1], CH = rowH[1];
    var s = new World(W / TILE, H / TILE, node === ROOT ? 'ELECTRONIC CITY' : node.name.toUpperCase() + ' QUARTER'), g = s.g, R = rnd(typeof node.id === 'number' ? node.id : 7);
    function origin(col, row) { return [M + colW.slice(0, col).reduce(function (t, v) { return t + v + ROAD; }, 0), M + rowH.slice(0, row).reduce(function (t, v) { return t + v + ROAD; }, 0)]; }
    var RX = [origin(1, 0)[0] - ROAD, origin(2, 0)[0] - ROAD], RY = [origin(0, 1)[1] - ROAD, origin(0, 2)[1] - ROAD];
    pavers(s, 0, 0, W, H);
    // the roads around the plaza, and their crossings
    RY.forEach(function (ry) {
      asphalt(s, M, ry + 8, W - 2 * M, 32); curb(s, M, ry + 5, W - 2 * M); curb(s, M, ry + 40, W - 2 * M);
      for (var lx = M + 4; lx < W - M; lx += 22) s.px(lx, ry + 23, 11, 2, K.lane);
    });
    RX.forEach(function (rx) {
      asphalt(s, rx + 8, M, 32, H - 2 * M); s.px(rx + 5, M, 3, H - 2 * M, K.curb); s.px(rx + 40, M, 3, H - 2 * M, K.curb);
      for (var ly = M + 4; ly < H - M; ly += 22) s.px(rx + 23, ly, 2, 11, K.lane);
    });
    RX.forEach(function (rx) { RY.forEach(function (ry) {
      asphalt(s, rx + 8, ry + 8, 32, 32);
      for (var z = 0; z < 32; z += 6) { s.px(rx + 8 + z, ry + 2, 4, 6, '#8E88A0'); s.px(rx + 8 + z, ry + 40, 4, 6, '#8E88A0'); }
    }); });
    // the edge of the quarter: a hedge all round
    for (var ei = 0; ei < s.cols; ei++) { s.wall(ei, 0); s.wall(ei, 1); s.wall(ei, s.rows - 1); s.wall(ei, s.rows - 2); }
    for (var ej = 0; ej < s.rows; ej++) { s.wall(0, ej); s.wall(1, ej); s.wall(s.cols - 1, ej); s.wall(s.cols - 2, ej); }
    hedge(s, 0, 4, W, 3); hedge(s, 0, H - 26, W, 4);
    for (var hy = 18; hy < H - 26; hy += 12) { blob(s, 2, hy, 26, 14, [[13, 7, 7], [6, 8, 5], [20, 8, 5]], ['#3E6B55', '#2C5242', '#1F3D31', '#142A21'], hy); blob(s, W - 28, hy, 26, 14, [[13, 7, 7], [6, 8, 5], [20, 8, 5]], ['#3E6B55', '#2C5242', '#1F3D31', '#142A21'], hy + 1); }
    // lamps along the roads
    RY.forEach(function (ry) { for (var lx2 = M + 40; lx2 < W - M - 20; lx2 += 160) { lamp(s, lx2, ry - 18, hue); s.block(lx2 + 4, ry, 8, 4); } });

    // the plaza
    var po = origin(1, 1), px0 = po[0], py0 = po[1], cx = px0 + CW / 2, cy = py0 + CH / 2;
    for (var py = py0 + 8; py < py0 + CH - 8; py += 8) for (var px = px0 + 8; px < px0 + CW - 8; px += 8) { s.px(px, py, 8, 8, ((px + py) / 8) % 2 ? '#221E2C' : '#1C1925'); s.px(px, py, 8, 1, '#2C2738'); s.px(px, py, 1, 8, '#2C2738'); }
    for (var a = 0; a < 80; a++) { var an = a / 80 * Math.PI * 2; s.px(Math.round(cx + 52 * Math.cos(an)), Math.round(cy + 26 + 20 * Math.sin(an)), 2, 1, deepc(hue, .7)); }
    s.px(cx - 24, cy + 16, 48, 13, K.out); s.px(cx - 23, cy + 17, 46, 11, '#3A3446'); s.px(cx - 23, cy + 17, 46, 2, '#56506A'); s.px(cx - 23, cy + 26, 46, 2, '#2A2534');
    pixShape(s, 'circle', cx, cy, 12, neonc(hue)); pixShape(s, 'circle', cx, cy, 17, neonc(hue, .55));
    for (var d = 0; d < Math.min(8, node.kids.length); d++) { var ang = (-90 + 360 * d / node.kids.length) * Math.PI / 180; s.glow(Math.round(cx - 1 + 14.5 * Math.cos(ang)), Math.round(cy - 1 + 14.5 * Math.sin(ang)), 2, 2, neonc(hue)); }
    s.glow(cx - 1, cy - 1, 3, 3, neonc(hue)); s.pool(cx, cy + 12, 46, 16, 'oklch(0.80 0.105 ' + hue + ' / A)', .3);
    s.block(cx - 24, cy - 18, 48, 47);
    var mon = info(node); mon.text = (node === ROOT ? 'ELECTRONIC CITY · ' : node.name.toUpperCase() + ' QUARTER · ') + plural(node.total, 'genre', 'genres') + ' in ' + plural(node.kids.length, 'district', 'districts') + '. ' + (node.d || '');
    for (var mi = Math.floor((cx - 24) / TILE); mi <= Math.floor((cx + 23) / TILE); mi++) for (var mr = Math.floor((cy - 18) / TILE); mr <= Math.floor((cy + 29) / TILE); mr++) s.act(mi, mr, mon);
    // the way out: the metro in the city, an arch back to the street in a quarter
    var ex = cx - 120, ey = cy - 56, exitRow;
    if (opts.metro) {
      s.px(ex - 3, ey - 1, 36, 34, K.out);
      for (var st = 0; st < 32; st += 3) { var cc = 10 + st; s.px(ex, ey + st, 30, 3, 'rgb(' + cc + ',' + (cc - 2) + ',' + (cc + 6) + ')'); s.px(ex, ey + st, 30, 1, 'rgba(255,255,255,.07)'); }
      s.px(ex - 2, ey - 1, 2, 33, K.metal2); s.px(ex + 30, ey - 1, 2, 33, K.metal2); s.glow(ex, ey - 1, 1, 33, neonc(270)); s.glow(ex + 29, ey - 1, 1, 33, neonc(270));
      plate(s, ex - 8, ey - 16, 46, 11, 270); s.label(ex - 8, ey - 16, 46, 11, 'TERMINAL', 270, null, 9);
      s.pool(ex + 15, ey + 38, 26, 9, 'rgba(194,176,251,A)', .2);
      s.block(ex - 3, ey - 16, 36, 22); s.block(ex - 3, ey, 4, 33); s.block(ex + 29, ey, 4, 33);
      exitRow = Math.floor((ey + 24) / TILE);
      for (var tx = Math.floor((ex + 2) / TILE); tx <= Math.floor((ex + 27) / TILE); tx++) { s.on(tx, exitRow, { go: 'terminal' }); s.wall(tx, exitRow - 1); }
      s.start = { x: Math.floor((ex + 15) / TILE), y: exitRow + 1, dir: 'down' };
    } else {
      var aw = 64, ah = 56, axx = Math.round(ex - 16), ayy = Math.round(ey - 20);
      arch(s, axx, ayy, aw, ah, hue, '◀ ' + opts.back);
      s.block(axx - 4, ayy - 1, aw + 8, ah - 14); s.block(axx, ayy + 16, 14, ah - 16); s.block(axx + aw - 14, ayy + 16, 14, ah - 16);
      exitRow = Math.floor((ayy + ah - 1) / TILE);
      for (var at = Math.floor((axx + 16) / TILE); at <= Math.floor((axx + aw - 17) / TILE); at++) s.on(at, exitRow, { exit: true });
      s.start = { x: Math.floor((axx + aw / 2) / TILE), y: exitRow + 1, dir: 'down' };
    }
    // the family's jukebox and terminal on the plaza
    outdoorJukebox(s, cx + 70, cy - 52, node, hue); aboutTerminal(s, cx + 108, cy - 52, node, hue);
    [[-60, -10], [44, -10]].forEach(function (o) { lamp(s, cx + o[0], cy + o[1], hue); s.block(cx + o[0] + 4, cy + o[1] + 18, 8, 4); });
    // the signpost: which way to each district
    var ARROW = { '1,0': '▲', '2,0': '◥', '2,1': '▶', '2,2': '◢', '1,2': '▼', '0,2': '◣', '0,1': '◀', '0,0': '◤' };
    var bx = cx - 158, bw = 128, bh = 14 + cells.length * 12, by = Math.min(cy + 22, py0 + CH - bh - 26);
    s.g.fillStyle = 'rgba(0,0,0,.35)'; s.g.fillRect(bx + 4, by + bh + 2, bw, 4);
    s.px(bx + 10, by + bh, 2, 12, K.metal); s.px(bx + bw - 12, by + bh, 2, 12, K.metal);
    s.px(bx - 2, by - 2, bw + 4, bh + 4, K.out); s.px(bx - 1, by - 1, bw + 2, bh + 2, K.metal); s.px(bx, by, bw, bh, '#0B0910');
    s.label(bx, by + 2, bw, 9, 'DISTRICTS', 270, null, 9);
    cells.forEach(function (c, i) { s.label(bx + 4, by + 13 + i * 12, bw - 8, 11, ARROW[c.pos.join()] + ' ' + c.top.name, hue, null, 8); });
    s.e.fillStyle = 'rgba(194,176,251,.08)'; s.e.fillRect(bx, by, bw, bh);
    s.block(bx, by + bh - 6, bw, 16);
    var dirs = { text: 'DISTRICTS · ' + cells.map(function (c) { return ARROW[c.pos.join()] + ' ' + c.top.name; }).join(' · ') };
    for (var di2 = Math.floor(bx / TILE); di2 <= Math.floor((bx + bw) / TILE); di2++) for (var dr = Math.floor(by / TILE); dr <= Math.floor((by + bh + 12) / TILE); dr++) s.act(di2, dr, dirs);

    // the districts
    var used = {};
    cells.forEach(function (c) {
      var pos = c.pos, o = origin(pos[0], pos[1]), ox = o[0], oy = o[1], cw = colW[pos[0]], ch = rowH[pos[1]];
      used[pos.join()] = true;
      // the district's sign stands on the side that faces the plaza
      var north = pos[1] === 0, west = pos[0] === 0, pw = Math.min(cw - 16, 140);
      var sx0 = west ? ox + cw - pw - 8 : ox + 8, sy0 = north ? oy + ch - 52 : oy + 4;
      post(s, sx0, sy0, c.top.name, hue, pw);
      s.block(sx0 + 4, sy0 + 30, 6, 18);
      var sign = { text: c.top.name.toUpperCase() + ' · ' + plural(c.items.length, 'building', 'buildings') + ', ' + plural(c.top.grp ? c.top.total : 1 + c.top.total, 'genre', 'genres') + ' in all.' };
      for (var sx = 0; sx < 3; sx++) s.act(Math.floor((sx0 + 6) / TILE), Math.floor((sy0 + 30) / TILE) + sx, sign);
      var y = north ? oy + 16 : oy + 64;
      c.rows.forEach(function (row, ri) {
        var bottom = y + c.rowH[ri], x = ox + 16;
        row.forEach(function (it) {
          var n = it.n, k = kindOf(n), sz = artSize(n), w = sz[0], h = sz[1], top = bottom - h;
          if (k === 'kiosk') kiosk(s, x, top, w, h, hue, n.name);
          else if (k === 'tower') tower(s, x, top, w, h, hue, n.name);
          else if (k === 'quarter') arch(s, x, top, w, h, hue, n.name);
          else house(s, x, top, w, h, hue, n.name);
          s.block(x - 2, top + (k === 'kiosk' ? -18 : 0), w + 4, h + (k === 'kiosk' ? 18 : 0));
          var doorTile = Math.floor((x + w / 2) / TILE), doorRow = bottom / TILE - 1;
          var about = info(n, it.path);
          if (k === 'kiosk') { s.bumps[doorTile + ',' + doorRow] = about; }
          else s.on(doorTile, doorRow, { enter: n, path: it.path });
          var desc = k === 'kiosk' ? about : { text: what(n) + (it.path.length ? ' (' + it.path.join(' › ') + ')' : '') };
          for (var bi = Math.floor(x / TILE); bi <= Math.floor((x + w - 1) / TILE); bi++) if (bi !== doorTile || k === 'kiosk') s.act(bi, doorRow, desc);
          x += w + GAP;
        });
        y = bottom + TILE;
      });
    });
    // empty cells become small parks
    for (var col = 0; col < 3; col++) for (var row = 0; row < 3; row++) {
      if (used[col + ',' + row] || (col === 1 && row === 1)) continue;
      var po2 = origin(col, row), pcw = colW[col], pch = rowH[row];
      grass(s, po2[0] + 8, po2[1] + 8, pcw - 16, pch - 16);
      for (var t = 0; t < 4; t++) { var tx2 = po2[0] + 24 + Math.floor(R() * (pcw - 80)), ty2 = po2[1] + 16 + Math.floor(R() * (pch - 70)); tree(s, tx2, ty2, t * 13 + col * 7 + row, .9); s.block(tx2 + 10, ty2 + 24, 10, 12); }
      s.sprite(BENCH, PROPPAL, po2[0] + pcw / 2 - 10, po2[1] + pch - 40, null, null, false, true); s.block(po2[0] + pcw / 2 - 10, po2[1] + pch - 40, 20, 10);
    }
    // puddles on the roads
    for (var pu = 0; pu < 6; pu++) puddle(s, M + 20 + R() * (W - 2 * M - 40), RY[pu % 2] + 16 + R() * 18, 6 + R() * 6, R() < .5 ? hue : 343);
    var passer = LOOKS.cap, roadsY = [RY[0] + 4, RY[1] + 46];
    s.live = function (g2, e, l, t) {
      roadsY.forEach(function (ry, k) {
        var x = k ? W - Math.round(((t + 4000) * .03) % (W + 60)) + 30 : Math.round((t * .03) % (W + 60)) - 30;
        drawWalker(s, g2, e, passer, x, ry, !!k, Math.floor(t / 230) % 2);
      });
    };
    s.rain = true;
    return s;
  }
  function outdoorJukebox(s, jx, jy, n, hue) {
    var g = s.g;
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(jx + 30, jy + 6, 5, 40);
    g.fillStyle = K.out; g.beginPath(); g.arc(jx + 15, jy + 13, 16, Math.PI, 0); g.fill(); s.px(jx - 1, jy + 12, 32, 34, K.out);
    g.fillStyle = '#4A3A62'; g.beginPath(); g.arc(jx + 15, jy + 13, 15, Math.PI, 0); g.fill(); s.px(jx, jy + 13, 30, 32, '#4A3A62');
    s.px(jx, jy + 13, 3, 32, '#5E4C7C'); s.px(jx + 27, jy + 13, 3, 32, '#36294A');
    for (var a = 0; a < 60; a++) { var an = Math.PI + a / 60 * Math.PI; s.glow(Math.round(jx + 15 + 13 * Math.cos(an)), Math.round(jy + 13 + 13 * Math.sin(an)), 1, 1, a % 10 < 5 ? neonc(hue) : K.pink); }
    s.px(jx + 5, jy + 6, 20, 13, K.out); s.px(jx + 6, jy + 7, 18, 11, '#120F18'); for (var rr = 0; rr < 5; rr++) s.px(jx + 7, jy + 8 + rr * 2, 16, 1, rr % 2 ? K.warm2 : K.warm);
    s.e.fillStyle = 'rgba(246,201,124,.5)'; s.e.fillRect(jx + 6, jy + 7, 18, 11);
    s.px(jx + 5, jy + 22, 20, 12, K.out); s.px(jx + 6, jy + 23, 18, 10, '#241D30'); for (var gr = 0; gr < 6; gr++) s.px(jx + 7 + gr * 3, jy + 24, 2, 8, K.metal);
    s.glow(jx + 2, jy + 38, 26, 2, K.pink); s.px(jx + 2, jy + 41, 26, 3, '#36294A');
    s.label(jx - 3, jy + 47, 36, 8, 'JUKEBOX', hue, null, 9); s.pool(jx + 15, jy + 46, 26, 9, 'rgba(255,111,168,A)', .2);
    s.block(jx, jy, 30, 46);
    var juke = n.a ? { text: 'JUKEBOX · The key artists of ' + n.name + ', with a track to play for each of them, on the full page.', link: pageUrl(n) + '#ga-d-listen', linkText: 'LISTEN ON THE FULL PAGE' }
      : { text: 'JUKEBOX · No key artist for ' + n.name + ' yet. You can suggest one on its page.', link: pageUrl(n), linkText: 'SUGGEST AN ARTIST' };
    for (var i = Math.floor(jx / TILE); i <= Math.floor((jx + 29) / TILE); i++) for (var j = Math.floor(jy / TILE); j <= Math.floor((jy + 45) / TILE); j++) s.act(i, j, juke);
  }
  function aboutTerminal(s, tx, ty, n, hue) {
    s.g.fillStyle = 'rgba(0,0,0,.4)'; s.g.fillRect(tx + 30, ty + 6, 5, 40);
    s.px(tx - 1, ty - 1, 32, 46, K.out); s.px(tx, ty, 30, 44, '#2E2A3C'); s.px(tx, ty, 30, 2, '#46405A'); s.px(tx + 27, ty + 2, 3, 42, '#24202F');
    s.px(tx + 3, ty + 4, 24, 18, K.out); s.glow(tx + 4, ty + 5, 22, 16, darkc(hue));
    for (var sl = ty + 6; sl < ty + 21; sl += 2) s.px(tx + 4, sl, 22, 1, 'rgba(0,0,0,.18)');
    pixShape(s, 'circle', tx + 15, ty + 11, 4, neonc(hue)); s.glow(tx + 15, ty + 11, 1, 1, neonc(hue)); s.glow(tx + 7, ty + 17, 16, 1, neonc(hue, .7));
    s.px(tx + 3, ty + 26, 24, 12, '#1C1824'); for (var kk = 0; kk < 18; kk++) s.px(tx + 4 + (kk % 6) * 4, ty + 27 + Math.floor(kk / 6) * 4, 3, 2, kk === 17 ? neonc(hue) : K.metal);
    s.label(tx - 3, ty + 47, 36, 8, 'ABOUT', hue, null, 9); s.pool(tx + 15, ty + 46, 24, 9, 'oklch(0.80 0.105 ' + hue + ' / A)', .2);
    s.block(tx, ty, 30, 46);
    var about = info(n);
    for (var i = Math.floor(tx / TILE); i <= Math.floor((tx + 29) / TILE); i++) for (var j = Math.floor(ty / TILE); j <= Math.floor((ty + 45) / TILE); j++) s.act(i, j, about);
  }

  /* =================== a room: a house's only room, a tower's lobby or one of its floors =================== */
  // Subgenres line the back wall: those with subgenres of their own are doors, the others are
  // lit studios whose page is read through the glass. Nothing is behind a door for its own sake.
  function buildRoom(o) {
    var s = new World(20, 12, o.title), W = s.W, H = s.H, g = s.g, hue = HUE, R = rnd(hash(o.title));
    for (var y = 74; y < H; y += 16) for (var x = 0; x < W; x += 16) { s.px(x, y, 16, 16, R() < .5 ? '#1F1B27' : '#1C1924'); s.px(x, y, 16, 1, '#292432'); s.px(x, y, 1, 16, '#292432'); }
    s.px(0, 0, W, 74, '#1E1820');
    for (var by = 0; by < 72; by += 4) for (var bx = (by / 4 % 2) * 6; bx < W; bx += 12) { s.px(bx, by, 12, 4, R() < .5 ? '#2A1F26' : '#261C23'); s.px(bx, by, 12, 1, '#33262E'); s.px(bx, by, 1, 4, '#160F14'); }
    s.px(0, 72, W, 2, K.out); s.glow(0, 70, W, 1, neonc(hue, .8));
    for (var i = 0; i < 20; i++) for (var j = 0; j < 4; j++) s.wall(i, j);
    var items = o.items || [];
    items.forEach(function (it, i) {
      var n = it.n, span = W / items.length, dx = Math.round(i * span + span / 2 - 12), pw = Math.min(46, Math.floor(span) - 4), t = Math.floor((dx + 12) / TILE);
      plate(s, dx + 12 - pw / 2, 3, pw, 19, hue); s.label(dx + 12 - pw / 2, 3, pw, 19, n.name, hue, null, 8);
      s.px(dx - 2, 27, 28, 45, K.out); s.px(dx - 1, 28, 26, 44, K.metal);
      if (n.kids.length) {                                      // a door further down
        s.px(dx, 29, 24, 43, '#0A080D');
        for (var q = 0; q < 6; q++) s.px(dx + 2, 32 + q * 7, 20, 3, 'rgba(194,176,251,' + (.03 + q * .03) + ')');
        for (var st = dx + 1; st < dx + 23; st += 3) s.glow(st, 29, 1, 6, neonc(hue, .5));
        s.glow(dx, 28, 24, 1, neonc(hue));
        s.on(t, 3, { enter: n, path: it.path });
        s.act(t - 1, 3, { text: what(n) }); s.act(t + 1, 3, { text: what(n) });
      } else {                                                  // a lit studio, read through the glass
        shopWindow(s, dx, 29, 24, 40, hue, R);
        s.act(t, 3, info(n, it.path)); s.bumps[t + ',' + 3] = info(n, it.path);
      }
      s.label(dx - 8, 75, 40, 7, n.kids.length ? plural(n.total, 'SUBGENRE', 'SUBGENRES') : 'READ', 270, null, 8);
      reflect(s, dx + 2, 20, 84, 110, neonc(hue), .16);
    });
    if (o.elevator) {
      var ex = W / 2 - 20;
      s.px(ex - 3, 22, 46, 50, K.out); s.px(ex - 2, 23, 44, 49, K.metal2); s.px(ex - 2, 23, 44, 2, K.metal4);
      s.px(ex, 30, 40, 42, '#3A3448'); s.px(ex + 19, 30, 2, 42, K.out); s.px(ex + 2, 32, 16, 38, '#46405A'); s.px(ex + 22, 32, 16, 38, '#46405A');
      s.px(ex + 2, 32, 2, 38, '#56506A'); s.px(ex + 22, 32, 2, 38, '#56506A');
      plate(s, ex - 6, 6, 52, 13, hue); s.label(ex - 6, 6, 52, 13, 'ELEVATOR', hue, null, 9);
      s.glow(ex + 44, 44, 3, 3, K.amber); s.glow(ex + 44, 50, 3, 3, K.green);
      s.on(9, 3, { elevator: o.elevator }); s.on(10, 3, { elevator: o.elevator });
    }
    if (!items.length && !o.elevator) { plate(s, 80, 26, 160, 26, hue); s.label(80, 26, 160, 26, 'NO SUBGENRE · THE END OF THIS BRANCH', hue, null, 9); }
    if (o.host) { outdoorJukebox(s, 16, 92, o.host, hue); aboutTerminal(s, 276, 92, o.host, hue); }
    s.px(144, H - 12, 32, 12, K.out); s.px(145, H - 11, 30, 11, deepc(hue)); for (var m = 0; m < 30; m += 3) s.px(145 + m, H - 11, 1, 11, '#2B2440');
    s.label(180, H - 10, 60, 8, o.exitLabel || '▼ EXIT', 270, null, 9);
    s.on(9, 11, { exit: true }); s.on(10, 11, { exit: true });
    for (var ex2 = 0; ex2 < 20; ex2++) if (ex2 !== 9 && ex2 !== 10) s.wall(ex2, 11);
    [[2, 150], [302, 150]].forEach(function (p, i) {
      s.px(p[0] + 1, p[1] + 16, 14, 10, K.out); s.px(p[0] + 2, p[1] + 17, 12, 8, '#3A3044'); s.px(p[0] + 2, p[1] + 17, 12, 2, '#56486A');
      blob(s, p[0], p[1], 16, 19, [[8, 9, 7], [4, 12, 4], [12, 12, 4]], ['#4E7A63', '#36604E', '#25463A', '#173027'], 50 + i);
      s.block(p[0], p[1] + 12, 16, 14);
    });
    var fx = 104, fy = 108;
    s.live = function (g2, e) {
      var beat = Math.floor(performance.now() / 420);
      for (var i2 = 0; i2 < 7; i2++) for (var j2 = 0; j2 < 4; j2++) {
        var x2 = fx + i2 * 16, y2 = fy + j2 * 11, lit = (i2 * 7 + j2 * 3 + beat) % 5, h2 = [295, 343, 199, 295, 175][lit];
        g2.fillStyle = K.out; g2.fillRect(x2, y2, 16, 11);
        g2.fillStyle = lit < 2 ? neonc(h2, .9) : darkc(h2, .95); g2.fillRect(x2 + 1, y2 + 1, 14, 9);
        g2.fillStyle = 'rgba(255,255,255,.15)'; g2.fillRect(x2 + 1, y2 + 1, 14, 1);
        if (lit < 2) { e.fillStyle = neonc(h2, .45); e.fillRect(x2 + 1, y2 + 1, 14, 9); }
      }
    };
    s.start = { x: 9, y: 10, dir: 'up' };
    return s;
  }
  // What lies behind a door, by kind.
  function placeFor(n) {
    var k = kindOf(n);
    if (k === 'quarter') return buildQuarter(n, { back: realPathName(n) });
    if (k === 'tower') return buildRoom({ title: n.name.toUpperCase() + ' · LOBBY', host: n, elevator: n });
    return buildRoom({ title: n.name.toUpperCase(), host: n, items: n.kids.map(function (k2) { return { n: k2, path: [] }; }) });
  }
  function realPathName(n) { var p = N[n.p]; return p === ROOT ? 'ELECTRONIC CITY' : (p ? p.name.toUpperCase() + ' QUARTER' : 'BACK'); }

  /* =================== the game: camera, moves, triggers, dialogue =================== */
  var cv = document.getElementById('game'), c = cv.getContext('2d');
  var narrow = window.innerWidth < 700, VC = narrow ? 13 : 20, VR = 12, VW = VC * TILE, VH = VR * TILE;
  cv.width = VW * Z; cv.height = VH * Z;
  var mk = function (w, h) { var x = document.createElement('canvas'); x.width = w; x.height = h; return x; };
  var dyn = mk(VW, VH), dynE = mk(VW, VH), dynL = mk(VW, VH);       // what moves, drawn for the view only
  var dlg = document.getElementById('dlg'), dlgText = document.getElementById('dlg-text'), dlgLink = document.getElementById('dlg-link'), dlgLink2 = document.getElementById('dlg-link2'), dlgList = document.getElementById('dlg-list');
  var banner = document.getElementById('banner'), fade = document.getElementById('fade');
  var world = null, stack = [], cache = {}, order = [], hero = { x: 0, y: 0, dir: 'up', moving: null, frame: 0 }, held = [], busy = false, bannerTimer = 0, run = false;
  var drops = []; (function () { var Rr = rnd(9); for (var i = 0; i < 110; i++) drops.push([Rr() * cv.width, Rr() * cv.height, 8 + Rr() * 12]); })();
  // Places are built when first visited, and only the last few are kept.
  function place(key, build) {
    if (!cache[key]) {
      cache[key] = build(); order.push(key);
      if (order.length > 8) {
        var keep = function (k) { return k === 'terminal' || k === 'city' || k === key || stack.some(function (b) { return b.w === cache[k]; }); };
        var old = order.filter(function (k) { return !keep(k); })[0];
        if (old) { delete cache[old]; order.splice(order.indexOf(old), 1); }
      }
    }
    return cache[key];
  }
  function enterWorld(w, at) {
    world = w;
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
  var choosing = null;
  function say(o) {
    dlgText.textContent = o.text; dlgList.hidden = true; choosing = null;
    if (o.link) { dlgLink.href = o.link; dlgLink.textContent = o.linkText + ' ↗'; dlgLink.hidden = false; } else dlgLink.hidden = true;
    if (o.link2) { dlgLink2.href = o.link2; dlgLink2.textContent = o.link2Text + ' ↗'; dlgLink2.hidden = false; } else dlgLink2.hidden = true;
    dlg.hidden = false;
  }
  // A list to pick from (the elevator), with the keys or a tap.
  function choose(text, options, pick) {
    say({ text: text });
    dlgList.innerHTML = '';
    options.forEach(function (op, i) {
      var b = document.createElement('button'); b.type = 'button'; b.id = 'choice-' + i; b.textContent = op.label;
      b.addEventListener('click', function (ev) { ev.stopPropagation(); close(); pick(op.value); });
      dlgList.appendChild(b);
    });
    dlgList.hidden = false; choosing = { n: options.length, i: 0, options: options, pick: pick }; mark();
  }
  function mark() { [].forEach.call(dlgList.children, function (b, i) { b.setAttribute('aria-current', String(i === choosing.i)); }); }
  function close() { dlg.hidden = true; held = []; choosing = null; }
  var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function arrive() {
    var t = world.trig[hero.x + ',' + hero.y]; if (!t) return;
    if (t.go === 'city') travel(function () { stack = []; var w = place('city', function () { return buildQuarter(ROOT, { metro: true }); }); enterWorld(w, w.start); });
    else if (t.go === 'terminal') travel(function () { stack = []; enterWorld(cache.terminal, { x: 1, y: 3, dir: 'down' }); });
    else if (t.enter) {
      var n = t.enter, back = { w: world, x: hero.x, y: hero.y + 1, dir: 'down' };
      travel(function () { stack.push(back); var w = place('n' + n.id, function () { return placeFor(n); }); enterWorld(w, w.start); });
    } else if (t.elevator) {
      var host = t.elevator, floors = host.kids;
      choose('ELEVATOR · ' + host.name.toUpperCase() + '. Pick a floor.', floors.map(function (f, i) {
        return { label: 'FLOOR ' + (i + 1) + ' · ' + f.name + ' · ' + plural(f.grp ? flatten(f).length : 1, 'genre', 'genres'), value: f };
      }), function (f) {
        var back = { w: world, x: hero.x, y: hero.y + 1, dir: 'down' };
        travel(function () {
          stack.push(back);
          var w = place('f' + f.id, function () { return buildRoom({ title: host.name.toUpperCase() + ' · FLOOR ' + (floors.indexOf(f) + 1) + ' · ' + f.name, items: f.grp ? flatten(f) : [{ n: f, path: [] }], exitLabel: '▼ ELEVATOR' }); });
          enterWorld(w, w.start);
        });
      });
    } else if (t.exit) {
      var b = stack.pop();
      if (b) travel(function () { enterWorld(b.w, b); });
    }
  }
  function tryMove(dir) {
    hero.dir = dir;
    var nx = hero.x + D[dir][0], ny = hero.y + D[dir][1];
    if (!world.free(nx, ny)) { var bump = world.bumps[nx + ',' + ny]; if (bump) say(bump); return; }
    hero.moving = { fx: hero.x, fy: hero.y, t0: performance.now(), d: run ? 85 : 150 };
    hero.x = nx; hero.y = ny; hero.frame = (hero.frame % 2) + 1;
  }
  function action() {
    if (choosing) { var op = choosing.options[choosing.i], pick = choosing.pick; close(); pick(op.value); return; }
    if (!dlg.hidden) { close(); return; }
    var fx = hero.x + D[hero.dir][0], fy = hero.y + D[hero.dir][1];
    var a = world.acts[fx + ',' + fy] || world.bumps[fx + ',' + fy];
    if (a) say(a);
  }
  function heroPixel(now) {
    var px = hero.x * TILE, py = hero.y * TILE;
    if (hero.moving) {
      var k = Math.min(1, (now - hero.moving.t0) / hero.moving.d);
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
    var hp = heroPixel(now);
    var cx = Math.round(hp[0] + 8 - VW / 2), cy = Math.round(hp[1] + 8 - VH / 2);
    cx = world.W <= VW ? Math.round((world.W - VW) / 2) : Math.max(0, Math.min(world.W - VW, cx));
    cy = world.H <= VH ? Math.round((world.H - VH) / 2) : Math.max(0, Math.min(world.H - VH, cy));
    var dg = dyn.getContext('2d'), de = dynE.getContext('2d'), dl = dynL.getContext('2d');
    [dg, de, dl].forEach(function (x) { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, VW, VH); x.setTransform(1, 0, 0, 1, -cx, -cy); });
    var t = still ? 0 : now;
    world.live && world.live(dg, de, dl, t);
    drawHero(dg, de, Math.round(hp[0]) - 1, Math.round(hp[1]) + 15, hero.dir, hero.moving ? hero.frame : 0);
    var CW = cv.width, CH = cv.height;
    c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.globalAlpha = 1;
    c.fillStyle = '#08070A'; c.fillRect(0, 0, CW, CH);
    function blit(src) {
      var sx = Math.max(0, cx), sy = Math.max(0, cy), sw = Math.min(world.W, cx + VW) - sx, sh = Math.min(world.H, cy + VH) - sy;
      if (sw > 0 && sh > 0) c.drawImage(src, sx, sy, sw, sh, (sx - cx) * Z, (sy - cy) * Z, sw * Z, sh * Z);
    }
    c.imageSmoothingEnabled = false;
    blit(world.base); c.drawImage(dyn, 0, 0, CW, CH);
    c.imageSmoothingEnabled = true; c.globalCompositeOperation = 'lighter';
    blit(world.lite); c.drawImage(dynL, 0, 0, CW, CH);
    [[16, .5], [5, .45]].forEach(function (b) { c.filter = 'blur(' + b[0] + 'px)'; c.globalAlpha = b[1]; blit(world.emis); c.drawImage(dynE, 0, 0, CW, CH); });
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
    if (k === 'Shift') { run = true; return; }
    if (choosing && KEYS[k]) {
      ev.preventDefault();
      if (KEYS[k] === 'up' || KEYS[k] === 'left') choosing.i = (choosing.i + choosing.n - 1) % choosing.n;
      else choosing.i = (choosing.i + 1) % choosing.n;
      mark(); return;
    }
    if (KEYS[k]) { ev.preventDefault(); if (!dlg.hidden || (lock && ev.repeat)) return; lock = false; press(KEYS[k]); }
    else if (k === ' ' || k === 'Enter' || k === 'e') { ev.preventDefault(); if (!ev.repeat) action(); }
    else if (k === 'Escape' || k === 'x') close();
  });
  window.addEventListener('keyup', function (ev) {
    var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === 'Shift') run = false;
    if (KEYS[k]) release(KEYS[k]); lock = false;
  });
  window.addEventListener('blur', function () { held = []; run = false; });
  [].forEach.call(document.querySelectorAll('[data-dir]'), function (b) {
    var dir = b.getAttribute('data-dir');
    b.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); b.setPointerCapture && b.setPointerCapture(ev.pointerId);
      if (choosing) { choosing.i = (choosing.i + (dir === 'up' || dir === 'left' ? choosing.n - 1 : 1)) % choosing.n; mark(); return; }
      if (dlg.hidden) press(dir);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { b.addEventListener(n, function () { release(dir); }); });
  });
  document.getElementById('btn-a').addEventListener('click', action);
  // B closes what is open; held down, it runs.
  var btnB = document.getElementById('btn-b');
  btnB.addEventListener('pointerdown', function () { if (!dlg.hidden) close(); else run = true; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { btnB.addEventListener(n, function () { run = false; }); });
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg || ev.target === dlgText) close(); });

  cache.terminal = buildTerminal(); order.push('terminal');
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    enterWorld(cache.terminal, cache.terminal.start);
    requestAnimationFrame(frame);
  });
