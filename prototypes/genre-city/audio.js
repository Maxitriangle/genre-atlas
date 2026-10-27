  /* =====================================================================
   * Sound. Every genre has a short loop composed by the code from its name,
   * the way its glyph is drawn from its data: a tempo, a drum pattern and a
   * bass line chosen by what the name says (techno, dub, ambient…), notes
   * drawn from the name itself. Nothing is downloaded and nothing plays
   * before the player turns the sound on.
   * The nearest genres play at once, louder as the hero gets closer, panned
   * to the side they stand on.
   * ===================================================================== */
  var audioCtx = null, master = null, noiseBuf = null, voices = {}, soundOn = false;
  var STYLES = [
    // words in the name           tempo     drums      what leads
    [/ambient|chill|new age|drone|kanky|space|illbient|lowercase|isolation/, [68, 86], 'none', 'pad'],
    [/drum and bass|jungle|liquid|neuro|breakcore|footwork|juke/, [166, 176], 'dnb', 'bass'],
    [/gabber|hardcore|hardstyle|terror|speedcore|frenchcore|hard dance|hardtek|tekno/, [150, 180], 'four', 'stab'],
    [/dubstep|brostep|riddim|grime|trap|bass|wonky|future/, [138, 142], 'half', 'bass'],
    [/trance|psy|goa|eurodance|hands up/, [134, 142], 'four', 'arp'],
    [/techno|electro|ebm|industrial|minimal/, [124, 134], 'four', 'stab'],
    [/house|disco|garage|club|funk|kuduro|baile/, [118, 126], 'four', 'chord'],
    [/break|big beat|idm|glitch|nu skool/, [128, 136], 'break', 'arp'],
    [/wave|synth|vapor|retro|outrun|8-bit|bit|chip|city pop|horror/, [92, 112], 'back', 'arp']
  ];
  function recipe(n) {
    var name = (n.name || '').toLowerCase(), h = hash(n.name || 'x'), R = rnd(h);
    var st = STYLES.filter(function (x) { return x[0].test(name); })[0] || [null, [96, 132], ['four', 'back', 'break', 'half'][h % 4], ['arp', 'bass', 'chord'][h % 3]];
    var bpm = Math.round(st[1][0] + R() * (st[1][1] - st[1][0]));
    var scales = [[0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 3, 5, 6, 7, 10], [0, 2, 3, 5, 7, 10]];
    var scale = scales[h % scales.length], root = 33 + (h >> 3) % 12;                          // the bass root, in MIDI
    var bass = [], lead = [];
    for (var i = 0; i < 16; i++) {
      bass.push(R() < (st[3] === 'bass' ? .55 : .35) ? scale[Math.floor(R() * 3)] + (R() < .2 ? 12 : 0) : null);
      lead.push(R() < (st[3] === 'arp' ? .75 : .3) ? scale[Math.floor(R() * scale.length)] + 12 * (1 + Math.floor(R() * 2)) : null);
    }
    bass[0] = 0;
    var prog = [[0, 0], [0, 8], [0, 5], [0, 10]][h % 4];
    return { bpm: bpm, drums: st[2], lead: st[3], root: root, scale: scale, bass: bass, notes: lead, prog: prog, bright: 600 + (h % 7) * 220 };
  }
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function startAudio() {
    if (audioCtx) return;
    var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    audioCtx = new Ctx();
    var comp = audioCtx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = audioCtx.createGain(); master.gain.value = 0; master.connect(comp); comp.connect(audioCtx.destination);
    noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(schedule, 25);
  }
  // A voice: one genre's loop, its own volume and place in the stereo field.
  function Voice(n, kind) {
    this.r = recipe(n); this.kind = kind === 'pad' ? 'pad' : 'full';
    if (kind === 'pad') { this.r.drums = 'none'; this.r.lead = 'pad'; this.r.bpm = Math.min(this.r.bpm, 90); }
    this.out = audioCtx.createGain(); this.out.gain.value = 0;
    this.pan = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    if (this.pan) { this.out.connect(this.pan); this.pan.connect(master); } else this.out.connect(master);
    this.step = 0; this.next = audioCtx.currentTime + .05; this.idle = 0;
  }
  Voice.prototype.stop = function () { var o = this.out; o.gain.setTargetAtTime(0, audioCtx.currentTime, .2); setTimeout(function () { o.disconnect(); }, 1500); };
  function env(t, a, d, peak) { var g = audioCtx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0008, t + a + d); return g; }
  Voice.prototype.play = function (t) {
    var r = this.r, s = this.step % 16, bar = Math.floor(this.step / 16) % 4, dur = 60 / r.bpm / 4, out = this.out, self = this;
    var root = r.root + r.prog[bar % 2 ? 1 : 0];
    function tone(type, f, a, d, peak, cut) {
      var o = audioCtx.createOscillator(), e = env(t, a, d, peak); o.type = type; o.frequency.setValueAtTime(f, t);
      if (cut) { var fl = audioCtx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut; o.connect(fl); fl.connect(e); } else o.connect(e);
      e.connect(out); o.start(t); o.stop(t + a + d + .05); return o;
    }
    function noise(hp, d, peak) {
      var src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), e = env(t, .001, d, peak);
      src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp; src.connect(f); f.connect(e); e.connect(out); src.start(t); src.stop(t + d + .05);
    }
    function kick() { var o = tone('sine', 140, .002, .28, .9); o.frequency.exponentialRampToValueAtTime(42, t + .14); }
    var dr = r.drums;
    if (dr === 'four') { if (s % 4 === 0) kick(); if (s % 4 === 2) noise(7000, .04, .18); if (s === 4 || s === 12) noise(1800, .12, .25); }
    else if (dr === 'half') { if (s === 0 || s === 10) kick(); if (s === 8) noise(1500, .2, .35); if (s % 2 === 1) noise(8000, .02, .1); }
    else if (dr === 'dnb') { if (s === 0 || s === 10) kick(); if (s === 4 || s === 12 || s === 15) noise(1600, .1, .3); if (s % 2 === 0) noise(8000, .02, .1); }
    else if (dr === 'break') { if (s === 0 || s === 7 || s === 10) kick(); if (s === 4 || s === 12) noise(1600, .12, .3); if (s % 2 === 0) noise(7500, .03, .12); }
    else if (dr === 'back') { if (s === 0 || s === 8) kick(); if (s === 4 || s === 12) noise(1700, .14, .28); if (s % 2 === 0) noise(9000, .02, .07); }
    var b = r.bass[s];
    if (b !== null) tone(r.lead === 'bass' ? 'square' : 'sawtooth', midi(root + b), .005, dur * 1.6, r.lead === 'bass' ? .32 : .22, r.lead === 'bass' ? 380 + 300 * Math.sin(this.step / 6) : 420);
    var l = r.notes[s];
    if (r.lead === 'arp' && l !== null) tone('square', midi(root + 12 + l), .004, dur * 1.2, .07, r.bright * 2);
    if (r.lead === 'stab' && l !== null && s % 4 === 3) [0, 3, 7].forEach(function (iv) { tone('sawtooth', midi(root + 24 + iv), .003, .12, .05, r.bright * 2); });
    if (r.lead === 'chord' && (s === 2 || s === 6 || s === 10 || s === 14)) [0, 3, 7, 10].forEach(function (iv) { tone('triangle', midi(root + 24 + iv), .01, .2, .05, 3000); });
    if ((r.lead === 'pad' || self.kind === 'pad') && s === 0) [0, 7, 12, 15].forEach(function (iv, k) {
      var o = tone('sawtooth', midi(root + 12 + iv), dur * 6, dur * 14, .05, 900); o.detune.value = (k % 2 ? 7 : -7);
    });
    if (r.lead === 'pad' && l !== null && s % 4 === 0) tone('sine', midi(root + 24 + l), .05, dur * 5, .06);
    this.step++;
  };
  function schedule() {
    if (!audioCtx) return;
    var horizon = audioCtx.currentTime + .12;
    Object.keys(voices).forEach(function (k) { var v = voices[k]; while (v.next < horizon) { v.play(v.next); v.next += 60 / v.r.bpm / 4; } });
  }
  // Each frame: who is near, and how loud. Three voices at most, plus the room's own.
  function listen(w, hx, hy) {
    if (!audioCtx || !soundOn) return;
    var want = [];
    (w.sounds || []).forEach(function (src) {
      var d = Math.hypot(src.x - hx, src.y - hy) / TILE, k = Math.max(0, 1 - d / src.r);
      if (k > 0) want.push({ key: src.key, n: src.n, kind: src.kind, gain: k * k * src.max, pan: Math.max(-1, Math.min(1, (src.x - hx) / (TILE * 7))) });
    });
    want.sort(function (a, b) { return b.gain - a.gain; });
    want = want.filter(function (x, i) { return i < 3 || x.kind === 'room'; });
    var keep = {};
    want.forEach(function (x) {
      keep[x.key] = true;
      var v = voices[x.key] || (voices[x.key] = new Voice(x.n, x.kind));
      v.out.gain.setTargetAtTime(x.gain * .55, audioCtx.currentTime, .25);
      if (v.pan) v.pan.pan.setTargetAtTime(x.pan, audioCtx.currentTime, .2);
    });
    Object.keys(voices).forEach(function (k) { if (!keep[k]) { voices[k].stop(); delete voices[k]; } });
  }
  function hush() { Object.keys(voices).forEach(function (k) { voices[k].stop(); delete voices[k]; }); }
  function setSound(on) {
    soundOn = on;
    if (on) { startAudio(); if (!audioCtx) return; audioCtx.resume && audioCtx.resume(); master.gain.setTargetAtTime(.9, audioCtx.currentTime, .1); }
    else if (audioCtx) { master.gain.setTargetAtTime(0, audioCtx.currentTime, .1); hush(); }
    var b = document.getElementById('btn-sound');
    b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '♪ SOUND ON' : '♪ SOUND OFF';
  }
  // Where the sound comes from, registered by the places.
  World.prototype.sound = function (x, y, n, r, max, kind) { (this.sounds = this.sounds || []).push({ x: x, y: y, n: n, r: r, max: max, kind: kind || 'full', key: (kind || 'full') + ':' + n.id + ':' + Math.round(x) + ',' + Math.round(y) }); };
