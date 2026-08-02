/* ============================================================
   STICKFIGHT ARENA — authoritative game simulation
   Pure JS (no deps). Runs on the server; also loadable in the
   browser for the landing-page demo / previews.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const CFG = require('./config.js');
    module.exports = factory(CFG);
  } else {
    root.SFASim = factory(root.SFA);
  }
})(typeof self !== 'undefined' ? self : this, function (CFG) {
  'use strict';

  const W = 1600, FLOOR_Y = 900, GRAV = 2500;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  /* ---------------- Fighter ---------------- */
  class Fighter {
    constructor(p, charId) {
      const c = CFG.CHAR[charId];
      this.p = p;                       // slot 0 / 1
      this.char = charId;
      this.name = p === 0 ? 'P1' : 'P2';
      this.x = W * (p === 0 ? 0.25 : 0.75);
      this.y = FLOOR_Y - 70;            // feet-ish anchor (feet at y+halfH)
      this.halfH = 62;                  // half height (standing)
      this.vx = 0; this.vy = 0;
      this.face = p === 0 ? 1 : -1;
      this.onGround = true;
      this.hp = 100; this.meter = 1.0;  // start each round with 1 bar
      this.st = 'idle'; this.stT = 0;   // state + time in state
      this.move = null;                 // current attack move
      this.chainT = 0;                  // attack chain window
      this.combo = 0; this.comboT = 0;
      this.invulnT = 0;
      this.dashCd = 0; this.grabCd = 0; this.rageCd = 0;
      this.blockT = 0;                  // time since block entered (perfect window)
      this.blocking = false;
      this.charge = 0;                  // RB charge
      this.poisonT = 0; this.poisonDps = 0;
      this.freezeT = 0;
      this.berserkT = 0; this.rageT = 0;
      this.possessT = 0;
      this.vanishT = 0; this.phaseT = 0;
      this.airJump = false; this.airDash = false;
      this.hurtTaken = 0;               // per-round, for PERFECT
      this.roundsWon = 0;
      this.koT = 0;                     // time in ko state
      this.tauntT = 0;
      this.ultFx = null;                // active ultimate fx {kind, t, dur, ...}
      this.poseT = 0;                   // global anim clock
      this.stats = { dmg: 0, hits: 0, bestCombo: 0 };
    }
    get c() { return CFG.CHAR[this.char]; }
    get halfW() { return this.st === 'crouch' ? 20 : 22; }
    get curHalfH() { return this.st === 'crouch' ? 44 : this.halfH; }
    get feet() { return this.y + this.curHalfH; }
    get headY() { return this.y - this.curHalfH; }
    get air() { return !this.onGround; }
    get invuln() { return this.invulnT > 0 || this.vanishT > 0 || this.phaseT > 0; }
    get speedMult() {
      let m = 1;
      if (this.berserkT > 0) m *= 1.12;
      if (this.rageT > 0) m *= 1.2;
      if (this.phaseT > 0) m *= 1.5;
      if (this.st === 'dash' || this.st === 'slide') m *= 3.0;
      return m;
    }
    get dmgMult() {
      let m = this.c.power;
      if (this.berserkT > 0) m *= 2;
      if (this.rageT > 0) m *= 1.25;
      return m;
    }
  }

  /* ---------------- Arena layout ---------------- */
  class Arena {
    constructor(id) {
      const a = CFG.ARENA[id];
      this.id = id; this.cfg = a;
      this.plats = (a.platforms || []).map(pl => ({
        cx: pl.x * W, cy: pl.y * FLOOR_Y, hw: (pl.w * W) / 2,
        move: pl.move || 0, t: rand(0, 6.28),
      }));
      this.lavaY = a.lava ? FLOOR_Y + 90 : null;
      this.gravity = GRAV * a.gravity;
      this.bounce = !!a.bounce;
    }
    tick(dt) {
      for (const pl of this.plats) if (pl.move) { pl.t += dt * 1.2; pl.cx = clamp(pl.cx + Math.sin(pl.t) * pl.move * 60 * dt, pl.hw + 40, W - pl.hw - 40); }
    }
    platformBelow(f) {
      // returns landing platform top y if fighter will cross it this frame
      for (const pl of this.plats) {
        const top = pl.cy - 9;
        if (f.vx !== 0 && f.vy > 0) {
          const prevFeet = f.feet - f.vy * 1 / 60; // approx
          if (prevFeet <= top + 2 && f.feet >= top && Math.abs(f.x - pl.cx) < pl.hw + f.halfW) return top;
        }
      }
      return null;
    }
  }

  /* ---------------- The Simulation ---------------- */
  class Sim {
    constructor(arenaId, c1, c2, opts = {}) {
      this.arena = new Arena(arenaId);
      this.f = [new Fighter(0, c1), new Fighter(1, c2)];
      this.tickNo = 0; this.time = 0;
      this.status = 'countdown';        // countdown | fight | roundend | result
      this.countdown = 3.4;
      this.round = 1;
      this.roundSeconds = opts.roundSeconds || 90;
      this.timer = this.roundSeconds;
      this.paused = false;
      this.inputs = [{ ax: 0, ay: 0, held: {} }, { ax: 0, ay: 0, held: {} }];
      this.actions = [[], []];
      this.projectiles = [];
      this.events = [];
      this.result = null;
      this.slowmo = 0;                  // slow-mo timer on KO
      this.spinFx = [];                 // spin attacks for renderer
      this.vs = opts.vs || 'P1 vs P2';
      this.onEvent = opts.onEvent || null;
    }

    /* ---------------- input API (server) ---------------- */
    setInputs(slot, { ax, ay, held }) {
      const i = this.inputs[slot];
      i.ax = clamp(ax, -1, 1); i.ay = clamp(ay, -1, 1);
      i.held = held || {};
    }
    queueAction(slot, name, data) { this.actions[slot].push({ name, data, t: this.time }); }
    emit(kind, data) { this.events.push({ kind, data, t: this.time }); }

    /* ---------------- main tick ---------------- */
    tick(dt) {
      dt = Math.min(dt, 1 / 30);
      this.tickNo++; this.time += dt;
      const [f0, f1] = this.f;

      if (this.paused) { return; }

      // --- round / match flow ---
      if (this.status === 'countdown') {
        this.countdown -= dt;
        for (const f of this.f) { f.st = 'idle'; f.stT = 0; f.poseT += dt; }
        const prev = this.countdown + dt;
        if (Math.ceil(this.countdown) !== Math.ceil(prev) && this.countdown > 0) this.emit('count', { n: Math.ceil(this.countdown) });
        if (this.countdown <= 0) { this.status = 'fight'; this.emit('fight', {}); }
        return;
      }

      if (this.status === 'roundend' || this.status === 'result') {
        this.slowmo = Math.max(0, this.slowmo - dt);
        // ragdoll-ish: ko'd fighter slides
        this.stepPhysics(f0, dt, false); this.stepPhysics(f1, dt, false);
        for (const f of this.f) { f.poseT += dt; if (f.st === 'ko') f.koT += dt; }
        return;
      }

      if (this.status !== 'fight') return;

      // --- fight time ---
      this.timer -= dt;
      this.arena.tick(dt);
      if (this.slowmo > 0) this.slowmo -= dt;
      const sdt = this.slowmo > 0 ? dt * 0.35 : dt;

      for (const f of this.f) {
        f.poseT += sdt;
        f.comboT = Math.max(0, f.comboT - sdt);
        f.invulnT = Math.max(0, f.invulnT - sdt);
        f.dashCd = Math.max(0, f.dashCd - sdt);
        f.grabCd = Math.max(0, f.grabCd - sdt);
        f.rageCd = Math.max(0, f.rageCd - sdt);
        f.chainT = Math.max(0, f.chainT - sdt);
        f.rageT = Math.max(0, f.rageT - sdt);
        f.berserkT = Math.max(0, f.berserkT - sdt);
        f.possessT = Math.max(0, f.possessT - sdt);
        f.phaseT = Math.max(0, f.phaseT - sdt);
        f.vanishT = Math.max(0, f.vanishT - sdt);
        if (f.phaseT === 0 && f.st === 'phase') this.endPhase(f);
        if (f.poisonT > 0) {
          f.poisonT -= sdt;
          f.hp = Math.max(0.1, f.hp - f.poisonDps * sdt);
          if (Math.floor(f.poisonT * 2) !== Math.floor((f.poisonT + sdt) * 2)) this.emit('hit', { x: f.x + rand(-20, 20), y: f.y, power: 0.3, kind: 'poison', p: f.p, target: f.p });
        }
        if (f.st === 'freeze') { f.freezeT -= sdt; if (f.freezeT <= 0) { f.st = 'idle'; } }
        if (f.st === 'ko') { f.koT += sdt; }
        // ult fx
        if (f.ultFx) { this.stepUlt(f, sdt); }
      }

      // --- process queued actions ---
      for (let p = 0; p < 2; p++) {
        const f = this.f[p];
        if (f.st === 'freeze' || f.st === 'ko' || f.st === 'grabbed') continue;
        for (const a of this.actions[p].splice(0)) this.applyAction(f, a);
      }

      // --- physics + states ---
      this.stepPhysics(f0, sdt); this.stepPhysics(f1, sdt);

      // --- combat resolution ---
      this.resolveAttacks(f0, f1);
      this.resolveAttacks(f1, f0);
      this.resolveProjectiles();
      this.resolveGrabState();

      // --- out of arena (lava / falls) ---
      for (const f of this.f) {
        if (this.arena.lavaY !== null && f.feet > this.arena.lavaY && this.status === 'fight') {
          this.emit('lava', { x: f.x, y: this.arena.lavaY, p: f.p });
          this.damage(f, this.f[1 - f.p], { dmg: 30, kb: 0, launch: 0, kind: 'lava', shake: 2.5, sfx: 'lava' }, true);
          f.x = W * (f.p === 0 ? 0.25 : 0.75); f.y = FLOOR_Y - 70; f.vx = 0; f.vy = 0;
          f.invulnT = 1.2; f.onGround = true; f.st = 'idle';
        }
      }

      // --- timer up (ties go to P1 — casual rule, no infinite draws) ---
      if (this.timer <= 0) this.endRound(f0.hp >= f1.hp ? 0 : 1, 'TIME');

      // --- KO check ---
      for (const f of this.f) if (f.hp <= 0 && f.st !== 'ko') this.doKO(f);
    }

    /* ---------------- actions ---------------- */
    applyAction(f, a) {
      const e = this.f[1 - f.p];
      switch (a.name) {
        case 'jump': this.doJump(f, 1); break;
        case 'dodge': if (!f.invuln && f.dashCd <= 0) { f.st = 'dodge'; f.stT = 0; f.invulnT = 0.4; f.vx = -f.face * 340; f.vy = f.air ? -180 : 0; this.emit('dodge', { x: f.x, y: f.y, p: f.p }); } break;
        case 'dash': this.doDash(f); break;
        case 'slide': if (f.dashCd <= 0) { f.st = 'slide'; f.stT = 0; f.invulnT = 0.3; f.dashCd = 0.7; f.vx = f.face * 820; this.emit('dash', { x: f.x, y: f.y, p: f.p, power: 0.8 }); } break;
        case 'spin': if (f.chainT > 0 || f.st === 'idle' || f.st === 'walk' || f.st === 'run' || f.st === 'air' || f.st === 'jump') { f.st = 'spin'; f.stT = 0; f.move = { dmg: 6, active: 0.35, range: 100, kb: 150, launch: 140, shake: 1.2, sfx: 'heavy', anim: 'spin', hitDone: false, spinHits: {} }; } break;
        case 'taunt': f.st = 'taunt'; f.stT = 0; f.tauntT = 0.9; this.emit('emote', { p: f.p, emoji: a.data && a.data.emoji ? a.data.emoji : '😤' }); break;
        case 'rage': if (f.rageCd <= 0) { f.rageT = 3.0; f.rageCd = 20; f.st = 'rage'; f.stT = 0; this.emit('rage', { x: f.x, y: f.y, p: f.p }); } break;
        case 'A': this.startAttack(f, 'light'); break;
        case 'B': this.startAttack(f, 'kick'); break;
        case 'X': this.startAttack(f, 'heavy'); break;
        case 'Y': this.doSpecial(f, e); break;
        case 'ult': this.doUltimate(f, e); break;
        case 'grab': this.doGrab(f, e); break;
        case 'blockOn': f.blocking = true; break;
        case 'blockOff': f.blocking = false; break;
        case 'releaseRB': if (f.charge > 0.4) this.startAttack(f, 'heavy', { charged: true }); else if (f.st === 'charge') this.startAttack(f, 'light'); f.charge = 0; break;
      }
    }

    doJump(f, n) {
      if (f.st === 'ko' || f.st === 'grabbed' || f.st === 'freeze') return;
      if (f.onGround) {
        f.vy = -980 * f.c.jump; f.onGround = false; f.st = 'jump'; f.stT = 0;
        this.emit('jump', { x: f.x, y: f.y, p: f.p });
      } else if (!f.airJump) {
        f.vy = -900 * f.c.jump; f.airJump = true; f.st = 'jump'; f.stT = 0;
        this.emit('jump', { x: f.x, y: f.y, p: f.p, power: 0.6 });
      }
    }

    doDash(f) {
      if (f.dashCd > 0 || f.st === 'ko' || f.st === 'grabbed' || f.st === 'freeze') return;
      if (!f.onGround && f.airDash) return;
      f.st = 'dash'; f.stT = 0;
      f.invulnT = Math.max(f.invulnT, 0.18);
      f.dashCd = 0.6;
      const dir = this.inputs[f.p].ax !== 0 ? sign(this.inputs[f.p].ax) : f.face;
      f.vx = dir * 1000; f.face = dir;
      if (!f.onGround) f.airDash = true;
      this.emit('dash', { x: f.x, y: f.y, p: f.p, power: 0.8 });
    }

    doGrab(f, e) {
      if (f.grabCd > 0 || f.st === 'ko' || f.st === 'grabbed' || f.st === 'freeze') return;
      if (Math.abs(e.x - f.x) < 95 && Math.abs(e.y - f.y) < 80 && !e.invuln && e.st !== 'ko' && e.st !== 'grabbed') {
        f.st = 'grab'; f.stT = 0; f.move = { t: 0.22 };
        e.st = 'grabbed'; e.stT = 0; e.vx = 0; e.vy = 0;
        this.emit('grab', { x: f.x, y: f.y, p: f.p, target: e.p });
      } else {
        f.st = 'grab'; f.stT = 0; f.move = { t: 0.18, whiff: true };
      }
    }

    doSpecial(f, e) {
      if (f.meter < 1 || f.st === 'ko' || f.st === 'grabbed' || f.st === 'freeze') return;
      const s = f.c.special;
      f.meter -= 1;
      f.st = 'special'; f.stT = 0;
      f.move = { kind: s.kind, dmg: s.dmg, ...s, hitDone: false, t: 0 };
      this.emit('special', { kind: s.kind, x: f.x, y: f.y, p: f.p, face: f.face });
    }

    doUltimate(f, e) {
      if (f.meter < 4 || f.st === 'ko' || f.st === 'grabbed' || f.st === 'freeze') return;
      const u = f.c.ultimate;
      f.meter = 0;
      f.st = 'ult'; f.stT = 0;
      f.ultFx = { kind: u.kind, t: 0, dur: (u.kind === 'rapid' || u.kind === 'storm') ? 1.4 : 1.0, ...u, hitTimes: [] };
      this.emit('ult', { kind: u.kind, x: f.x, y: f.y, p: f.p, face: f.face });
    }

    stepUlt(f, dt) {
      const u = f.ultFx; u.t += dt;
      const e = this.f[1 - f.p];
      if (u.kind === 'rapid' || u.kind === 'storm') {
        const interval = u.dur / u.hits;
        while (u.hitTimes.length < Math.floor(u.t / interval)) {
          u.hitTimes.push(1);
          const dist = Math.abs(e.x - f.x);
          if (dist < 340) this.hitEnemy(f, e, { dmg: u.dmg, kb: 80, launch: 120, shake: 0.8, sfx: 'ult' }, false);
          else this.emit('ultwhiff', { p: f.p });
        }
        if (u.t >= u.dur) { f.ultFx = null; f.st = 'idle'; }
        return;
      }
      if (u.kind === 'aoe') {
        if (u.t >= 0.35 && !u.done) {
          u.done = true;
          const dist = Math.abs(e.x - f.x);
          if (dist < 330) this.hitEnemy(f, e, { dmg: u.dmg, kb: 240, launch: 480, shake: 3.2, sfx: 'ult' }, false);
          this.emit('blast', { x: f.x, y: f.y, r: 330, p: f.p });
        }
        if (u.t >= u.dur) { f.ultFx = null; f.st = 'idle'; }
      } else if (u.kind === 'tornado') {
        if (u.t >= 0.4 && !u.done) {
          u.done = true;
          const dist = Math.abs(e.x - f.x);
          if (dist < 300) this.hitEnemy(f, e, { dmg: u.dmg, kb: 200, launch: 700, shake: 3, sfx: 'ult' }, false);
          this.emit('blast', { x: f.x, y: f.y, r: 300, p: f.p });
        }
        if (u.t >= u.dur) { f.ultFx = null; f.st = 'idle'; }
      } else if (u.kind === 'iceage') {
        if (u.t >= 0.4 && !u.done) {
          u.done = true;
          this.hitEnemy(f, e, { dmg: u.dmg, kb: 0, launch: 0, shake: 2, sfx: 'ult' }, false);
          e.st = 'freeze'; e.freezeT = u.freeze;
          this.emit('freeze', { x: e.x, y: e.y, p: e.p, dur: u.freeze });
        }
        if (u.t >= u.dur) { f.ultFx = null; f.st = 'idle'; }
      } else if (u.kind === 'berserk') {
        if (u.t >= 0.3 && !u.done) {
          u.done = true;
          f.berserkT = u.dur;
          this.emit('berserk', { x: f.x, y: f.y, p: f.p });
          if (Math.abs(e.x - f.x) < 140) this.hitEnemy(f, e, { dmg: 4, kb: 160, launch: 160, shake: 1.5, sfx: 'heavy' }, false);
        }
        if (u.t >= u.dur) { f.ultFx = null; f.st = 'idle'; }
      } else if (u.kind === 'possess') {
        if (u.t >= 0.5 && !u.done) {
          u.done = true;
          e.possessT = u.dur;
          f.invulnT = Math.max(f.invulnT, u.dur);
          this.emit('possess', { x: e.x, y: e.y, p: e.p, dur: u.dur });
        }
        if (u.t >= u.dur) { f.ultFx = null; f.st = 'idle'; }
      }
    }

    /* ---------------- attacks ---------------- */
    startAttack(f, name, extra) {
      if (f.st === 'ko' || f.st === 'grabbed' || f.st === 'freeze') return;
      if (f.st === 'attack' && f.move && f.stT < f.move.startup + f.move.active + 0.05) return; // no cancel mid-attack
      if (f.st === 'ult' || f.st === 'special') return;
      const base = CFG.MOVES[name];
      const m = { ...base, name, hitDone: false, charged: !!(extra && extra.charged) };
      if (m.charged) { m.dmg = 17; m.kb = 440; m.launch = 320; m.shake = 3.0; m.sfx = 'heavy'; }
      f.st = 'attack'; f.stT = 0; f.move = m;
      if (f.chainT > 0 && f.chainN < 2) { f.chainN++; m.dmg = Math.round(m.dmg * (1 + f.chainN * 0.12)); }
      else f.chainN = 0;
      this.emit('attack', { x: f.x, y: f.y, p: f.p, name, charged: m.charged });
    }

    resolveAttacks(f, e) {
      if (f.st === 'attack' && f.move) {
        const m = f.move;
        const active = f.stT >= m.startup && f.stT <= m.startup + m.active;
        if (active && !m.hitDone) {
          const dir = f.face;
          const hx = f.x + dir * m.range * 0.6;
          const dx = Math.abs(e.x - hx), dy = Math.abs(e.y - f.y);
          if (dx < m.range * 0.85 && dy < 110 && !e.invuln && e.st !== 'ko' && e.st !== 'grabbed' && e.st !== 'freeze' && e.st !== 'dodge') {
            m.hitDone = true;
            this.hitEnemy(f, e, m);
            this.emit('attackfx', { x: e.x + dir * 30, y: e.y, p: f.p, name: m.name, charged: m.charged });
          }
        }
        if (f.stT > m.startup + m.active + m.recover) {
          if (m.name !== 'heavy' && m.name !== 'kick') f.chainT = 0.4;
          f.st = f.onGround ? 'idle' : 'air'; f.move = null;
        }
      }
      if (f.st === 'spin' && f.move) {
        const m = f.move;
        if (f.stT < m.active) {
          if (!m.hitDone) {
            const dx = Math.abs(e.x - f.x), dy = Math.abs(e.y - f.y);
            if (dx < m.range && dy < 100 && !e.invuln && e.st !== 'ko' && e.st !== 'grabbed' && e.st !== 'dodge') {
              m.hitDone = true;
              this.hitEnemy(f, e, m);
            }
          }
        } else if (f.stT > m.active + 0.2) { f.st = f.onGround ? 'idle' : 'air'; f.move = null; }
      }
      // special moves active logic
      if (f.st === 'special' && f.move && f.move.kind) this.stepSpecial(f, e);
      // grab throw
      if (f.st === 'grab' && f.move && !f.move.whiff) {
        if (f.stT >= f.move.t && !f.move.done) {
          f.move.done = true;
          this.emit('throw', { x: f.x, y: f.y, p: f.p, target: e.p });
          this.hitEnemy(f, e, { dmg: 10, kb: 520, launch: 300, shake: 1.8, sfx: 'heavy', grab: true }, false);
          f.grabCd = 0.8;
          e.st = 'hitstun'; e.stT = 0; e.hitstun = 0.5; e.vx = f.face * 500; e.vy = -300;
        }
        if (f.stT >= f.move.t + 0.25) { f.st = f.onGround ? 'idle' : 'air'; f.move = null; }
      }
      if (f.st === 'grab' && f.move && f.move.whiff && f.stT >= 0.18) { f.st = f.onGround ? 'idle' : 'air'; f.move = null; f.grabCd = 0.5; }
    }

    stepSpecial(f, e) {
      const m = f.move; m.t = f.stT;
      const done = () => { f.st = f.onGround ? 'idle' : 'air'; f.move = null; };
      switch (m.kind) {
        case 'dash': { // volt: lightning dash through
          f.vx = f.face * 1500; f.vy = 0; f.invulnT = 0.3;
          if (!m.hitDone && Math.abs(e.x - f.x) < 70 && Math.abs(e.y - f.y) < 90 && !e.invuln) {
            m.hitDone = true;
            this.hitEnemy(f, e, { dmg: m.dmg, kb: 300, launch: 160, shake: 2, sfx: 'special' });
          }
          if (f.stT > 0.32 || (Math.abs(e.x - f.x) > 700)) done();
          break;
        }
        case 'teleport': { // shadow: vanish + backstab
          if (f.stT < 0.22) { f.vanishT = 0.3; f.vx = 0; }
          else if (f.stT < 0.34 && !m.done) {
            m.done = true;
            f.x = e.x + (f.face >= 0 ? -1 : 1) * 110; // appear behind
            f.vanishT = 0;
            this.emit('blink', { x: f.x, y: f.y, p: f.p });
          } else if (f.stT >= 0.34 && f.stT <= 0.5 && !m.hitDone) {
            f.face = e.x > f.x ? 1 : -1;
            const dx = Math.abs(e.x - f.x);
            if (dx < 100 && !e.invuln && e.st !== 'ko') {
              m.hitDone = true;
              this.hitEnemy(f, e, { dmg: m.dmg, kb: 220, launch: 140, shake: 2, sfx: 'special' });
            }
          } else if (f.stT > 0.55) done();
          break;
        }
        case 'uppercut': { // blaze: rising flaming uppercut
          if (f.stT < 0.14) { f.vx = 0; }
          else if (f.stT < 0.5) {
            if (!m.done) { m.done = true; f.vy = -760; f.airJump = true; }
            if (!m.hitDone && Math.abs(e.x - f.x) < 90 && Math.abs(e.y - f.y) < 110 && !e.invuln) {
              m.hitDone = true;
              this.hitEnemy(f, e, { dmg: m.dmg, kb: 120, launch: 560, shake: 2.4, sfx: 'special' });
            }
          } else done();
          break;
        }
        case 'slam': { // titan: jump + ground slam
          if (f.stT < 0.2) { f.vy = -760; f.airJump = true; f.onGround = false; }
          else if (f.onGround && f.stT > 0.25 && !m.done) {
            m.done = true;
            if (Math.abs(e.x - f.x) < 280 && !e.invuln) this.hitEnemy(f, e, { dmg: m.dmg, kb: 340, launch: 420, shake: 3.2, sfx: 'special' });
            this.emit('slam', { x: f.x, y: f.y, r: 280, p: f.p });
          } else if (f.stT > 1.2) done();
          break;
        }
        case 'poison': { // viper: poison strike
          if (f.stT < 0.2) f.vx = f.face * 500;
          else if (f.stT < 0.34 && !m.hitDone) {
            f.vx = 0;
            if (Math.abs(e.x - f.x) < 110 && !e.invuln && e.st !== 'ko') {
              m.hitDone = true;
              this.hitEnemy(f, e, { dmg: m.dmg, kb: 140, launch: 80, shake: 1.4, sfx: 'special' }, false);
              e.poisonT = m.dotDur; e.poisonDps = m.dot;
              this.emit('poison', { x: e.x, y: e.y, p: e.p });
            }
          } else if (f.stT > 0.45) done();
          break;
        }
        case 'freeze': { // frost: ranged freeze
          if (f.stT < 0.24) f.vx = 0;
          else if (f.stT < 0.4 && !m.done) {
            m.done = true;
            if (Math.abs(e.x - f.x) < 520 && !e.invuln && e.st !== 'ko' && e.st !== 'freeze') {
              this.hitEnemy(f, e, { dmg: m.dmg, kb: 0, launch: 0, shake: 1.6, sfx: 'special' }, false);
              e.st = 'freeze'; e.freezeT = m.freeze; e.vx = 0; e.vy = 0;
              this.emit('freeze', { x: e.x, y: e.y, p: e.p, dur: m.freeze });
            }
          } else if (f.stT > 0.5) done();
          break;
        }
        case 'phase': { // ghost: phase through attacks
          if (!m.done) { m.done = true; f.phaseT = m.dur; }
          f.invulnT = 0.12; // keep refreshing
          if (f.stT > 0.5) done();
          break;
        }
        case 'wave': { // storm: wind wave projectile
          if (f.stT < 0.2) f.vx = 0;
          else if (!m.done) {
            m.done = true;
            this.projectiles.push({ x: f.x + f.face * 40, y: f.y, vx: f.face * 760, kind: 'wave', life: 1.1, dmg: m.dmg, p: f.p });
            this.emit('wave', { x: f.x + f.face * 40, y: f.y, p: f.p, face: f.face });
          } else if (f.stT > 0.45) done();
          break;
        }
      }
    }

    /* ---------------- damage ---------------- */
    hitEnemy(f, e, m, showEvents = true) {
      const blocked = e.st === 'block' || (e.blocking && e.onGround);
      let perfect = false;
      let dmg = m.dmg * f.dmgMult;
      let kb = m.kb, launch = m.launch;
      if (e.st === 'freeze') dmg *= 1.5;
      if (e.air) { dmg *= 1.15; launch *= 1.4; }
      // combo multiplier
      f.combo = f.comboT > 0 ? f.combo + 1 : 1;
      f.comboT = 2.2;
      if (f.combo > f.stats.bestCombo) f.stats.bestCombo = f.combo;
      dmg *= CFG.comboMult(f.combo);
      if (blocked) {
        const pblock = e.blockEnteredAt !== undefined && (this.time - e.blockEnteredAt) < 0.12;
        if (pblock) { dmg = 0; perfect = true; e.invulnT = 0.25; f.st = 'hitstun'; f.stT = 0; f.hitstun = 0.5; f.vx = -f.face * 240; }
        else { dmg *= 0.2; kb *= 0.2; launch = 0; }
      }
      const final = Math.max(0.5, Math.round(dmg * 10) / 10);
      e.hp = Math.max(0, e.hp - final);
      e.hurtTaken += final;
      e.vx += kb * (e.x >= f.x ? 1 : -1) * (e.air ? 1.2 : 1);
      if (launch > 0) { e.vy = -Math.abs(launch); e.onGround = false; }
      else if (e.onGround && kb > 200) e.vy = -40;
      f.meter = Math.min(4, f.meter + final * 0.05);
      e.meter = Math.min(4, e.meter + final * 0.03);
      f.stats.dmg += final; f.stats.hits++;
      if (showEvents) {
        this.emit('hit', {
          x: (e.x + f.x) / 2, y: e.y, power: m.shake || 0.5,
          kind: m.kind || m.sfx || 'light', p: f.p, target: e.p,
          blocked: blocked && !perfect, perfect, dmg: final, combo: f.combo,
        });
        if (f.combo >= 3) this.emit('combo', { p: f.p, count: f.combo, label: CFG.comboLabel(f.combo) });
      }
      if (e.st !== 'grabbed' && !perfect) {
        e.st = 'hitstun'; e.stT = 0;
        e.hitstun = 0.26 + (m.dmg >= 12 ? 0.1 : 0) + (e.air ? 0.08 : 0);
        e.blocking = false;
      }
    }

    resolveProjectiles() {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.x += pr.vx * 1 / 60; pr.life -= 1 / 60;
        const e = this.f[1 - pr.p];
        if (Math.abs(e.x - pr.x) < 34 && Math.abs(e.y - pr.y) < 70 && !e.invuln && e.st !== 'ko' && e.st !== 'grabbed' && e.st !== 'dodge') {
          const f = this.f[pr.p];
          this.hitEnemy(f, e, { dmg: pr.dmg, kb: 260, launch: 200, shake: 1.6, sfx: 'special' });
          this.projectiles.splice(i, 1);
          continue;
        }
        if (pr.life <= 0 || pr.x < -50 || pr.x > W + 50) this.projectiles.splice(i, 1);
      }
    }

    resolveGrabState() {
      // grabbed fighter can mash block to escape faster
      for (const f of this.f) {
        if (f.st === 'grabbed') {
          f.stT += 1 / 60;
          const mashing = f.blocking || !!this.inputs[f.p].held.block;
          if (mashing) f.stT += 1 / 60 * 2;
          if (f.stT > 0.28) { f.st = 'hitstun'; f.stT = 0; f.hitstun = 0.1; }
        }
      }
    }

    /* ---------------- physics ---------------- */
    stepPhysics(f, dt, control = true) {
      const CONTROLLABLE = ['idle', 'walk', 'run', 'air', 'jump', 'crouch', 'block', 'charge'];
      if (f.st === 'ko') { f.vx *= 0.98; f.vy += this.arena.gravity * 0.8 * dt; }
      else if (control && CONTROLLABLE.includes(f.st)) {
        // horizontal control
        const inp = this.inputs[f.p];
        let ax = inp.ax;
        if (f.possessT > 0) ax = -ax; // possessed!
        const wantBlock = f.blocking || !!inp.held.block;
        if (wantBlock && f.onGround) {
          // hold to block — timing window for PERFECT block
          if (f._wasBlock !== true) f.blockEnteredAt = this.time;
          f._wasBlock = true;
          f.st = 'block';
          f.vx *= 0.85;
          f.charge = 0;
        } else {
          f._wasBlock = false;
          if (!f.air) {
            if (Math.abs(ax) > 0.08) {
              const run = Math.abs(ax) > 0.55;
              const spd = (run ? 470 : 300) * f.c.speed * f.speedMult;
              f.vx += (ax * spd - f.vx) * Math.min(1, dt * 12);
              f.face = ax > 0 ? 1 : -1;
              f.st = run ? 'run' : 'walk';
            } else {
              f.vx += (0 - f.vx) * Math.min(1, dt * 10);
              if (Math.abs(f.vx) < 8) f.st = 'idle';
            }
            if (inp.ay > 0.55) { f.st = 'crouch'; f.vx *= 0.9; }
            else if (f.st === 'crouch') f.st = 'idle';
            // charge (RB held)
            if (inp.held.RB && ['idle', 'walk', 'run', 'block'].includes(f.st)) {
              f.st = 'charge'; f.charge = Math.min(1.4, f.charge + dt);
            }
          } else {
            f.st = 'air';
            if (Math.abs(ax) > 0.08) f.vx += ax * 900 * dt;
            f.vx = clamp(f.vx, -600, 600);
            if (inp.ay > 0.55 && f.vy > 0) f.vy *= 0.9; // fast-fall
          }
          // gentle auto-face when close and idle
          const e = this.f[1 - f.p];
          const dx = e.x - f.x;
          if (f.onGround && Math.abs(dx) < 100 && Math.abs(ax) < 0.15 && ['idle', 'block', 'crouch', 'charge'].includes(f.st)) {
            f.face = dx > 0 ? 1 : -1;
          }
        }
      }

      // gravity
      if (!f.onGround || f.vy < 0) f.vy += this.arena.gravity * dt;
      else f.vy = 0;
      f.vy = clamp(f.vy, -1400, 1900);

      // integrate
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // platform landing
      const top = this.arena.platformBelow(f);
      if (top !== null && f.vy > 0) { f.y = top - f.curHalfH; f.vy = 0; f.onGround = true; f.airJump = false; f.airDash = false; }
      // floor
      if (f.feet >= FLOOR_Y && f.vy >= 0) {
        f.y = FLOOR_Y - f.curHalfH;
        f.vy = 0;
        if (!f.onGround) { f.airJump = false; f.airDash = false; this.emit('land', { x: f.x, y: f.y, p: f.p }); }
        f.onGround = true;
      }
      // ceilings
      if (f.headY < 0) { f.y = f.curHalfH; f.vy = Math.abs(f.vy) * 0.5; }

      // fighter separation — don't pass through each other
      const other = this.f[1 - f.p];
      const sdx = f.x - other.x;
      if (Math.abs(sdx) < 40 && Math.abs(f.y - other.y) < 100 && f.st !== 'ko' && other.st !== 'ko') {
        const push = (40 - Math.abs(sdx)) / 2;
        f.x = clamp(f.x + (sdx >= 0 ? 1 : -1) * push, 30, W - 30);
        if (f.onGround && Math.abs(f.vx) < 90) f.vx = 0;
      }

      // walls
      const minX = 30, maxX = W - 30;
      if (f.x < minX) { f.x = minX; if (this.arena.bounce && Math.abs(f.vx) > 320) { f.vx = -f.vx * 0.55; this.emit('wall', { x: minX, y: f.y, p: f.p }); } else f.vx = 0; }
      if (f.x > maxX) { f.x = maxX; if (this.arena.bounce && Math.abs(f.vx) > 320) { f.vx = -f.vx * 0.55; this.emit('wall', { x: maxX, y: f.y, p: f.p }); } else f.vx = 0; }

      // state timer
      f.stT += dt;
      if (f.st === 'hitstun' && f.stT > (f.hitstun || 0.3)) f.st = f.onGround ? 'idle' : 'air';
      if ((f.st === 'dash' || f.st === 'slide') && f.stT > 0.24) f.st = f.onGround ? 'idle' : 'air';
      if (f.st === 'dodge' && f.stT > 0.3) f.st = f.onGround ? 'idle' : 'air';
      if (f.st === 'taunt' && f.stT > 0.9) f.st = f.onGround ? 'idle' : 'air';
      if (f.st === 'rage' && f.stT > 0.5) f.st = f.onGround ? 'idle' : 'air';
      if (f.st === 'charge' && !this.inputs[f.p].held.RB) { f.st = 'idle'; }
      if (!f.onGround && f.vy > 0 && ['idle', 'walk', 'run', 'crouch'].includes(f.st)) f.st = 'air';
      if (f.onGround && f.st === 'jump' && f.vy === 0) f.st = 'idle';
      if (f.onGround && f.st === 'air') f.st = 'idle';
      if (f.st === 'block' && !f.blocking && !this.inputs[f.p].held.block) f.st = 'idle';
    }

    /* ---------------- KO / rounds ---------------- */
    doKO(f) {
      const e = this.f[1 - f.p];
      f.st = 'ko'; f.koT = 0; f.vx = f.face * -260; f.vy = -560; f.onGround = false;
      this.slowmo = 1.4;
      const perfect = e.hurtTaken === 0;
      this.emit('ko', { winner: f.p, loser: e.p, perfect, x: e.x, y: e.y, p: f.p });
      if (perfect) this.emit('announce', { text: 'PERFECT!' });
      this.endRound(f.p, 'KO', perfect);
    }

    endRound(winner, reason, perfect = false) {
      if (this.status !== 'fight') return;
      this.status = 'roundend';
      this.result = { winner, reason };
      const [f0, f1] = this.f;
      if (winner === 0) f0.roundsWon++;
      else if (winner === 1) f1.roundsWon++;
      this.emit('roundend', { winner, reason, p1hp: Math.round(f0.hp), p2hp: Math.round(f1.hp), p1wins: f0.roundsWon, p2wins: f1.roundsWon });
      if (f0.roundsWon >= 2 || f1.roundsWon >= 2) {
        this.status = 'result';
        this.emit('matchend', { winner, reason, perfect, p1: f0.roundsWon, p2: f1.roundsWon });
      }
    }

    nextRound() {
      this.round++;
      this.status = 'countdown';
      this.countdown = 3.4;
      this.timer = this.roundSeconds;
      for (const f of this.f) {
        f.hp = 100; f.meter = 1.0; f.st = 'idle'; f.stT = 0; f.vx = 0; f.vy = 0;
        f.combo = 0; f.comboT = 0; f.poisonT = 0; f.freezeT = 0; f.possessT = 0;
        f.berserkT = 0; f.rageT = 0; f.ultFx = null; f.charge = 0; f.phaseT = 0;
        f.x = W * (f.p === 0 ? 0.25 : 0.75); f.y = FLOOR_Y - 70; f.onGround = true;
        f.invulnT = 0; f.airJump = false; f.airDash = false; f.hurtTaken = 0;
      }
      this.projectiles = [];
      this.emit('roundstart', { round: this.round });
    }

    /* ---------------- snapshot ---------------- */
    snapshot() {
      return {
        tick: this.tickNo, t: Math.round(this.time * 100) / 100,
        status: this.status, countdown: Math.ceil(this.countdown),
        round: this.round, timer: Math.max(0, Math.ceil(this.timer)),
        p1wins: this.f[0].roundsWon, p2wins: this.f[1].roundsWon,
        paused: this.paused,
        reason: this.result ? this.result.reason : null,
        f: this.f.map(f => ({
          p: f.p, char: f.char, x: Math.round(f.x), y: Math.round(f.y),
          vx: Math.round(f.vx), vy: Math.round(f.vy), face: f.face,
          st: f.st, stT: Math.round(f.stT * 100) / 100,
          hp: Math.round(f.hp * 10) / 10, meter: Math.round(f.meter * 10) / 10,
          combo: f.combo, block: f.st === 'block', blockT: f.stT,
          charge: Math.round(f.charge * 100) / 100,
          invuln: f.invuln, vanish: f.vanishT > 0, phase: f.phaseT > 0,
          freeze: f.st === 'freeze', poison: f.poisonT > 0,
          berserk: f.berserkT > 0, rage: f.rageT > 0,
          possess: f.possessT > 0, ko: f.st === 'ko',
          aura: f.berserkT > 0 ? 'berserk' : f.rageT > 0 ? 'rage' : f.phaseT > 0 ? 'phase' : null,
        })),
        proj: this.projectiles.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), kind: p.kind })),
      };
    }
  }

  /* ============================================================
     BOT AI — drives a fighter with synthetic inputs
     ============================================================ */
  class Bot {
    constructor(slot, diff = 0.5, name = 'BOT') {
      this.p = slot; this.diff = clamp(diff, 0.15, 1);
      this.name = name;
      this.decideT = 0; this.plan = null;
      this.hurtT = 0;
    }
    think(sim, si) {
      if (si === undefined) si = this.p;
      const f = sim.f[si], e = sim.f[1 - si];
      const inp = { ax: 0, ay: 0, held: {} };
      const acts = [];
      if (sim.status !== 'fight' || f.st === 'ko' || f.st === 'freeze' || f.st === 'grabbed') return { inp, acts };
      const dx = e.x - f.x;
      const dist = Math.abs(dx);
      const busy = ['attack', 'special', 'ult', 'grab', 'hitstun', 'dash', 'slide', 'dodge', 'taunt', 'rage'].includes(f.st);
      const react = Math.random() < 0.3 * this.diff + 0.1;

      if (!busy) {
        // block when enemy is attacking up close
        const eAttacking = ['attack', 'special', 'ult'].includes(e.st);
        if (eAttacking && dist < 160 && Math.random() < 0.45 * this.diff + 0.15) {
          inp.held.block = true;
        }
        // approach / retreat
        if (f.hp < 30 && Math.random() < 0.4) inp.ax = dx > 0 ? -1 : 1; // run away when low
        else if (dist > 200) inp.ax = dx > 0 ? 1 : -1;
        else if (dist < 90 && Math.random() < 0.5) inp.ax = dx > 0 ? -1 : 1;
        else inp.ax = Math.random() < 0.5 ? (dx > 0 ? 1 : -1) : 0;

        // vertical: get onto enemy platform
        if (e.y < f.y - 90 && dist < 140 && Math.random() < 0.15 * this.diff + 0.05) acts.push({ name: 'jump' });

        // attacks
        if (dist < 115 && Math.random() < 0.55 * this.diff + 0.1) {
          const r = Math.random();
          if (r < 0.42) acts.push({ name: 'A' });
          else if (r < 0.66) acts.push({ name: 'B' });
          else if (r < 0.82) acts.push({ name: 'X' });
          else acts.push({ name: 'grab' });
        }
        // specials
        if (f.meter >= 1 && dist < 260 && Math.random() < 0.10 * this.diff + 0.03) acts.push({ name: 'Y' });
        if (f.meter >= 4 && dist < 320 && Math.random() < 0.25 * this.diff + 0.1) acts.push({ name: 'ult' });
        if (Math.abs(dx) > 300 && Math.random() < 0.05) acts.push({ name: 'dash' });
        if (!f.onGround && Math.random() < 0.06) acts.push({ name: 'jump' }); // occasional air jump
      }
      return { inp, acts };
    }
  }

  return { Sim, Bot, W, FLOOR_Y, GRAV };
});
