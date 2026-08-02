/* ============================================================
   Landing page — live hero demo
   Runs the REAL simulation in-browser: two bots fight forever
   on the hero canvas using the same engine as the server.
   ============================================================ */
(function () {
  'use strict';
  const canvas = SFA.$('#hero');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { draw: drawStickman } = SFAStickman;
  const AR = SFARender;
  const { Sim, Bot } = SFASim;

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * DPR;
    canvas.height = r.height * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // menu music once the user interacts (browser autoplay policy)
  window.addEventListener('pointerdown', () => {
    SFAAudio.init();
    SFAAudio.music.start('menu');
  }, { once: true });

  let sim = new Sim('city', 'blaze', 'shadow');
  let b0 = new Bot(0, 0.75), b1 = new Bot(1, 0.75);
  let shake = 0, clock = 0;
  let snap = sim.snapshot();

  setInterval(() => {
    for (const b of [b0, b1]) {
      const f = sim.f[b.p];
      if (['idle', 'walk', 'run', 'air', 'jump', 'block', 'crouch', 'hitstun', 'special', 'attack', 'charge'].includes(f.st)) {
        const { inp, acts } = b.think(sim);
        sim.setInputs(b.p, inp);
        for (const a of acts) sim.queueAction(b.p, a.name, a.data);
      }
    }
    sim.tick(1 / 60);
    for (const ev of sim.events.splice(0)) {
      AR.onEvent(ev, sim.arena.cfg, { add: (p) => { shake = Math.min(12, shake + p * 4); } });
      // demo SFX (quiet): hits, specials, KOs
      const s = { hit: 'light', special: 'special', ult: 'ult', ko: 'ko', throw: 'throw', wave: 'wave', freeze: 'freeze', rage: 'rage', dash: 'dash' }[ev.kind];
      if (s && Math.random() < 0.7) SFAAudio.play(s);
      if (ev.kind === 'roundend') { setTimeout(() => { if (sim.status === 'roundend') sim.nextRound(); }, 2200); }
      if (ev.kind === 'matchend') {
        setTimeout(() => {
          sim = new Sim(SFA.ARENA_ORDER[(Math.random() * 6) | 0], SFA.CHAR_ORDER[(Math.random() * 8) | 0], SFA.CHAR_ORDER[(Math.random() * 8) | 0]);
          b0 = new Bot(0, 0.75); b1 = new Bot(1, 0.75);
          snap = sim.snapshot();
        }, 2600);
      }
    }
    snap = sim.snapshot();
  }, 1000 / 60);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    shake = Math.max(0, shake - dt * 26);

    const r = canvas.getBoundingClientRect();
    const cw = r.width, ch = r.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    const cam = AR.makeCam(cw, ch);
    AR.drawArena(ctx, sim.arena.cfg, cam, now / 1000, { lava: undefined });
    const fs = snap.f.map(f => ({ ...f, poseT: clock }));
    fs.sort((a, b) => a.y - b.y);
    for (const f of fs) {
      const c = SFA.CHAR[f.char];
      const scale = cam.s * (1 + (AR.FLOOR_Y - f.y) / AR.FLOOR_Y * 0.28) * 1.15;
      drawStickman(ctx, f, c, { p: f.p, scale, alpha: 1, glowColor: f.p === 0 ? '#ff2d2d' : '#2d9cff' });
    }
    AR.updateParticles(dt, cam);
    AR.updateRings(dt);
    AR.updateFloaters(dt, cam);
    AR.drawParticles(ctx, cam);
    AR.drawRings(ctx, cam);
    AR.drawFloaters(ctx, cam);

    // overlay banner on KO
    if (snap.status === 'roundend') {
      ctx.save();
      ctx.font = '900 40px Orbitron, Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#fff';
      ctx.fillText('K.O.!', cw / 2, ch * 0.4);
      ctx.restore();
    }
    ctx.restore();
  }
  requestAnimationFrame(frame);

  /* ---------- leaderboard ---------- */
  fetch('/api/leaderboard').then(r => r.json()).then(lb => {
    const wrap = SFA.$('#lbWrap');
    if (!wrap) return;
    if (!lb || !lb.total) {
      wrap.innerHTML = '<div style="text-align:center;color:var(--muted);letter-spacing:2px;font-size:13px;padding:24px;">No matches recorded yet — <b style="color:var(--gold)">host a game</b> and make history</div>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    wrap.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' +
      lb.top.map((p, i) => `
        <div style="display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 18px;">
          <span style="font-size:20px;width:32px;text-align:center;">${medals[i] || i + 1}</span>
          <span style="flex:1;font-family:var(--font-head);font-size:14px;letter-spacing:2px;">${SFA.esc(p.name)}</span>
          <span style="color:var(--gold);font-family:var(--font-head);font-weight:700;">${p.wins}<span style="color:var(--muted);font-weight:400;font-size:11px;">W</span></span>
          <span style="color:var(--muted);font-family:var(--font-head);font-size:12px;">${p.losses}L</span>
          <span style="color:var(--p2);font-family:var(--font-head);font-size:12px;">${p.winrate}%</span>
          <span style="color:var(--muted);font-size:11px;">💥${p.kos} · ⚡${p.dmg}</span>
        </div>`).join('') +
      '</div>';
  }).catch(() => {});
})();
