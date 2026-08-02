/* ============================================================
   StickFight Arena — arena renderer
   Theme backgrounds (parallax), neon platforms, perspective
   floor, particles, floaters (combo text / emotes), shake.
   World: 1600 x 1000 units, floor at y=900.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SFARender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const W = 1600, FLOOR_Y = 900;

  /* ---------- world -> screen ---------- */
  function makeCam(cw, ch) {
    const s = Math.min(cw / (W + 80), ch / 1060);
    return { s, ox: (cw - W * s) / 2, oy: (ch - 1040 * s) / 2 + 20, w: cw, h: ch };
  }

  /* ---------- particles ---------- */
  const parts = [];
  function spawn(x, y, opts = {}) {
    const n = opts.n || 8;
    const colPick = (i) => {
      const c = opts.color || '#ffffff';
      if (Array.isArray(c)) return c[i % c.length];
      if (typeof c === 'function') return c(i);
      return c;
    };
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * opts.spread : Math.random() * Math.PI * 2;
      const sp = (opts.speed || 180) * (0.5 + Math.random());
      parts.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 60),
        life: opts.life || 0.5 + Math.random() * 0.35,
        t: 0, size: opts.size || 2 + Math.random() * 3,
        color: colPick(i),
        grav: opts.grav !== undefined ? opts.grav : 500,
        glow: opts.glow !== false,
      });
    }
    if (parts.length > 600) parts.splice(0, parts.length - 600);
  }
  const HIT_COLORS = {
    light: ['#ffffff', '#ffd9d9', '#ff8a8a'],
    kick: ['#ffffff', '#cfe8ff', '#8ab8ff'],
    heavy: ['#ffd700', '#ff8a2d', '#ffffff'],
    special: ['#c77dff', '#7dffd4', '#ff7ddb'],
    ult: ['#ff2d2d', '#ffd700', '#7dffd4', '#ffffff'],
    poison: ['#3ddc67', '#b6ffd0', '#7dffa8'],
    freeze: ['#7fd4ff', '#d9f6ff', '#ffffff'],
    block: ['#9df3ff', '#ffffff'],
    lava: ['#ff5a2d', '#ffd700', '#ff2d2d'],
    wave: ['#9fe8ff', '#ffffff', '#d9f6ff'],
    land: ['#8a93b8', '#5c6a99'],
  };

  /* ---------- floaters (text / emotes) ---------- */
  const floaters = [];
  function floater(x, y, text, color, size = 34, life = 1.1, vy = -90) {
    floaters.push({ x, y, text, color, size, life, t: 0, vy });
  }

  /* ---------- background themes ---------- */
  const bgDrawers = {
    city(ctx, t, cam) {
      const g = ctx.createLinearGradient(0, 0, 0, cam.h);
      g.addColorStop(0, '#070b1d'); g.addColorStop(0.6, '#141c3d'); g.addColorStop(1, '#1c1026');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
      const moon = cam.w * 0.78, my = cam.h * 0.16;
      ctx.fillStyle = '#e8ecff'; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(moon, my, 34, 0, 6.29); ctx.fill();
      ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(moon, my, 58, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
      // skyline parallax (3 layers)
      const layers = [
        { y: 0.62, h: 0.24, c: '#0d1430', spd: 0.2, win: '#ffd700' },
        { y: 0.68, h: 0.2, c: '#131b3d', spd: 0.4, win: '#2d9cff' },
        { y: 0.74, h: 0.16, c: '#182248', spd: 0.7, win: '#ff8a8a' },
      ];
      for (const L of layers) {
        ctx.fillStyle = L.c;
        const off = (t * 8 * L.spd) % 120;
        for (let x = -120 - off; x < cam.w + 120; x += 120) {
          const bh = cam.h * L.h * (0.55 + Math.abs(Math.sin(x * 0.013)) * 0.45);
          ctx.fillRect(x, cam.h * L.y - bh, 90, bh + 10);
          ctx.fillStyle = L.win; ctx.globalAlpha = 0.5;
          for (let wy = cam.h * L.y - bh + 12; wy < cam.h * L.y - 14; wy += 18) {
            for (let wx = x + 10; wx < x + 78; wx += 16) {
              if (Math.sin(wx * 3 + wy * 7) > 0.55) ctx.fillRect(wx, wy, 5, 8);
            }
          }
          ctx.fillStyle = L.c; ctx.globalAlpha = 1;
        }
      }
      // haze
      const hz = ctx.createLinearGradient(0, cam.h * 0.6, 0, cam.h);
      hz.addColorStop(0, 'rgba(45,90,255,0)'); hz.addColorStop(1, 'rgba(45,90,255,0.10)');
      ctx.fillStyle = hz; ctx.fillRect(0, 0, cam.w, cam.h);
    },
    dojo(ctx, t, cam) {
      const g = ctx.createLinearGradient(0, 0, 0, cam.h);
      g.addColorStop(0, '#0e0705'); g.addColorStop(0.7, '#1d0f08'); g.addColorStop(1, '#2b1509');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
      // wooden slat wall
      ctx.strokeStyle = 'rgba(255,176,58,0.10)'; ctx.lineWidth = 2;
      for (let y = 0; y < cam.h; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cam.w, y); ctx.stroke(); }
      for (let x = 0; x < cam.w; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cam.h); ctx.stroke(); }
      // lanterns swaying
      for (let i = 0; i < 5; i++) {
        const lx = cam.w * (0.08 + i * 0.21), ly = cam.h * 0.22 + Math.sin(t * 1.4 + i * 2) * 12;
        ctx.fillStyle = '#ffb03a'; ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.arc(lx, ly, 26, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff8a2d';
        ctx.beginPath(); ctx.ellipse(lx, ly, 9, 13, 0, 0, 6.29); ctx.fill();
        ctx.fillStyle = '#ffd700'; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(lx, ly - 2, 4, 0, 6.29); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx, ly - 16); ctx.lineTo(lx, ly - 40); ctx.stroke();
      }
    },
    volcano(ctx, t, cam) {
      const g = ctx.createLinearGradient(0, 0, 0, cam.h);
      g.addColorStop(0, '#0d0406'); g.addColorStop(0.6, '#26090d'); g.addColorStop(1, '#3b0d0d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
      // distant mountains
      ctx.fillStyle = '#160508';
      ctx.beginPath(); ctx.moveTo(0, cam.h * 0.7);
      for (let x = 0; x <= cam.w; x += 40) ctx.lineTo(x, cam.h * (0.68 - Math.abs(Math.sin(x * 0.004 + t * 0.1)) * 0.12));
      ctx.lineTo(cam.w, cam.h); ctx.lineTo(0, cam.h); ctx.fill();
      // rising embers
      for (let i = 0; i < 40; i++) {
        const e = (i * 137.5 + t * 30) % 1;
        const ex = ((i * 97) % cam.w) + Math.sin(t * 2 + i) * 30;
        const ey = cam.h * (1 - e * 0.9);
        ctx.globalAlpha = (1 - e) * 0.5;
        ctx.fillStyle = e < 0.85 ? '#ff8a2d' : '#ffd700';
        ctx.beginPath(); ctx.arc(ex, ey, 1.5 + e * 2, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    space(ctx, t, cam) {
      const g = ctx.createLinearGradient(0, 0, 0, cam.h);
      g.addColorStop(0, '#03040c'); g.addColorStop(1, '#0a0f2a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
      // stars
      for (let i = 0; i < 130; i++) {
        const sx = (i * 71.3) % cam.w, sy = (i * 47.7) % (cam.h * 0.7);
        ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + i));
        ctx.fillStyle = i % 7 === 0 ? '#9df3ff' : '#ffffff';
        ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
      // planet
      ctx.fillStyle = '#12204d';
      ctx.beginPath(); ctx.arc(cam.w * 0.2, cam.h * 0.2, 60, 0, 6.29); ctx.fill();
      ctx.strokeStyle = '#7fd4ff'; ctx.globalAlpha = 0.4; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(cam.w * 0.2, cam.h * 0.2, 92, 26, -0.4, 0, 6.29); ctx.stroke(); ctx.globalAlpha = 1;
      // station beams
      ctx.strokeStyle = 'rgba(127,212,255,0.18)'; ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(cam.w * (0.06 + i * 0.13), cam.h * 0.8);
        ctx.lineTo(cam.w * (0.02 + i * 0.14), cam.h); ctx.stroke();
      }
    },
    alley(ctx, t, cam) {
      const g = ctx.createLinearGradient(0, 0, 0, cam.h);
      g.addColorStop(0, '#060409'); g.addColorStop(0.8, '#160e22'); g.addColorStop(1, '#200f18');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
      // brick texture
      ctx.strokeStyle = 'rgba(120,80,160,0.10)'; ctx.lineWidth = 2;
      for (let y = 0; y < cam.h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cam.w, y); ctx.stroke(); }
      for (let x = 0; x < cam.w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cam.h); ctx.stroke(); }
      // neon signs
      const signs = [[0.15, 0.18, '#ff2d2d', 'FIGHT'], [0.62, 0.24, '#2d9cff', 'ARENA'], [0.85, 0.12, '#ffd700', '24H']];
      for (const [fx, fy, col, txt] of signs) {
        const sx = cam.w * fx + Math.sin(t * 2 + fx * 9) * 6, sy = cam.h * fy;
        ctx.save();
        ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
        ctx.shadowColor = col; ctx.shadowBlur = 16;
        ctx.fillStyle = col; ctx.globalAlpha = 0.85 + Math.sin(t * 3 + fx * 9) * 0.15;
        ctx.fillText(txt, sx, sy);
        ctx.restore();
      }
    },
    club(ctx, t, cam) {
      const g = ctx.createLinearGradient(0, 0, 0, cam.h);
      g.addColorStop(0, '#05020a'); g.addColorStop(0.8, '#140a24'); g.addColorStop(1, '#1c0a2a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
      // rotating spotlights
      for (let i = 0; i < 3; i++) {
        const a = t * 0.5 + i * 2.1;
        ctx.save();
        ctx.translate(cam.w * (0.2 + i * 0.3), 0);
        ctx.rotate(Math.sin(a) * 0.6);
        const lg = ctx.createLinearGradient(0, 0, 0, cam.h);
        lg.addColorStop(0, `rgba(${i === 1 ? '255,45,45' : i === 2 ? '255,45,212' : '45,156,255'},0.14)`);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(-80, 0); ctx.lineTo(80, 0); ctx.lineTo(520, cam.h); ctx.lineTo(-520, cam.h); ctx.fill();
        ctx.restore();
      }
      // crowd silhouettes
      ctx.fillStyle = '#0a0512';
      for (let i = 0; i < 60; i++) {
        const x = i * 30 + Math.sin(t * 2 + i) * 4;
        ctx.beginPath();
        ctx.arc(x, cam.h * 0.155, 8, 0, 6.29);
        ctx.arc(x + 7, cam.h * 0.21, 6, 0, 6.29);
        ctx.fill();
      }
      // bounce light
      const bl = ctx.createLinearGradient(0, cam.h * 0.75, 0, cam.h);
      bl.addColorStop(0, 'rgba(255,45,212,0)');
      bl.addColorStop(1, `rgba(255,45,212,${0.10 + Math.sin(t * 4) * 0.05})`);
      ctx.fillStyle = bl; ctx.fillRect(0, 0, cam.w, cam.h);
    },
  };

  /* ---------- draw the arena ---------- */
  function arenaBg(ctx, arenaCfg, t, cam) {
    const fn = bgDrawers[arenaCfg.theme] || bgDrawers.city;
    fn(ctx, t, cam);
  }

  function worldToScreen(cam, x, y) {
    return { x: cam.ox + x * cam.s, y: cam.oy + y * cam.s };
  }

  function drawArena(ctx, arenaCfg, cam, t, opts = {}) {
    const { lava } = opts;
    const s = cam.s;
    arenaBg(ctx, arenaCfg, t, cam);

    // platforms
    for (const pl of arenaCfg.platforms) {
      const cx = pl.cx || pl.x * W, cy = pl.cy || pl.y * FLOOR_Y, hw = pl.hw || (pl.w * W) / 2;
      const p = worldToScreen(cam, cx, cy);
      const pw = hw * 2 * s, ph = 18 * s;
      ctx.save();
      const g = ctx.createLinearGradient(0, p.y - ph, 0, p.y);
      g.addColorStop(0, '#2a3357'); g.addColorStop(1, '#141a33');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - pw / 2, p.y - ph, pw, ph);
      // neon top edge
      ctx.shadowColor = arenaCfg.neon; ctx.shadowBlur = 14;
      ctx.fillStyle = arenaCfg.neon;
      ctx.fillRect(p.x - pw / 2, p.y - ph, pw, 3);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // floor: perspective trapezoid + grid
    const f0 = worldToScreen(cam, 0, FLOOR_Y);
    const f1 = worldToScreen(cam, W, FLOOR_Y);
    const bottom = cam.oy + 1040 * cam.s;
    ctx.save();
    const fg = ctx.createLinearGradient(0, f0.y, 0, bottom);
    fg.addColorStop(0, '#171d38'); fg.addColorStop(1, '#0b0e1f');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(f0.x - 40 * s, f0.y);
    ctx.lineTo(f1.x + 40 * s, f0.y);
    ctx.lineTo(cam.w + 40, bottom);
    ctx.lineTo(-40, bottom);
    ctx.closePath();
    ctx.fill();
    // neon horizon line
    ctx.shadowColor = arenaCfg.neon; ctx.shadowBlur = 12;
    ctx.fillStyle = arenaCfg.neon; ctx.globalAlpha = 0.8;
    ctx.fillRect(f0.x - 40 * s, f0.y - 2, f1.x - f0.x + 80 * s, 3);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    // perspective grid
    ctx.strokeStyle = 'rgba(120,140,220,0.16)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      const gx = SFA.lerp(f0.x, f1.x, i / 10);
      ctx.beginPath(); ctx.moveTo(gx, f0.y); ctx.lineTo(SFA.lerp(0, cam.w, i / 10), bottom); ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      const gy = SFA.lerp(f0.y, bottom, i / 6);
      ctx.beginPath(); ctx.moveTo(f0.x, gy); ctx.lineTo(f1.x, gy); ctx.stroke();
    }
    ctx.restore();

    // lava
    if (lava !== undefined) {
      const ly = worldToScreen(cam, 0, lava).y;
      const lg = ctx.createLinearGradient(0, ly - 30, 0, bottom);
      lg.addColorStop(0, 'rgba(255,90,45,0.0)');
      lg.addColorStop(0.25, 'rgba(255,90,45,0.75)');
      lg.addColorStop(1, 'rgba(255,45,45,0.9)');
      ctx.fillStyle = lg;
      ctx.fillRect(-10, ly, cam.w + 20, bottom - ly);
      // bubbles
      for (let i = 0; i < 24; i++) {
        const bx = ((i * 137.5 + t * 40) % cam.w);
        const by = ly + ((i * 53.7 + t * 60) % (bottom - ly - 10));
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = i % 3 === 0 ? '#ffd700' : '#ff8a2d';
        ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- draw particles / floaters (screen space) ---------- */
  function updateParticles(dt, cam) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t > p.life) parts.splice(i, 1);
    }
  }
  function drawParticles(ctx, cam) {
    for (const p of parts) {
      const sp = worldToScreen(cam, p.x, p.y);
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.arc(sp.x, sp.y, p.size * a + 0.5, 0, 6.29); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  function updateFloaters(dt, cam) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt; f.y += f.vy * dt; f.vy *= 0.96;
      if (f.t > f.life) floaters.splice(i, 1);
    }
  }
  function drawFloaters(ctx, cam) {
    for (const f of floaters) {
      const sp = worldToScreen(cam, f.x, f.y);
      const a = 1 - f.t / f.life;
      const pop = f.t < 0.12 ? f.t / 0.12 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 ${f.size * pop}px 'Arial Black', Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = f.color; ctx.shadowBlur = 18;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sp.x, sp.y);
      ctx.restore();
    }
  }

  /* ---------- hit / event effects ---------- */
  function onEvent(ev, arenaCfg, shake) {
    const d = ev.data || {};
    switch (ev.kind) {
      case 'hit': {
        const colors = HIT_COLORS[d.kind] || HIT_COLORS.light;
        spawn(d.x, d.y, { n: d.kind === 'heavy' ? 18 : d.kind === 'ult' ? 30 : 10, color: (i) => colors[i % colors.length], speed: 220 + (d.power || 0) * 80, up: 120 });
        if (d.power > 0.4) shake.add(d.power);
        break;
      }
      case 'block': spawn(d.x, d.y, { n: 10, color: HIT_COLORS.block, speed: 260, up: 80 }); shake.add(0.3); break;
      case 'attackfx': spawn(d.x, d.y, { n: 4, color: '#ffffff', speed: 160 }); break;
      case 'land': spawn(d.x, d.y, { n: 6, color: HIT_COLORS.land, speed: 100, up: 20, grav: 300 }); break;
      case 'jump': spawn(d.x, d.y + 8, { n: 5, color: HIT_COLORS.land, speed: 80, up: 10, grav: 200 }); break;
      case 'dash': spawn(d.x, d.y, { n: 8, color: '#9df3ff', speed: 120, up: 30, grav: 200 }); break;
      case 'wall': spawn(d.x, d.y, { n: 12, color: '#ffd700', speed: 200, up: 60 }); shake.add(0.7); break;
      case 'lava': spawn(d.x, d.y, { n: 22, color: HIT_COLORS.lava, speed: 260, up: 200, grav: 300 }); shake.add(1.6); break;
      case 'slam':
      case 'blast': {
        spawn(d.x, d.y, { n: 26, color: ['#ffd700', '#ff8a2d', '#ffffff'], speed: 340, up: 100 });
        const ring = { x: d.x, y: d.y, r: 0, max: d.r || 260, life: 0.4, t: 0 };
        rings.push(ring);
        shake.add(2.6);
        break;
      }
      case 'freeze': spawn(d.x, d.y, { n: 18, color: HIT_COLORS.freeze, speed: 200, up: 60 }); break;
      case 'poison': spawn(d.x, d.y, { n: 14, color: HIT_COLORS.poison, speed: 140, up: 40 }); break;
      case 'wave': spawn(d.x, d.y, { n: 10, color: HIT_COLORS.wave, speed: 160, up: 30 }); break;
      case 'blink': {
        spawn(d.x, d.y, { n: 16, color: ['#8a5cff', '#b79bff', '#ffffff'], speed: 260 });
        const ring = { x: d.x, y: d.y, r: 0, max: 120, life: 0.3, t: 0 };
        rings.push(ring);
        break;
      }
      case 'ko': {
        spawn(d.x, d.y, { n: 40, color: ['#ffd700', '#ff2d2d', '#ffffff', '#ff8a2d'], speed: 420, up: 160 });
        const ring = { x: d.x, y: d.y, r: 0, max: 320, life: 0.6, t: 0 };
        rings.push(ring);
        shake.add(3.2);
        break;
      }
      case 'rage': spawn(d.x, d.y, { n: 24, color: ['#ff2d2d', '#ff8c2d'], speed: 300, up: 120 }); break;
      case 'berserk': spawn(d.x, d.y, { n: 20, color: ['#ff2d2d', '#ffd700'], speed: 260, up: 100 }); break;
      case 'special': {
        const col = { uppercut: '#ff8a2d', dash: '#ffe14d', slam: '#c9d1d9', poison: '#3ddc67', freeze: '#4dc9ff', phase: '#9ae6e0', wave: '#7fd4ff', teleport: '#8a5cff' }[d.kind] || '#c77dff';
        spawn(d.x, d.y, { n: 20, color: col, speed: 300, up: 100 });
        const ring = { x: d.x, y: d.y, r: 0, max: 140, life: 0.35, t: 0, color: col };
        rings.push(ring);
        shake.add(0.8);
        break;
      }
      case 'ult': {
        const col = { rapid: '#8a5cff', aoe: '#ff2d2d', storm: '#ffe14d', berserk: '#ff2d2d', iceage: '#4dc9ff', possess: '#9ae6e0', tornado: '#7fd4ff' }[d.kind] || '#ffffff';
        spawn(d.x, d.y, { n: 34, color: col, speed: 380, up: 140 });
        const ring = { x: d.x, y: d.y, r: 0, max: 220, life: 0.5, t: 0, color: col };
        rings.push(ring);
        shake.add(2.2);
        break;
      }
      case 'grab': spawn(d.x, d.y, { n: 8, color: '#ffffff', speed: 140 }); break;
      case 'throw': spawn(d.x, d.y, { n: 12, color: '#ffd700', speed: 240, up: 60 }); shake.add(1.0); break;
      case 'possess': {
        spawn(d.x, d.y, { n: 22, color: ['#9ae6e0', '#ffffff'], speed: 240, up: 80 });
        const ring = { x: d.x, y: d.y, r: 0, max: 200, life: 0.5, t: 0, color: '#9ae6e0' };
        rings.push(ring);
        break;
      }
    }
  }

  const rings = [];
  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt; r.r = (r.t / r.life) * r.max;
      if (r.t > r.life) rings.splice(i, 1);
    }
  }
  function drawRings(ctx, cam) {
    for (const r of rings) {
      const sp = worldToScreen(cam, r.x, r.y);
      const a = 1 - r.t / r.life;
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = r.color || '#ffffff';
      ctx.lineWidth = 5 * a + 1;
      ctx.shadowColor = r.color || '#ffffff'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r.r * cam.s, 0, 6.29); ctx.stroke();
      ctx.restore();
    }
  }

  return {
    W, FLOOR_Y, makeCam, worldToScreen, drawArena, drawArenaBg: arenaBg,
    spawn, parts, drawParticles, updateParticles,
    floater, floaters, drawFloaters, updateFloaters,
    onEvent, rings, updateRings, drawRings,
  };
});
