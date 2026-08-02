/* ============================================================
   StickFight Arena — stickman renderer
   2-bone IK limbs, blended pose goals, glowing joints,
   player-color glow (P1 red / P2 blue), auras, dash trails.
   Local space: +x = facing forward, -y = up, origin = feet center.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SFAStickman = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const L1 = 20, L2 = 19; // upper/fore limb lengths (arms & legs share)
  const TORSO = 40, HEAD_R = 11;

  /* 2-bone IK: base -> target with bend direction sign */
  function ik(base, target, sgn) {
    const dx = target.x - base.x, dy = target.y - base.y;
    let d = Math.hypot(dx, dy);
    const maxD = L1 + L2 - 1;
    if (d > maxD) { const k = maxD / d; target = { x: base.x + dx * k, y: base.y + dy * k }; d = maxD; }
    if (d < 0.001) d = 0.001;
    const a = Math.acos(SFA.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const b = Math.atan2(dy, dx);
    const el = { x: base.x + L1 * Math.cos(b + a * sgn), y: base.y + L1 * Math.sin(b + a * sgn) };
    return { el, hand: target };
  }

  /* ---------- pose goal computation (returns goal offsets) ---------- */
  function poseGoals(f, charCfg) {
    const t = f.stT, bob = Math.sin(f.poseT * 3) * 1.6;
    const G = {
      hip: { x: 0, y: -38 }, head: { x: 0, y: -78 + bob }, lean: 0,
      hF: { x: 12, y: -52 }, hB: { x: 2, y: -46 },
      fF: { x: 9, y: 0 }, fB: { x: -8, y: 0 }, // front/back foot
      crouch: 0, alpha: 1,
    };
    const spd = Math.abs(f.vx);
    switch (f.st) {
      case 'walk': {
        const ph = f.poseT * 6, a = 17;
        G.fF = { x: Math.sin(ph) * a + 8, y: 0 }; G.fB = { x: -Math.sin(ph) * a - 6, y: 0 };
        G.hF = { x: -Math.sin(ph) * a * 0.6, y: -58 }; G.hB = { x: Math.sin(ph) * a * 0.6, y: -56 };
        G.lean = 0.08; G.head.y -= 2;
        break;
      }
      case 'run': {
        const ph = f.poseT * 11, a = 26;
        G.fF = { x: Math.sin(ph) * a + 10, y: -Math.max(0, Math.sin(ph)) * 12 };
        G.fB = { x: -Math.sin(ph) * a - 8, y: -Math.max(0, -Math.sin(ph)) * 12 };
        G.hF = { x: -Math.sin(ph) * a * 0.7, y: -64 }; G.hB = { x: Math.sin(ph) * a * 0.7, y: -62 };
        G.lean = 0.22;
        break;
      }
      case 'jump': G.fF = { x: 15, y: -26 }; G.fB = { x: -11, y: -24 }; G.hF = { x: 22, y: -92 }; G.hB = { x: -20, y: -88 }; G.lean = 0.1; break;
      case 'air': G.fF = { x: 12, y: -18 }; G.fB = { x: -8, y: -14 }; G.hF = { x: 26, y: -70 }; G.hB = { x: -24, y: -66 }; break;
      case 'crouch': G.hip.y = -24; G.fF = { x: 15, y: 0 }; G.fB = { x: -15, y: 0 }; G.hF = { x: 16, y: -30 }; G.hB = { x: -14, y: -32 }; G.crouch = 1; G.head.y = -58; break;
      case 'block': G.hip.y = -34; G.hF = { x: 17, y: -46 }; G.hB = { x: 14, y: -50 }; G.fF = { x: 12, y: 0 }; G.fB = { x: -12, y: 0 }; G.lean = -0.1; G.crouch = 0.3; break;
      case 'dash': G.lean = 0.38; G.fF = { x: 32, y: -6 }; G.fB = { x: -30, y: -4 }; G.hF = { x: -24, y: -50 }; G.hB = { x: -30, y: -60 }; break;
      case 'slide': G.hip.y = -18; G.lean = 0.3; G.fF = { x: 30, y: 0 }; G.fB = { x: -6, y: 0 }; G.hF = { x: -20, y: -26 }; G.hB = { x: -26, y: -40 }; break;
      case 'dodge': G.lean = -0.42; G.fF = { x: 0, y: 0 }; G.fB = { x: -4, y: 0 }; G.hF = { x: -18, y: -56 }; G.hB = { x: 16, y: -64 }; G.head.y = -80; break;
      case 'hitstun': G.lean = -0.34; G.head.y = -82; G.hF = { x: -18, y: -52 }; G.hB = { x: 16, y: -60 }; G.fF = { x: 13, y: 0 }; G.fB = { x: -11, y: 0 }; G.hip.y = -40; break;
      case 'grab': G.lean = 0.12; G.hF = { x: 36, y: -50 }; G.hB = { x: 30, y: -54 }; G.fF = { x: 14, y: 0 }; G.fB = { x: -10, y: 0 }; break;
      case 'grabbed': G.lean = 0.14; G.hF = { x: 18, y: -96 }; G.hB = { x: -14, y: -94 }; G.fF = { x: 10, y: -6 }; G.fB = { x: -8, y: -8 }; G.head.y = -84; break;
      case 'taunt': G.hF = { x: 18, y: -104 + Math.sin(f.poseT * 8) * 6 }; G.hB = { x: 26, y: -40 }; G.fF = { x: 10, y: 0 }; G.fB = { x: -8, y: 0 }; break;
      case 'rage': G.hF = { x: 36, y: -86 }; G.hB = { x: -32, y: -84 }; G.lean = -0.12; G.fF = { x: 16, y: 0 }; G.fB = { x: -16, y: 0 }; G.head.y = -86; break;
      case 'freeze': {
        const sh = Math.sin(f.poseT * 20) * 1.5;
        G.hF = { x: 12 + sh, y: -56 }; G.hB = { x: -10 - sh, y: -54 }; G.fF = { x: 6, y: 0 }; G.fB = { x: -6, y: 0 }; G.head.y = -76 + sh; break;
      }
      case 'charge': G.hip.y = -32; G.lean = -0.14; G.hF = { x: -26, y: -50 }; G.hB = { x: 22, y: -58 }; G.fF = { x: 12, y: 0 }; G.fB = { x: -12, y: 0 }; G.crouch = 0.4; break;
      case 'spin': {
        const a = f.poseT * 22;
        G.hF = { x: Math.cos(a) * 30, y: -58 + Math.sin(a) * 26 }; G.hB = { x: -Math.cos(a) * 30, y: -58 - Math.sin(a) * 26 };
        G.fF = { x: 10, y: 0 }; G.fB = { x: -10, y: 0 }; G.lean = 0.15; break;
      }
      case 'attack': {
        const m = f.move || {};
        if (m.name === 'light' || m.name === 'kick') {
          const p = SFA.clamp(t / (m.startup + m.active + m.recover), 0, 1);
          const out = Math.sin(p * Math.PI); // punch extend curve
          if (m.name === 'light') { G.hF = { x: 8 + out * 38, y: -52 - out * 4 }; G.hB = { x: 2, y: -48 }; G.lean = 0.16 * out; }
          else { G.fF = { x: 8 + out * 42, y: -20 - out * 10 }; G.hF = { x: -20, y: -64 }; G.hB = { x: -16, y: -56 }; G.lean = -0.18 * out; }
          G.hip.y = -38 + out * 3;
        } else if (m.name === 'heavy') {
          const p = SFA.clamp(t / 0.5, 0, 1);
          if (p < 0.35) { const w = p / 0.35; G.hF = { x: SFA.lerp(10, -4, w), y: SFA.lerp(-58, -104, w) }; G.hB = { x: SFA.lerp(2, 2, w), y: SFA.lerp(-52, -100, w) }; G.lean = -0.2; }
          else { const w = (p - 0.35) / 0.65; const o = Math.sin(w * Math.PI); G.hF = { x: -4 + o * 44, y: -104 + o * 66 }; G.hB = { x: 2 + o * 34, y: -100 + o * 60 }; G.lean = 0.3 * o; G.hip.y = -38 + o * 6; }
        }
        break;
      }
      case 'special': {
        const k = (f.move || {}).kind;
        if (k === 'uppercut') { G.hF = { x: 4, y: -112 }; G.hB = { x: -6, y: -70 }; G.fF = { x: 8, y: -10 }; G.fB = { x: -8, y: -6 }; G.lean = -0.14; }
        else if (k === 'slam') { G.hF = { x: 8, y: -108 }; G.hB = { x: -4, y: -104 }; G.fF = { x: 12, y: -16 }; G.fB = { x: -10, y: -14 }; }
        else if (k === 'dash') { G.lean = 0.4; G.hF = { x: -20, y: -46 }; G.hB = { x: -30, y: -60 }; G.fF = { x: 30, y: -4 }; G.fB = { x: -26, y: -2 }; }
        else if (k === 'poison') { G.hF = { x: 40, y: -48 }; G.hB = { x: 2, y: -52 }; G.lean = 0.2; }
        else if (k === 'freeze') { G.hF = { x: 30, y: -54 }; G.hB = { x: 28, y: -50 }; G.lean = 0.1; }
        else if (k === 'phase') { G.hF = { x: 30, y: -62 }; G.hB = { x: -28, y: -60 }; }
        else if (k === 'wave') { const p = SFA.clamp(t / 0.4, 0, 1); const o = Math.sin(p * Math.PI); G.hF = { x: 8 + o * 38, y: -52 }; G.lean = 0.2 * o; }
        else if (k === 'teleport') { G.hF = { x: -6, y: -56 }; G.hB = { x: 10, y: -60 }; G.alpha = t < 0.24 ? Math.max(0, 1 - t * 10) : 0; }
        break;
      }
      case 'ult': {
        const u = f.ultFx || {};
        if (u.kind === 'rapid') { const a = f.poseT * 30; G.hF = { x: Math.sin(a) * 40, y: -54 }; G.hB = { x: Math.cos(a) * 30, y: -58 }; G.lean = 0.12; }
        else if (u.kind === 'aoe' || u.kind === 'tornado' || u.kind === 'berserk') { G.hF = { x: 32, y: -92 }; G.hB = { x: -30, y: -90 }; G.lean = -0.14; G.head.y = -86; }
        else if (u.kind === 'storm') { G.hF = { x: 12, y: -106 }; G.hB = { x: -8, y: -64 }; }
        else if (u.kind === 'iceage' || u.kind === 'possess') { G.hF = { x: 30, y: -56 }; G.hB = { x: 28, y: -52 }; G.lean = 0.1; }
        break;
      }
      case 'ko': {
        const k = Math.min(1, t * 2.2);
        G.ko = k * 1.15; // fall-back rotation
        G.hip = { x: 4 * k, y: -38 + 30 * k };
        G.head = { x: 10 * k, y: -74 + 48 * k };
        G.hF = { x: 24 * k, y: -40 + 34 * k }; G.hB = { x: -10 * k, y: -44 + 36 * k };
        G.fF = { x: 20 * k, y: -6 + 14 * k }; G.fB = { x: -12 * k, y: -4 + 12 * k };
        break;
      }
      default: break;
    }
    if (f.charge > 0.05 && ['idle', 'walk', 'run', 'block', 'charge'].includes(f.st)) {
      G.hF = { x: -30, y: -48 }; G.hB = { x: 24, y: -56 }; G.lean = -0.16; G.crouch = 0.45;
    }
    return G;
  }

  /* ---------- draw one fighter ---------- */
  function draw(ctx, f, charCfg, opts = {}) {
    const { p = 0, scale = 1, alpha = 1, glowColor, trail = null } = opts;
    const pc = p === 0 ? '#ff2d2d' : '#2d9cff';
    const body = '#eef2ff';
    const G = poseGoals(f, charCfg);
    if (G.alpha === 0) return;

    const rot = G.ko || 0;
    const cx = f.x, cy = f.y; // feet center
    const s = scale;
    const rad = (a) => a * (f.face >= 0 ? 1 : -1); // mirror for facing

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * (f.face >= 0 ? -1 : 1));
    ctx.scale(s, s);

    // --- shadow ---
    if (!opts.noShadow) {
      const shScale = Math.max(0.25, 1 - (cy > 0 ? 0 : 0)); // keep simple
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, 2, 26, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // aura (berserk / rage / phase)
    if (f.aura === 'berserk' || f.aura === 'rage') {
      ctx.save();
      ctx.globalAlpha = alpha * (0.5 + Math.sin(f.poseT * 14) * 0.2);
      ctx.shadowColor = f.aura === 'berserk' ? '#ff2d2d' : '#ff8c2d';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = f.aura === 'berserk' ? '#ff2d2d' : '#ff8c2d';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -52, 34 + Math.sin(f.poseT * 10) * 4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // body skeleton
    const hip = { x: G.hip.x, y: G.hip.y };
    const leanA = -G.lean * rad(1); // torso rotation (lean forward)
    const sh = { x: hip.x + Math.sin(leanA) * TORSO, y: hip.y - Math.cos(leanA) * TORSO };
    const head = { x: sh.x + G.head.x * 0.12, y: sh.y - 22 + (G.head.y + 78) * 0.5 };
    if (G.head) head.y = G.head.y;
    head.x = sh.x + (G.head.x - sh.x) * 0.08;

    const limb = (base, goal, sgn) => ik(base, goal, sgn);

    const fF = limb(hip, { x: G.fF.x, y: G.fF.y }, 1);
    const fB = limb(hip, { x: G.fB.x, y: G.fB.y }, -1);
    const hF = limb(sh, { x: G.hF.x, y: G.hF.y }, 1);
    const hB = limb(sh, { x: G.hB.x, y: G.hB.y }, -1);

    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const limbDraw = (base, mid, end, w, color, glow, blur = 8) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = blur; }
      ctx.beginPath();
      ctx.moveTo(base.x, base.y); ctx.lineTo(mid.x, mid.y); ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    const joint = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    };

    // back limbs (darker)
    limbDraw(hip, fB.el, fB.hand, 6, 'rgba(180,190,215,0.85)', null);
    limbDraw(sh, hB.el, hB.hand, 5.5, 'rgba(180,190,215,0.85)', null);
    joint(fB.el.x, fB.el.y, 3, pc); joint(fB.hand.x, fB.hand.y, 3.4, pc);
    joint(hB.el.x, hB.el.y, 2.6, pc); joint(hB.hand.x, hB.hand.y, 3, pc);

    // torso
    ctx.strokeStyle = body;
    ctx.lineWidth = 7;
    ctx.shadowColor = glowColor || pc; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(sh.x, sh.y); ctx.stroke();
    ctx.shadowBlur = 0;

    // front limbs
    limbDraw(hip, fF.el, fF.hand, 6.5, body, glowColor || pc);
    limbDraw(sh, hF.el, hF.hand, 6, body, glowColor || pc);
    joint(fF.el.x, fF.el.y, 3.2, pc); joint(fF.hand.x, fF.hand.y, 3.6, pc);
    joint(hF.el.x, hF.el.y, 2.8, pc); joint(hF.hand.x, hF.hand.y, 3.2, pc);

    // head
    joint(sh.x, sh.y, 3.4, pc);
    ctx.fillStyle = body;
    ctx.shadowColor = glowColor || pc; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(head.x, head.y, HEAD_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // face dot (eye) toward facing
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.arc(head.x + 4, head.y - 1, 2.2, 0, Math.PI * 2); ctx.fill();

    // hips
    joint(hip.x, hip.y, 3.6, pc);

    // charge glow on front hand
    if (f.charge > 0.05) {
      ctx.save();
      ctx.globalAlpha = alpha * (0.5 + f.charge * 0.5);
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(hF.hand.x, hF.hand.y, 5 + f.charge * 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- animated preview (character select, landing) ---------- */
  function preview(ctx, charCfg, glowColor, t, pose = 'idle', w = 140, h = 200) {
    const f = {
      x: 0, y: 0, vx: 0, vy: 0, face: 1, st: pose, stT: (t * 2) % 3, poseT: t * 3,
      move: pose === 'attack' ? { name: 'light', startup: 0.06, active: 0.1, recover: 0.16 } : null,
      charge: 0, aura: null, ultFx: null, ko: 0,
    };
    ctx.save();
    ctx.translate(w / 2, h * 0.86);
    draw(ctx, f, charCfg, { p: glowColor === '#ff2d2d' ? 0 : 1, scale: 1, alpha: 1, glowColor, noShadow: true });
    ctx.restore();
  }

  return { draw, preview };
});
