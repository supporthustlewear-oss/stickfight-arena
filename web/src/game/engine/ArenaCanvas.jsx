/* ============================================================
   ArenaCanvas — the fight canvas (React wrapper around the
   classic renderer: arena themes, IK stickmen, particles,
   screen shake, projectiles, replay support)
   ============================================================ */
import React, { useEffect, useRef } from 'react';
import { store } from '../net.js';

const AR = () => window.SFARender;
const drawStickman = (ctx, f, c, o) => window.SFAStickman.draw(ctx, f, c, o);

export default function ArenaCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = innerWidth * DPR;
      canvas.height = innerHeight * DPR;
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    let raf;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      store.poseClock += dt;
      if (store.hitstop > 0) { store.hitstop -= dt; return; }
      store.shake = Math.max(0, store.shake - dt * 30);

      const cw = innerWidth, ch = innerHeight;
      const cam = AR().makeCam(cw, ch);
      const arenaCfg = window.SFA.ARENA[store.arenaId] || window.SFA.ARENA.city;

      ctx.save();
      if (store.shake > 0.3) ctx.translate((Math.random() - 0.5) * store.shake, (Math.random() - 0.5) * store.shake);
      AR().drawArena(ctx, arenaCfg, cam, now / 1000, { lava: arenaCfg.lava ? AR().FLOOR_Y + 90 : undefined });

      // interpolated fighters
      const s1 = store.snaps[store.snaps.length - 1];
      const s0 = store.snaps.length > 1 ? store.snaps[store.snaps.length - 2] : null;
      let fighters = [];
      if (s1) {
        const f = s0 ? Math.min(1, Math.max(0, (now - s1.t) / Math.max(1, s1.t - s0.t))) : 1;
        fighters = s1.snap.f.map((sf, i) => {
          const pf = s0 ? s0.snap.f[i] : sf;
          const stChanged = pf.st !== sf.st;
          return {
            ...sf,
            x: window.SFA.lerp(pf.x, sf.x, f), y: window.SFA.lerp(pf.y, sf.y, f),
            vx: window.SFA.lerp(pf.vx, sf.vx, f), vy: window.SFA.lerp(pf.vy, sf.vy, f),
            hp: window.SFA.lerp(pf.hp, sf.hp, f), meter: window.SFA.lerp(pf.meter, sf.meter, f),
            stT: stChanged ? sf.stT : window.SFA.lerp(pf.stT, sf.stT, f),
            charge: window.SFA.lerp(pf.charge, sf.charge, f),
            poseT: store.poseClock,
          };
        });
      }
      fighters.sort((a, b) => a.y - b.y);
      const m = store.room ? (store.room.matchup || [0, 1]) : [0, 1];
      for (const f of fighters) {
        const c = window.SFA.CHAR[f.char];
        const scale = cam.s * (1 + (AR().FLOOR_Y - f.y) / AR().FLOOR_Y * 0.28) * 1.15;
        const alpha = f.vanish ? 0.25 : f.phase ? 0.55 : 1;
        drawStickman(ctx, f, c, { p: f.p, scale, alpha, glowColor: f.p === 0 ? '#ff2d2d' : '#2d9cff' });
        const sp = AR().worldToScreen(cam, f.x, f.y - 110 * scale / cam.s);
        ctx.save();
        ctx.font = '11px Orbitron, Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = f.p === 0 ? '#ff6a6a' : '#6ab8ff';
        ctx.shadowColor = f.p === 0 ? '#ff2d2d' : '#2d9cff';
        ctx.shadowBlur = 8;
        const nm = store.room ? (store.room.players[m[f.p]].name || 'P' + (m[f.p] + 1)) : 'P' + (f.p + 1);
        ctx.fillText(nm, sp.x, sp.y);
        ctx.restore();
      }
      // projectiles
      if (s1) for (const pr of s1.snap.proj) {
        const sp = AR().worldToScreen(cam, pr.x, pr.y);
        ctx.save();
        ctx.shadowColor = '#7fd4ff'; ctx.shadowBlur = 16;
        ctx.fillStyle = '#d9f6ff';
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, 35 * cam.s, 10 * cam.s, 0, 0, 6.29);
        ctx.fill();
        ctx.restore();
      }
      AR().updateParticles(dt, cam);
      AR().updateRings(dt);
      AR().updateFloaters(dt, cam);
      AR().drawParticles(ctx, cam);
      AR().drawRings(ctx, cam);
      AR().drawFloaters(ctx, cam);
      ctx.restore();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} id="arenaCanvas" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }} />;
}
