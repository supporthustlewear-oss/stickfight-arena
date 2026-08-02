import React, { useEffect, useRef, useState } from 'react';

/* Landing: live bot-vs-bot hero demo (real sim) + leaderboard */
export default function Landing() {
  const ref = useRef(null);
  const [lb, setLb] = useState(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * DPR;
      canvas.height = r.height * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // menu music on first interaction
    const unlock = () => {
      window.SFAAudio.init();
      window.SFAAudio.music.start('menu');
    };
    window.addEventListener('pointerdown', unlock, { once: true });

    // live demo: two bots fighting with the real sim
    let sim = new window.SFASim.Sim('city', 'blaze', 'shadow');
    let b0 = new window.SFASim.Bot(0, 0.75), b1 = new window.SFASim.Bot(1, 0.75);
    let shake = 0, snap = sim.snapshot();
    const tick = setInterval(() => {
      for (const b of [b0, b1]) {
        const f = sim.f[b.p];
        if (['idle', 'walk', 'run', 'air', 'jump', 'block', 'crouch', 'hitstun', 'special', 'attack', 'charge'].includes(f.st)) {
          const { inp, acts } = b.think(sim, b.p);
          sim.setInputs(b.p, inp);
          for (const a of acts) sim.queueAction(b.p, a.name, a.data);
        }
      }
      sim.tick(1 / 60);
      for (const ev of sim.events.splice(0)) {
        window.SFARender.onEvent(ev, sim.arena.cfg, { add: (p) => { shake = Math.min(12, shake + p * 4); } });
        const s = { hit: 'light', special: 'special', ult: 'ult', ko: 'ko', throw: 'throw', wave: 'wave', freeze: 'freeze', rage: 'rage', dash: 'dash' }[ev.kind];
        if (s && Math.random() < 0.7) window.SFAAudio.play(s);
        if (ev.kind === 'roundend') setTimeout(() => { if (sim.status === 'roundend') sim.nextRound(); }, 2200);
        if (ev.kind === 'matchend') setTimeout(() => {
          sim = new window.SFASim.Sim(window.SFA.ARENA_ORDER[(Math.random() * 6) | 0], window.SFA.CHAR_ORDER[(Math.random() * 8) | 0], window.SFA.CHAR_ORDER[(Math.random() * 8) | 0]);
          b0 = new window.SFASim.Bot(0, 0.75); b1 = new window.SFASim.Bot(1, 0.75);
          snap = sim.snapshot();
        }, 2600);
      }
      snap = sim.snapshot();
    }, 1000 / 60);

    let raf, last = performance.now(), clock = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; clock += dt;
      shake = Math.max(0, shake - dt * 26);
      const r = canvas.getBoundingClientRect();
      const cw = r.width, ch = r.height;
      ctx.clearRect(0, 0, cw, ch);
      ctx.save();
      if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      const cam = window.SFARender.makeCam(cw, ch);
      window.SFARender.drawArena(ctx, sim.arena.cfg, cam, now / 1000, {});
      const fs = snap.f.map(f => ({ ...f, poseT: clock }));
      fs.sort((a, b) => a.y - b.y);
      for (const f of fs) {
        const c = window.SFA.CHAR[f.char];
        const scale = cam.s * (1 + (window.SFARender.FLOOR_Y - f.y) / window.SFARender.FLOOR_Y * 0.28) * 1.15;
        window.SFAStickman.draw(ctx, f, c, { p: f.p, scale, alpha: 1, glowColor: f.p === 0 ? '#ff2d2d' : '#2d9cff' });
      }
      window.SFARender.updateParticles(dt, cam);
      window.SFARender.updateRings(dt);
      window.SFARender.updateFloaters(dt, cam);
      window.SFARender.drawParticles(ctx, cam);
      window.SFARender.drawRings(ctx, cam);
      window.SFARender.drawFloaters(ctx, cam);
      if (snap.status === 'roundend') {
        ctx.font = '900 40px Orbitron, Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 30;
        ctx.fillStyle = '#fff';
        ctx.fillText('K.O.!', cw / 2, ch * 0.4);
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(loop);

    // leaderboard
    fetch('/api/leaderboard').then(r => r.json()).then(setLb).catch(() => {});
    return () => {
      clearInterval(tick);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="landing-wrap">
      <div className="hero">
        <h1 className="logo">STICKFIGHT<span className="arena">A R E N A</span></h1>
        <div className="logo-sub">No Buttons. Just Brutality.</div>
        <canvas ref={ref} id="hero" className="hero-canvas" />
        <div className="hero-cta">
          <a href="/game"><button className="btn gold" style={{ fontSize: 17, padding: '18px 34px' }}>🎮 HOST GAME</button></a>
          <a href="/stickfight.apk" download><button className="btn p2" style={{ fontSize: 17, padding: '18px 34px' }}>📱 GET MOBILE APP (APK)</button></a>
        </div>
        <p className="hero-note">Scan QR → Connect → <b>Fight in 10 seconds.</b> Works on any browser. No login. No install.</p>
      </div>

      <section>
        <h2 className="section-title">HOW IT WORKS</h2>
        <div className="steps">
          {[['OPEN ON PC / TV', 'Open stickfightarena on any big screen browser.'],
            ['GRAB YOUR PHONE', 'Open the mobile controller app on your phone.'],
            ['SCAN QR / ENTER CODE', 'Pair with a memorable code like SKY-847 — or just scan.'],
            ['CHOOSE YOUR FIGHTER', '8 unique stickmen, each with specials & ultimates.'],
            ['FIGHT!', 'Your phone becomes a full fight pad: joystick, ABXY, gestures, haptics.']]
            .map(([t, d], i) => (
              <div className="step" key={t}><div className="num">{i + 1}</div><h3>{t}</h3><p>{d}</p></div>
            ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">FEATURES</h2>
        <div className="features">
          {[['⚡', 'REAL-TIME MULTIPLAYER', 'Socket.io with an authoritative 60Hz server simulation. Live ping display.'],
            ['🎮', 'PHONE = FIGHT PAD', 'Native Android app: joystick, ABXY, block/dash/special/grab, gestures, haptics.'],
            ['🥷', '8 STICKMAN FIGHTERS', 'Shadow, Blaze, Volt, Titan, Viper, Frost, Ghost, Storm — each with specials & ultimates.'],
            ['🌆', '6 ARENAS', 'Rooftop, dojo, volcano with lava, low-gravity space, bouncy alley, fight club.'],
            ['💥', 'DEEP COMBAT', 'Combos up to 3x LEGENDARY, perfect blocks, grabs, throws, juggles, meter specials.'],
            ['🏆', 'TOURNAMENTS + REPLAYS', '4-player brackets, match replays, persistent global leaderboard.']]
            .map(([ic, t, d]) => (
              <div className="feature" key={t}><div className="ic">{ic}</div><h3>{t}</h3><p>{d}</p></div>
            ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">🏆 GLOBAL LEADERBOARD</h2>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {!lb ? <div style={{ textAlign: 'center', color: 'var(--muted)', letterSpacing: 2, fontSize: 13, padding: 24 }}>loading…</div>
            : !lb.total ? <div style={{ textAlign: 'center', color: 'var(--muted)', letterSpacing: 2, fontSize: 13, padding: 24 }}>No matches recorded yet — <b style={{ color: 'var(--gold)' }}>host a game</b> and make history</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lb.top.map((p, i) => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 18px' }}>
                    <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{medals[i] || i + 1}</span>
                    <span style={{ flex: 1, fontFamily: 'var(--font-head)', fontSize: 14, letterSpacing: 2 }}>{p.name}</span>
                    <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-head)', fontWeight: 700 }}>{p.wins}<span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>W</span></span>
                    <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-head)', fontSize: 12 }}>{p.losses}L</span>
                    <span style={{ color: 'var(--p2)', fontFamily: 'var(--font-head)', fontSize: 12 }}>{p.winrate}%</span>
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>💥{p.kos} · ⚡{p.dmg}</span>
                  </div>
                ))}
              </div>}
        </div>
      </section>

      <footer>
        <div className="tag">STICKFIGHT ARENA</div>
        <div>Your phone is the controller. The screen is the ring.</div>
        <div style={{ marginTop: 6, opacity: 0.6 }}>React website · Node.js + Socket.io server · Native Android app (Java + Kotlin)</div>
      </footer>
    </div>
  );
}
