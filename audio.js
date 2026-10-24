// Procedural Web Audio: ambience beds, positional sources and surface footsteps.
export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, ambience: 0.7, sfx: 0.8 };
    this.beds = {};
    this.positional = [];
    this.timers = [];
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    // shared noise buffers
    const len = ctx.sampleRate * 4;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.applyVolume();
    if (this.pending) { this.setAmbience(this.pending.profile, this.pending.sources); this.pending = null; }
    if (this.pendingStreams) { this.setStreams(this.pendingStreams); this.pendingStreams = null; }
    if (this.pendingCrackle) { const [p, f] = this.pendingCrackle; this.pendingCrackle = null; this.crackle(p, f); }
  }

  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.1);
    this.amb.gain.setTargetAtTime(this.vol.ambience, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.1);
  }

  noise(buf = this.white) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.loopStart = Math.random() * 3; s.start(0, Math.random() * 3);
    return s;
  }
  filt(type, freq, Q = 0.7) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; }
  lfo(freq, depth, target, offset = 0) {
    const o = this.ctx.createOscillator(); o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(target); o.start();
    if (offset) target.value = offset;
    return o;
  }

  /* ---------- ambience beds ---------- */
  makeBed(kind) {
    const ctx = this.ctx, out = ctx.createGain(); out.gain.value = 0;
    const nodes = [];
    const chainTo = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); nodes.push(...n); };
    if (kind === 'rain') {
      const n1 = this.noise(), hp = this.filt('highpass', 500), lp = this.filt('lowpass', 7000), g1 = ctx.createGain(); g1.gain.value = 0.22;
      chainTo(n1, hp, lp, g1, out);
      const n2 = this.noise(this.brown), lp2 = this.filt('lowpass', 500), g2 = ctx.createGain(); g2.gain.value = 0.5;
      chainTo(n2, lp2, g2, out);
      const drip = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.setValueAtTime(1800 + Math.random() * 2600, t + i * 0.03);
          o.frequency.exponentialRampToValueAtTime(600, t + i * 0.03 + 0.04);
          g.gain.setValueAtTime(0.0001, t + i * 0.03); g.gain.exponentialRampToValueAtTime(0.03 * Math.random() + 0.005, t + i * 0.03 + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.03 + 0.05);
          o.connect(g); g.connect(out); o.start(t + i * 0.03); o.stop(t + i * 0.03 + 0.06);
        }
      };
      this.timers.push(setInterval(drip, 140));
    } else if (kind === 'wind') {
      const n = this.noise(), bp = this.filt('bandpass', 380, 0.5), g = ctx.createGain(); g.gain.value = 0.35;
      chainTo(n, bp, g, out);
      nodes.push(this.lfo(0.07, 220, bp.frequency, 380), this.lfo(0.11, 0.18, g.gain, 0.3));
    } else if (kind === 'river') {
      const n = this.noise(), lp = this.filt('lowpass', 900), bp = this.filt('bandpass', 1600, 1.2), g = ctx.createGain(); g.gain.value = 0.3;
      chainTo(n, lp, g, out);
      const n2 = this.noise(), g2 = ctx.createGain(); g2.gain.value = 0.08;
      chainTo(n2, bp, g2, out);
      nodes.push(this.lfo(3.3, 500, bp.frequency, 1600), this.lfo(0.21, 0.04, g2.gain, 0.08));
    } else if (kind === 'lake') {
      const n = this.noise(this.brown), lp = this.filt('lowpass', 420), g = ctx.createGain(); g.gain.value = 0.4;
      chainTo(n, lp, g, out);
      nodes.push(this.lfo(0.16, 0.3, g.gain, 0.4));
    } else if (kind === 'night') {
      // crickets + occasional frog
      const chirp = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime, f = 4200 + Math.random() * 600;
        const pulses = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < pulses; i++) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = f;
          const st = t + i * 0.06;
          g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.012, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.045);
          o.connect(g); g.connect(out); o.start(st); o.stop(st + 0.05);
        }
        if (Math.random() < 0.08) {
          const o = ctx.createOscillator(), lp = this.filt('lowpass', 500), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
        }
      };
      this.timers.push(setInterval(chirp, 380));
    } else if (kind === 'windowrain') {
      // rain heard through glass: muffled patter plus the odd drop on the pane
      // brown noise, heavily muffled: a soft wash behind the glass, never a hiss
      const n1 = this.noise(this.brown), lp = this.filt('lowpass', 520, 0.5), hp = this.filt('highpass', 90), g1 = ctx.createGain(); g1.gain.value = 0.22;
      chainTo(n1, hp, lp, g1, out);
      nodes.push(this.lfo(0.07, 0.04, g1.gain, 0.22));
      const tap = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(2400 + Math.random() * 2400, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.008 + Math.random() * 0.01, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.04);
      };
      this.timers.push(setInterval(() => { if (Math.random() < 0.25) tap(); }, 140));
    } else if (kind === 'leafdrip') {
      // fat drops falling from the canopy onto big leaves and puddles, close and irregular
      const plop = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner();
        const f0 = 500 + Math.random() * 900;
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 2.2 : 0.5), t + 0.05);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.05, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        pan.pan.value = Math.random() * 2 - 1;
        o.connect(g); g.connect(pan); pan.connect(out); o.start(t); o.stop(t + 0.1);
      };
      this.timers.push(setInterval(() => { if (Math.random() < 0.45) plop(); }, 120));
    } else if (kind === 'city') {
      const n = this.noise(this.brown), lp = this.filt('lowpass', 160), g = ctx.createGain(); g.gain.value = 0.6;
      chainTo(n, lp, g, out);
    } else if (kind === 'hush') {
      const n = this.noise(this.brown), lp = this.filt('lowpass', 260), g = ctx.createGain(); g.gain.value = 0.35;
      chainTo(n, lp, g, out);
      nodes.push(this.lfo(0.05, 0.12, g.gain, 0.35));
    } else if (kind === 'glass') {
      const tick = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = 2500 + Math.random() * 3500;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.015, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.04);
      };
      this.timers.push(setInterval(tick, 45));
    }
    out.connect(this.amb);
    return { out, nodes };
  }

  setAmbience(profile, sources = []) {
    if (!this.ctx) { this.pending = { profile, sources }; return; }
    const t = this.ctx.currentTime;
    // fade out old
    const old = this.beds; this.beds = {};
    for (const k in old) old[k].out.gain.setTargetAtTime(0, t, 0.8);
    const oldTimers = this.timers; this.timers = [];
    const oldPos = this.positional; this.positional = [];
    setTimeout(() => {
      oldTimers.forEach(clearInterval);
      for (const k in old) old[k].nodes.forEach((n) => { try { n.stop && n.stop(); } catch (e) { } n.disconnect(); });
      oldPos.forEach((p) => { try { p.src.stop(); } catch (e) { } p.panner.disconnect(); });
    }, 4000);
    for (const k in profile) {
      const bed = this.makeBed(k);
      bed.out.gain.setTargetAtTime(profile[k], t + 0.3, 1.2);
      this.beds[k] = bed;
    }
    for (const s of sources) this.addSource(s);
  }

  addSource(s) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = s.ref ?? 1.5; p.rolloffFactor = 1.4; p.maxDistance = 60;
    p.positionX.value = s.pos.x; p.positionY.value = s.pos.y; p.positionZ.value = s.pos.z;
    const g = ctx.createGain(); g.gain.value = 0;
    let src;
    if (s.type === 'hum') {
      src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = 120;
      const lp = this.filt('lowpass', 300); src.connect(lp); lp.connect(g);
      g.gain.setTargetAtTime(0.012, ctx.currentTime + 0.5, 1);
    } else if (s.type === 'fire') {
      src = this.noise(); const bp = this.filt('bandpass', 900, 0.8); src.connect(bp); bp.connect(g);
      this.lfo(7, 0.05, g.gain, 0.06);
    } else if (s.type === 'stream') {
      src = this.noise(); const bp = this.filt('bandpass', 1400, 0.9); src.connect(bp); bp.connect(g);
      g.gain.setTargetAtTime(0.25, ctx.currentTime + 0.5, 1);
    } else if (s.type === 'tick') {
      // pendulum clock: tick / tock with a wooden case resonance
      src = ctx.createConstantSource(); src.offset.value = 0; src.connect(g);
      g.gain.value = 1;
      let tock = false;
      const beat = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime;
        const b = ctx.createBufferSource(); b.buffer = this.white;
        const bp = this.filt('bandpass', tock ? 1900 : 2500, 9), e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.09, t + 0.001); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        b.connect(bp); bp.connect(e); e.connect(p); b.start(t, Math.random() * 3); b.stop(t + 0.06);
        tock = !tock;
      };
      this.timers.push(setInterval(beat, 1000));
    } else if (s.type === 'drip') {
      src = ctx.createConstantSource(); src.offset.value = 0;
      const tick = () => {
        if (!this.ctx) return;
        const t = ctx.currentTime, o = ctx.createOscillator(), gg = ctx.createGain();
        o.frequency.setValueAtTime(900 + Math.random() * 500, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.08);
        gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.2, t + 0.004); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(gg); gg.connect(p); o.start(t); o.stop(t + 0.13);
      };
      this.timers.push(setInterval(tick, 300 + Math.random() * 500));
      src.connect(g);
    }
    if (!(src instanceof AudioBufferSourceNode)) src.start();
    g.connect(p); p.connect(this.amb);
    this.positional.push({ src, panner: p });
  }

  /* ---------- recorded loops, streamed and crossfaded so the seam never shows ----------
     Two <audio> players take turns: shortly before one ends, the other starts from the top
     and an equal-power crossfade hands over. Nothing is decoded up front, so a 13-minute
     file costs no memory and starts playing within a second. */
  setStreams(list = []) {
    if (!this.ctx) { this.pendingStreams = list; return; }
    const old = this.streams || [];
    const t = this.ctx.currentTime;
    old.forEach((s) => { s.bus.gain.setTargetAtTime(0, t, 0.8); clearInterval(s.timer); setTimeout(() => s.players.forEach((p) => { p.el.pause(); p.el.removeAttribute('src'); p.el.load(); }), 4000); });
    this.streams = list.map((d) => this.makeStream(d)).filter(Boolean);
  }

  makeStream({ url, gain = 0.8, pos = null, ref = 2, rolloff = 0.9, xfade = 9, onFail = null }) {
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0;
    let out = this.amb;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 80;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      p.connect(this.amb); out = p;
    }
    bus.connect(out);
    const players = [0, 1].map(() => {
      const el = new window.Audio();
      el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.src = url;
      const src = ctx.createMediaElementSource(el);
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(bus);
      return { el, g };
    });
    let cur = 0, fading = false, failed = false;
    const curve = (up) => { const n = 64, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = up ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2); } return c; };
    const fail = () => { if (failed) return; failed = true; if (onFail) onFail(); };
    players.forEach((p) => p.el.addEventListener('error', fail));
    const A = players[0];
    A.el.addEventListener('loadedmetadata', () => {
      // begin somewhere random so every visit sounds different
      try { A.el.currentTime = Math.random() * Math.max(0, A.el.duration - xfade * 3); } catch (e) { }
      A.el.play().catch(() => { });
      A.g.gain.setValueAtTime(1, ctx.currentTime);
    }, { once: true });
    bus.gain.setTargetAtTime(gain, ctx.currentTime + 0.3, 1.5);
    const timer = setInterval(() => {
      const P = players[cur], N = players[1 - cur];
      if (!P.el.duration || fading) return;
      if (P.el.duration - P.el.currentTime <= xfade) {
        fading = true;
        try { N.el.currentTime = 0; } catch (e) { }
        N.el.play().catch(() => { });
        const t0 = ctx.currentTime + 0.05;
        N.g.gain.cancelScheduledValues(t0); P.g.gain.cancelScheduledValues(t0);
        N.g.gain.setValueCurveAtTime(curve(true), t0, xfade - 0.5);
        P.g.gain.setValueCurveAtTime(curve(false), t0, xfade - 0.5);
        setTimeout(() => { P.el.pause(); cur = 1 - cur; fading = false; }, xfade * 1000);
      }
    }, 200);
    return { bus, players, timer };
  }

  /** add one procedural bed on top of the current ambience (used when a stream can't load) */
  addBed(kind, gain = 0.6) {
    if (!this.ctx || this.beds[kind]) return;
    const bed = this.makeBed(kind);
    bed.out.gain.setTargetAtTime(gain, this.ctx.currentTime + 0.2, 1.2);
    this.beds[kind] = bed;
  }

  /** random wood pops & snaps from the fire; calls onPop(k) so the visuals spark in sync */
  crackle(pos, onPop) {
    if (!this.ctx) { this.pendingCrackle = [pos, onPop]; return; }
    this.stopCrackle();
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.refDistance = 2; p.rolloffFactor = 0.9;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    const g = ctx.createGain(); g.gain.value = 0.45; g.connect(p); p.connect(this.amb);
    const snap = (k, delay = 0) => {
      const t = ctx.currentTime + delay;
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const hp = this.filt('highpass', 900 + Math.random() * 1800), bp = this.filt('peaking', 2500 + Math.random() * 2500, 1.2);
      const e = ctx.createGain();
      const d = 0.012 + Math.random() * 0.05;
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.35 * k, t + 0.0015); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(hp); hp.connect(bp); bp.connect(e); e.connect(g);
      s.start(t, Math.random() * 3); s.stop(t + d + 0.02);
      if (k > 0.6) { // a heavier crack also has body
        const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(180 + Math.random() * 120, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.12 * k, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.1);
      }
    };
    const loop = () => {
      if (!this.ctx || this.crackleStop) return;
      const r = Math.random();
      if (r < 0.12) { // a big pop with a little cluster after it
        snap(1); onPop && onPop(1);
        for (let i = 1; i < 2 + Math.random() * 4; i++) snap(0.2 + Math.random() * 0.3, i * (0.03 + Math.random() * 0.12));
      } else if (r < 0.55) { snap(0.25 + Math.random() * 0.4); if (Math.random() < 0.3) onPop && onPop(0.3); }
      else snap(0.08 + Math.random() * 0.15);
      this.crackleT = setTimeout(loop, 250 + Math.random() * Math.random() * 3800);
    };
    this.crackleStop = false;
    loop();
    this.crackleNode = g;
  }
  stopCrackle() { this.pendingCrackle = null; this.crackleStop = true; if (!this.ctx) return; clearTimeout(this.crackleT); if (this.crackleNode) { this.crackleNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5); this.crackleNode = null; } }

  listener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.05); L.positionY.setTargetAtTime(cam.position.y, t, 0.05); L.positionZ.setTargetAtTime(cam.position.z, t, 0.05);
      L.forwardX.setTargetAtTime(f.x, t, 0.05); L.forwardY.setTargetAtTime(f.y, t, 0.05); L.forwardZ.setTargetAtTime(f.z, t, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  /* ---------- one-shots ---------- */
  burst({ type = 'bandpass', freq = 1500, Q = 1, dur = 0.08, gain = 0.3, attack = 0.004, delay = 0, buf } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = buf || this.white;
    const f = this.filt(type, freq, Q), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 3); s.stop(t + dur + 0.02);
  }
  thump(freq = 110, dur = 0.08, gain = 0.3, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }

  footstep(surface, k = 1) {
    if (!this.ctx) return;
    const r = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'asphalt': case 'stone':
        this.burst({ freq: 2200 * r, Q: 0.9, dur: 0.06, gain: 0.16 * k });
        this.thump(95 * r, 0.06, 0.25 * k);
        if (surface === 'asphalt' || this.wet) this.burst({ type: 'highpass', freq: 3800, dur: 0.12, gain: 0.07 * k, delay: 0.01 });
        break;
      case 'wood':
        this.thump(150 * r, 0.1, 0.35 * k);
        this.burst({ freq: 300 * r, Q: 6, dur: 0.14, gain: 0.25 * k });
        this.burst({ freq: 1800, Q: 1, dur: 0.03, gain: 0.08 * k });
        break;
      case 'snow':
        for (let i = 0; i < 6; i++) this.burst({ freq: (2500 + Math.random() * 3000), Q: 2, dur: 0.03, gain: 0.08 * k, delay: i * 0.018 });
        this.burst({ type: 'lowpass', freq: 600, dur: 0.16, gain: 0.12 * k });
        break;
      case 'water':
        this.burst({ freq: 1100 * r, Q: 0.7, dur: 0.24, gain: 0.25 * k, attack: 0.02 });
        this.burst({ type: 'lowpass', freq: 400, dur: 0.3, gain: 0.18 * k, delay: 0.03 });
        break;
      case 'leaves':
        this.burst({ type: 'highpass', freq: 2200, dur: 0.15, gain: 0.08 * k, attack: 0.02 });
        this.burst({ type: 'lowpass', freq: 700, dur: 0.1, gain: 0.12 * k });
        break;
      case 'metal':
        this.thump(220, 0.15, 0.2 * k); this.burst({ freq: 3200, Q: 8, dur: 0.2, gain: 0.08 * k });
        break;
      case 'mud':
        this.burst({ type: 'lowpass', freq: 500, dur: 0.18, gain: 0.22 * k, attack: 0.02 });
        this.burst({ freq: 1400, Q: 3, dur: 0.06, gain: 0.05 * k, delay: 0.08 });
        break;
      default: // dirt / moss
        this.burst({ type: 'lowpass', freq: 850 * r, dur: 0.09, gain: 0.2 * k });
        this.burst({ type: 'highpass', freq: 2500, dur: 0.05, gain: 0.03 * k });
    }
  }
  land(surface, k) { this.footstep(surface, Math.min(2, 1 + k)); }
  grip() { if (this.ctx) { this.burst({ type: 'lowpass', freq: 900, dur: 0.12, gain: 0.18 }); } }
  click(on = true) {
    if (!this.ctx) return;
    this.burst({ freq: on ? 3000 : 2200, Q: 4, dur: 0.035, gain: 0.25 });
    this.thump(on ? 400 : 300, 0.03, 0.1);
  }
  ui() { if (this.ctx) this.burst({ freq: 4200, Q: 6, dur: 0.025, gain: 0.05 }); }
  whoosh() { if (this.ctx) this.burst({ type: 'bandpass', freq: 600, Q: 0.6, dur: 1.4, gain: 0.25, attack: 0.6, buf: this.brown }); }
}
