/* ============================================================
   StickFight Arena — synthesized audio engine
   All SFX + per-arena MUSIC generated with WebAudio (zero assets):
   - reactive music sequencer (kick/snare/hats/bass/lead/pad)
   - 7 themes (menu + 6 arenas) with distinct styles/bpm
   - intensity layer when someone is nearly dead
   - crowd ambience + event stingers (KO, round end, fanfare)
   ============================================================ */
(function (root, factory) { if (typeof module !== 'undefined' && module.exports) module.exports = factory(); else root.SFAAudio = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  let ac = null, master, sfxBus, musicBus, noiseBuf, started = false, muted = false;

  function ensure() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.85; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.95; sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0.34; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  /* tone/noise with selectable bus */
  function env(g, t0, a, peak, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function tone(t0, freq, dur, peak, type = 'sine', slide = 0, bus = sfxBus, outGain = 1) {
    if (!ac) return null;
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    const g = ac.createGain(); g.gain.value = outGain; env(g, t0, 0.004, peak, dur);
    o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.1);
    return o;
  }
  function noise(t0, dur, peak, filterFreq, q = 1, type = 'bandpass', bus = sfxBus) {
    if (!ac) return null;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
    const g = ac.createGain(); env(g, t0, 0.004, peak, dur);
    src.connect(f); f.connect(g); g.connect(bus); src.start(t0); src.stop(t0 + dur + 0.1);
    return src;
  }

  /* ================= SFX ================= */
  const SFX = {
    light: () => { const t = ac.currentTime; noise(t, 0.12, 0.5, 900, 0.8); tone(t, 220, 0.08, 0.25, 'square', -120); },
    kick: () => { const t = ac.currentTime; noise(t, 0.14, 0.6, 700, 0.7); tone(t, 160, 0.1, 0.3, 'square', -90); },
    heavy: () => { const t = ac.currentTime; noise(t, 0.2, 0.8, 500, 0.6); tone(t, 120, 0.18, 0.45, 'sawtooth', -70); },
    blocked: () => { const t = ac.currentTime; tone(t, 1200, 0.09, 0.3, 'square'); tone(t + 0.02, 900, 0.12, 0.25, 'square', -200); },
    clang: () => { const t = ac.currentTime; tone(t, 1450, 0.16, 0.3, 'square', -60); tone(t + 0.01, 2150, 0.14, 0.2, 'square', -80); noise(t, 0.1, 0.2, 5000, 1, 'highpass'); },
    perfect: () => { const t = ac.currentTime; tone(t, 1600, 0.14, 0.35, 'sine', 600); tone(t + 0.1, 2000, 0.2, 0.3, 'sine', 400); },
    special: () => { const t = ac.currentTime; tone(t, 90, 0.4, 0.5, 'sawtooth', 320); noise(t, 0.35, 0.4, 2400, 2, 'highpass'); },
    ult: () => { const t = ac.currentTime; tone(t, 60, 0.7, 0.6, 'sawtooth', 220); tone(t + 0.1, 440, 0.5, 0.35, 'square', 660); noise(t, 0.6, 0.5, 3000, 1.5, 'highpass'); },
    grab: () => { const t = ac.currentTime; noise(t, 0.1, 0.4, 400, 1); tone(t, 300, 0.1, 0.25, 'triangle', -150); },
    throw: () => { const t = ac.currentTime; noise(t, 0.18, 0.6, 600, 0.7); tone(t, 200, 0.16, 0.4, 'square', -160); },
    jump: () => { const t = ac.currentTime; tone(t, 320, 0.12, 0.16, 'sine', 220); },
    dash: () => { const t = ac.currentTime; noise(t, 0.16, 0.3, 1800, 1.5, 'highpass'); },
    whoosh: () => { const t = ac.currentTime; noise(t, 0.22, 0.25, 500, 0.5, 'bandpass'); noise(t + 0.05, 0.2, 0.18, 2500, 1, 'highpass'); },
    ko: () => { const t = ac.currentTime; noise(t, 0.6, 0.9, 300, 0.5); tone(t, 90, 0.7, 0.6, 'sawtooth', -60); tone(t + 0.15, 50, 0.8, 0.5, 'sine', -30); },
    count: (n) => { const t = ac.currentTime; tone(t, n === 0 ? 880 : 440, n === 0 ? 0.5 : 0.18, 0.35, 'square'); },
    roundstart: () => { const t = ac.currentTime; tone(t, 110, 0.5, 0.5, 'sawtooth', 40); tone(t, 220, 0.4, 0.25, 'square', 60); noise(t, 0.3, 0.25, 900, 1); },
    fill: () => { const t = ac.currentTime; [0, 0.09, 0.18, 0.27].forEach((o, i) => noise(t + o, 0.08, 0.4 - i * 0.06, 1800, 1, 'bandpass')); },
    sting: () => { const t = ac.currentTime; tone(t, 330, 0.3, 0.4, 'sawtooth', -120); tone(t + 0.06, 262, 0.35, 0.35, 'sawtooth', -100); noise(t, 0.35, 0.35, 700, 0.7); },
    fanfare: () => { const t = ac.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(t + i * 0.13, f, 0.5, 0.32, 'square'); tone(t + i * 0.13, f / 2, 0.5, 0.2, 'sawtooth'); }); noise(t + 0.5, 0.5, 0.2, 5000, 1, 'highpass'); },
    lose: () => { const t = ac.currentTime; [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.16, f, 0.4, 0.28, 'sawtooth')); },
    combo: (n) => { const t = ac.currentTime; tone(t, 440 + Math.min(n, 12) * 70, 0.1, 0.25, 'square'); },
    lava: () => { const t = ac.currentTime; noise(t, 0.5, 0.6, 250, 0.8); tone(t, 100, 0.5, 0.4, 'sawtooth', -60); },
    wall: () => { const t = ac.currentTime; tone(t, 140, 0.15, 0.35, 'square', -60); },
    rage: () => { const t = ac.currentTime; tone(t, 70, 0.8, 0.5, 'sawtooth', 160); noise(t, 0.7, 0.4, 1200, 1, 'highpass'); },
    freeze: () => { const t = ac.currentTime; tone(t, 2000, 0.5, 0.25, 'sine', -900); },
    wave: () => { const t = ac.currentTime; noise(t, 0.3, 0.4, 1200, 1.2, 'highpass'); },
    emote: () => { const t = ac.currentTime; tone(t, 660, 0.12, 0.2, 'sine', 220); },
    taunt: () => { const t = ac.currentTime; tone(t, 500, 0.25, 0.2, 'triangle', 300); },
    lowtime: () => { const t = ac.currentTime; [0, 0.25].forEach(o => tone(t + o, 880, 0.12, 0.25, 'square')); },
    menuclick: () => { const t = ac.currentTime; tone(t, 700, 0.06, 0.15, 'sine', 200); },
    select: () => { const t = ac.currentTime; tone(t, 880, 0.08, 0.18, 'sine', 220); tone(t + 0.06, 1175, 0.1, 0.16, 'sine', 160); },
    lock: () => { const t = ac.currentTime; tone(t, 660, 0.09, 0.2, 'square', 0); tone(t + 0.09, 990, 0.14, 0.22, 'square', 0); noise(t + 0.05, 0.08, 0.15, 3200, 1, 'highpass'); },
    deny: () => { const t = ac.currentTime; tone(t, 220, 0.18, 0.22, 'square', -60); tone(t + 0.12, 180, 0.22, 0.2, 'square', -40); },
    slam: () => { const t = ac.currentTime; noise(t, 0.3, 0.8, 300, 0.6); tone(t, 80, 0.3, 0.5, 'sine', -30); },
  };

  /* ================= MUSIC ENGINE ================= */
  const DEG = [0, 2, 3, 5, 7, 8, 10, 12]; // minor scale semitone offsets
  const ROOTS = { Am: 57, Em: 52, Fm: 53, Cm: 48, Dm: 50, Gm: 55 };
  const THEMES = {
    menu:    { bpm: 108, key: 'Am', style: 'cinematic' },
    city:    { bpm: 98,  key: 'Am', style: 'hiphop' },
    dojo:    { bpm: 92,  key: 'Em', style: 'taiko' },
    volcano: { bpm: 142, key: 'Fm', style: 'metal' },
    space:   { bpm: 104, key: 'Cm', style: 'ambient' },
    alley:   { bpm: 90,  key: 'Dm', style: 'boombap' },
    club:    { bpm: 126, key: 'Gm', style: 'edm' },
  };
  const STYLES = {
    hiphop: { kick: [0, 4, 8, 10, 12], snare: [4, 12], hat: '8th', bass: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 5, 0, 7, 0], lead: [0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 5, 0, 3, 0, 0, 0] },
    taiko:  { kick: [0, 4, 6, 8, 12, 14], snare: [], tom: [4, 12], hat: '16th-low', bass: [0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 5, 0, 3, 0], lead: [0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 8, 0, 7, 0, 5, 0] },
    metal:  { kick: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], snare: [4, 12], hat: '16th', bass: [0, 0, 0, 0, 3, 3, 0, 0, 5, 5, 0, 0, 3, 3, 0, 0], lead: [0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 7, 0, 5, 0] },
    ambient:{ kick: [], snare: [], hat: 'sparse', bass: [0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0], lead: [8, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0], pad: true },
    boombap:{ kick: [0, 4, 8, 12], snare: [4, 12], hat: 'swing', bass: [0, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 7, 0, 0, 0], lead: [0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 7, 0, 8, 0, 0, 0] },
    edm:    { kick: [0, 4, 8, 12], snare: [4, 12], hat: 'offbeat', bass: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0], lead: [10, 0, 0, 0, 8, 0, 0, 0, 7, 0, 0, 0, 8, 0, 0, 0] },
    cinematic:{ kick: [0, 8], snare: [], hat: 'sparse', bass: [0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0], lead: [12, 0, 10, 0, 8, 0, 10, 0, 7, 0, 5, 0, 3, 0, 0, 0], pad: true },
  };
  const mf = (root, deg, oct = 0) => 440 * Math.pow(2, (root + DEG[deg] + 12 * oct - 69) / 12);

  const music = {
    active: false, theme: null, style: null, step: 0, nextT: 0, timer: null,
    intensity: false, lastBar: 0,
    start(themeId) {
      if (!ensure() || muted) return;
      this.stop();
      this.theme = THEMES[themeId] || THEMES.city;
      this.style = STYLES[this.theme.style];
      this.step = 0; this.intensity = false;
      this.nextT = ac.currentTime + 0.08;
      this.timer = setInterval(() => this.schedule(), 40);
      this.active = true;
    },
    stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.active = false; },
    setIntensity(b) { this.intensity = !!b; },
    stepDur() { return 60 / this.theme.bpm / 2; },
    schedule() {
      if (!this.active || muted) return;
      while (this.nextT < ac.currentTime + 0.14) {
        this.playStep(this.step, this.nextT);
        this.step = (this.step + 1) % 16;
        this.nextT += this.stepDur();
      }
    },
    /* ---- instruments ---- */
    kick(t) {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      const g = ac.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.15);
      noise(t, 0.02, 0.25, 3000, 1, 'highpass', musicBus);
    },
    snare(t, vel = 0.8) {
      noise(t, 0.14, vel * 0.6, 1900, 0.9, 'bandpass', musicBus);
      tone(t, 210, 0.09, vel * 0.3, 'triangle', -40, musicBus);
    },
    hat(t, open = false) {
      noise(t, open ? 0.14 : 0.04, open ? 0.22 : 0.14, 7200, 1.2, 'highpass', musicBus);
    },
    tom(t, f = 130) {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.12);
      const g = ac.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.2);
    },
    bass(t, deg) {
      const f = mf(ROOTS[this.theme.key], deg);
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const l = ac.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = 320; l.Q.value = 4;
      const g = ac.createGain(); g.gain.setValueAtTime(0.34, t); g.gain.exponentialRampToValueAtTime(0.001, t + this.stepDur() * 0.95);
      o.connect(l); l.connect(g); g.connect(musicBus); o.start(t); o.stop(t + this.stepDur());
      if (this.intensity) tone(t, f * 2, this.stepDur() * 0.5, 0.1, 'square', 0, musicBus);
    },
    lead(t, deg, oct = 1) {
      const f = mf(ROOTS[this.theme.key], deg, oct);
      const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 1.005;
      const l = ac.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = 2600; l.Q.value = 6;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + this.stepDur() * 1.6);
      o.connect(l); o2.connect(l); l.connect(g); g.connect(musicBus); o.start(t); o2.start(t);
      o.stop(t + this.stepDur() * 1.7); o2.stop(t + this.stepDur() * 1.7);
      // echo
      tone(t + this.stepDur() * 0.5, f, this.stepDur() * 0.8, 0.05, 'square', 0, musicBus);
    },
    pad(t) {
      const root = ROOTS[this.theme.key];
      [0, 3, 5, 7].forEach((deg, i) => {
        const f = mf(root, deg, 0);
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const l = ac.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = 800;
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.055, t + this.stepDur() * 2); g.gain.exponentialRampToValueAtTime(0.001, t + this.stepDur() * 7.5);
        o.connect(l); l.connect(g); g.connect(musicBus); o.start(t); o.stop(t + this.stepDur() * 8);
      });
    },
    playStep(step, t) {
      const S = this.style;
      if (S.kick.includes(step)) this.kick(t);
      if (S.snare.includes(step)) this.snare(t, step === 12 ? 0.9 : 0.7);
      if (S.tom && S.tom.includes(step)) this.tom(t, step < 8 ? 110 : 150);
      // hats
      if (S.hat === '8th' && step % 2 === 1) this.hat(t, step % 8 === 6);
      if (S.hat === '16th' && (step % 2 === 1 || this.intensity)) this.hat(t, step % 8 === 7 && this.intensity);
      if (S.hat === '16th-low' && step % 2 === 1) this.hat(t, false);
      if (S.hat === 'offbeat' && step % 2 === 1) this.hat(t, step % 8 === 5);
      if (S.hat === 'swing' && step % 2 === 1) this.hat(t, step % 4 === 3);
      if (S.hat === 'sparse' && step % 4 === 2 && Math.random() < 0.5) this.hat(t, false);
      // bass + lead
      const bv = S.bass[step];
      if (bv) this.bass(t, bv);
      const lv = S.lead[step];
      if (lv && (this.intensity || step % 4 === 0 || Math.random() < 0.35)) this.lead(t, lv);
      // pad every 2 bars
      const bar = Math.floor(this.step / 16);
      if (S.pad && step === 0 && bar !== this.lastBar) { this.lastBar = bar; this.pad(t); }
    },
  };

  /* ================= CROWD ================= */
  let crowdTimer = null;
  function crowd(on, roar = false) {
    if (!ac || muted) return;
    if (on) {
      if (crowdTimer) return;
      if (roar) { // KO roar
        noise(ac.currentTime, 1.6, 0.5, 900, 0.8, 'bandpass', musicBus);
        noise(ac.currentTime, 1.0, 0.4, 2500, 1, 'highpass', musicBus);
      }
      const g = ac.createGain(); g.gain.value = 0.06;
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      src.connect(f); f.connect(g); g.connect(musicBus); src.start();
      crowdTimer = { src, g };
      const cheer = () => {
        if (!crowdTimer || muted) return;
        noise(ac.currentTime, 0.8, 0.14, 1300, 1, 'bandpass', musicBus);
        crowdTimer._t = setTimeout(cheer, 2500 + Math.random() * 5000);
      };
      crowdTimer._t = setTimeout(cheer, 2000);
    } else if (crowdTimer) {
      clearTimeout(crowdTimer._t);
      try { crowdTimer.src.stop(); } catch (e) {}
      crowdTimer = null;
    }
  }

  return {
    init() { ensure(); resume(); started = true; },
    play(name, arg) { if (!ensure() || muted) return; resume(); const fn = SFX[name]; if (fn) { try { fn(arg); } catch (e) {} } },
    setMuted(m) { muted = m; if (m) { music.stop(); crowd(false); } },
    music,
    crowd,
  };
});
