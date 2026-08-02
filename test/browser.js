/* Browser E2E: real Chrome — host a game on PC page, join from phone page, fight */
'use strict';
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const PORT = 3200;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), ROUND_SECONDS: '20' }, cwd: __dirname + '/..' });
srv.stdout.on('data', () => {});
srv.stderr.on('data', () => {});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ERRORS = [];

(async () => {
  await sleep(1500);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const pc = await browser.newPage();
  pc.on('console', m => {
    if (m.type() === 'error') ERRORS.push('[pc] ' + m.text().slice(0, 200));
    if (m.text().startsWith('[HUD]')) console.log('   ' + m.text());
  });
  pc.on('pageerror', e => ERRORS.push('[pc pageerror] ' + String(e).slice(0, 200)));
  await pc.setViewport({ width: 1440, height: 860 });

  // 1. LANDING PAGE
  await pc.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(3500);
  const heroOk = await pc.evaluate(() => {
    const c = document.querySelector('#hero');
    if (!c) return false;
    const w = c.width, h = c.height;
    const d = c.getContext('2d').getImageData(0, 0, w, h).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 997) if (d[i] > 25 || d[i + 1] > 25 || d[i + 2] > 25) lit++;
    return { lit, total: Math.floor(d.length / 997), w, h };
  });
  console.log((heroOk && heroOk.lit > 5 ? '✅' : '❌') + ` landing hero demo renders (${heroOk.lit}/${heroOk.total} sample pixels lit)`);
  await pc.screenshot({ path: 'shots/01-landing.png' });
  console.log('   shot: shots/01-landing.png');

  // 2. HOST GAME (PC)
  await pc.goto(`http://localhost:${PORT}/game`, { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(1800);
  const lobby = await pc.evaluate(() => {
    const code = document.querySelector('.lobby-code') && document.querySelector('.lobby-code').textContent.trim();
    const qr = document.querySelector('.lobby-qr img');
    return { code, hasQr: !!qr, screen: [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'))?.id };
  });
  console.log((lobby.code && /^[A-Z]{3}-\d{3}$/.test(lobby.code) ? '✅' : '❌') + ' lobby shows room code: ' + lobby.code);
  console.log((lobby.hasQr ? '✅' : '❌') + ' QR code rendered on PC');
  await pc.screenshot({ path: 'shots/02-lobby.png' });
  console.log('   shot: shots/02-lobby.png');

  // 3. PHONE: pairing + join
  const phone = await browser.newPage();
  phone.on('console', m => { if (m.type() === 'error') ERRORS.push('[phone] ' + m.text().slice(0, 200)); });
  phone.on('pageerror', e => ERRORS.push('[phone pageerror] ' + String(e).slice(0, 200)));
  await phone.setViewport({ width: 400, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phone.goto(`http://localhost:${PORT}/mobile.html`, { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(3400); // splash
  await phone.screenshot({ path: 'shots/03-phone-home.png' });
  console.log('   shot: shots/03-phone-home.png');
  await phone.evaluate(() => document.querySelector('#joinBtn').click());
  await sleep(600);
  await phone.evaluate((c) => {
    const inp = document.querySelector('#codeInput');
    inp.value = c;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, lobby.code);
  await phone.evaluate(() => document.querySelector('#enterBtn').click());
  await sleep(1500);

  // 4. PHONE 2: join as P2
  const phone2 = await browser.newPage();
  phone2.on('console', m => { if (m.type() === 'error') ERRORS.push('[phone2] ' + m.text().slice(0, 200)); });
  phone2.on('pageerror', e => ERRORS.push('[phone2 pageerror] ' + String(e).slice(0, 200)));
  await phone2.setViewport({ width: 400, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phone2.goto(`http://localhost:${PORT}/mobile.html`, { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(3400);
  await phone2.evaluate(() => document.querySelector('#joinBtn').click());
  await sleep(600);
  await phone2.evaluate((c) => {
    const inp = document.querySelector('#codeInput');
    inp.value = c;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, lobby.code);
  await phone2.evaluate(() => document.querySelector('#enterBtn').click());
  await sleep(1200);

  const csState = await pc.evaluate(() => {
    const active = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'));
    return active ? active.id : 'none';
  });
  console.log((csState === 'charselect' ? '✅' : '❌') + ' PC screen switched to charselect (got: ' + csState + ')');

  // 5. both phones pick characters
  await phone.evaluate(() => {
    document.querySelectorAll('#csGrid .cs-card')[0].click(); // SHADOW
  });
  await sleep(300);
  await phone.evaluate(() => document.querySelector('#lockBtn').click());
  await phone2.evaluate(() => {
    document.querySelectorAll('#csGrid .cs-card')[1].click(); // BLAZE
  });
  await sleep(300);
  await phone2.evaluate(() => document.querySelector('#lockBtn').click());
  await sleep(600);
  await pc.screenshot({ path: 'shots/04-charselect.png' });
  console.log('   shot: shots/04-charselect.png');

  // 6. START
  await pc.evaluate(() => {
    window.__lastSnap = null;
    window.SFA.sock.on('match:state', s => { window.__lastSnap = s; });
  });
  await pc.evaluate(() => document.querySelector('#startBtn').click());
  await sleep(1500);
  await pc.screenshot({ path: 'shots/05-countdown.png' });
  const hudOn = await pc.evaluate(() => document.querySelector('#hud').classList.contains('active'));
  console.log((hudOn ? '✅' : '❌') + ' HUD active during countdown');

  // 7. FIGHT! — drive the phones: joystick toward enemy + tap attacks
  const drive = (page, dir) => {
    let probeShown = false;
    const timer = setInterval(async () => {
      try {
        const probe = await page.evaluate((d) => {
          // pointer-event path (UI coverage)
          const zl = document.querySelector('#zoneLeft');
          const r = zl.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const dx = d === 'L' ? 60 : -60;
          zl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: cx, clientY: cy }));
          zl.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: cx + dx, clientY: cy }));
          const btn = document.querySelector(d === 'L' ? '#btnA' : '#btnB');
          if (btn) {
            btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, pointerType: 'touch' }));
            btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8, pointerType: 'touch' }));
          }
          // socket path fallback (guaranteed gameplay)
          let emitOk = false;
          if (window.SFA.sock) { window.SFA.sock.emit('input', { ax: d === 'L' ? 1 : -1, ay: 0, held: {} }); emitOk = true; }
          if (Math.random() < 0.3) window.SFA.sock && window.SFA.sock.emit('action', { name: d === 'L' ? 'A' : 'B' });
          return {
            sock: !!window.SFA.sock,
            conn: window.SFA.sock ? window.SFA.sock.connected : false,
            emitOk,
            pname: document.querySelector('#cPname').textContent,
            active: [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'))?.id,
          };
        }, dir);
        if (!probeShown) { probeShown = true; console.log('   [drive] ' + dir + ':', JSON.stringify(probe)); }
      } catch (e) { console.log('   [drive] ' + dir + ' ERROR:', String(e).slice(0, 120)); }
    }, 500);
    return timer;
  };
  const t1 = drive(phone, 'L');
  const t2 = drive(phone2, 'R');

  await sleep(9000); // fight a while
  const state = await pc.evaluate(() => {
    const hp = document.querySelector('#hp1').style.width;
    const hp2 = document.querySelector('#hp2').style.width;
    const f = document.querySelector('#arenaCanvas');
    const px = f.getContext('2d').getImageData(0, 0, 8, 8).data;
    const snap = window.__lastSnap;
    return {
      hp, hp2, pixels: px.some(v => v > 0), timer: document.querySelector('#timer').textContent,
      roundLabel: document.querySelector('#roundLabel').textContent,
      snapsLen: window.__debugSnaps ? window.__debugSnaps.length : -1,
      lastSnapTick: window.__debugSnaps && window.__debugSnaps.length ? window.__debugSnaps[window.__debugSnaps.length - 1].snap.tick : -1,
      probeTick: snap ? snap.tick : -1,
      snap: snap ? { status: snap.status, round: snap.round, f: snap.f.map(x => ({ x: x.x, st: x.st, hp: x.hp })) } : null,
    };
  });
  console.log('   probe:', JSON.stringify({ ...state.snap, snapsLen: state.snapsLen, lastSnapTick: state.lastSnapTick, probeTick: state.probeTick, timer: state.timer, roundLabel: state.roundLabel }));
  console.log((parseFloat(state.hp) < 100 || parseFloat(state.hp2) < 100 ? '✅' : '❌') + ` fight damage happening (P1 HP ${state.hp}, P2 HP ${state.hp2})`);
  console.log((state.pixels ? '✅' : '❌') + ' arena canvas rendering');
  await pc.screenshot({ path: 'shots/06-fight.png' });
  console.log('   shot: shots/06-fight.png');
  await phone.screenshot({ path: 'shots/07-phone-controller.png' });
  console.log('   shot: shots/07-phone-controller.png');

  // controller visual check
  const ctrl = await phone.evaluate(() => {
    const active = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'));
    const hpBar = document.querySelector('#cHp').style.width;
    return { screen: active ? active.id : 'none', hp: hpBar };
  });
  console.log((ctrl.screen === 'controller' ? '✅' : '❌') + ' phone shows controller screen (got: ' + ctrl.screen + ')');

  // 7b. SPECTATOR joins mid-fight and reacts
  const spec = await browser.newPage();
  spec.on('pageerror', e => ERRORS.push('[spec pageerror] ' + String(e).slice(0, 200)));
  await spec.setViewport({ width: 400, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await spec.goto(`http://localhost:${PORT}/mobile.html`, { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(3400);
  await spec.evaluate(() => document.querySelector('#joinBtn').click());
  await sleep(400);
  await spec.evaluate((c) => {
    const inp = document.querySelector('#codeInput');
    inp.value = c;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, lobby.code);
  await spec.evaluate(() => document.querySelector('#enterBtn').click());
  await sleep(1500);
  const specState = await spec.evaluate(() => {
    const active = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'));
    const hp1 = document.querySelector('#specHp1').style.width;
    return { screen: active ? active.id : 'none', hp1 };
  });
  console.log((specState.screen === 'spectate' ? '✅' : '❌') + ' spectator joins mid-fight (screen: ' + specState.screen + ', P1 HP bar: ' + specState.hp1 + ')');
  await spec.evaluate(() => document.querySelector('.spec-emo').click()); // reaction
  await sleep(600);
  await spec.screenshot({ path: 'shots/09-spectator.png' });
  console.log('   shot: shots/09-spectator.png');
  await spec.close();

  clearInterval(t1); clearInterval(t2);

  // 8. keep fighting until match ends (max 90s)
  let ended = false;
  const endT = Date.now();
  while (Date.now() - endT < 90000) {
    const r = await pc.evaluate(() => { const el = document.querySelector('#result'); return el ? el.classList.contains('active') : false; });
    if (r) { ended = true; break; }
    await sleep(1500);
  }
  console.log((ended ? '✅' : '❌') + ' match reached result screen');
  if (ended) {
    await pc.screenshot({ path: 'shots/08-result.png' });
    const resInfo = await pc.evaluate(() => ({
      statsLen: document.querySelector('#resStats').innerHTML.length,
      score: document.querySelector('#resScore').textContent,
      lbHint: document.querySelector('#resLbHint').textContent.slice(0, 90),
    }));
    console.log((resInfo.statsLen > 80 ? '✅' : '❌') + ` result screen shows match stats (${resInfo.statsLen} chars)`);
    console.log('   score: ' + resInfo.score + ' | ' + resInfo.lbHint);

    // 8b. REPLAY playback
    const replayBtn = await pc.evaluate(() => {
      const b = document.querySelector('#replayBtn');
      if (b && b.style.display !== 'none') { b.click(); return true; }
      return false;
    });
    if (replayBtn) {
      await sleep(2000);
      const rp = await pc.evaluate(() => ({
        bar: document.querySelector('#replayBar').classList.contains('show'),
        time: document.querySelector('#rpTime').textContent,
        canvasPx: (() => { const c = document.querySelector('#arenaCanvas'); const d = c.getContext('2d').getImageData(0, 0, 8, 8).data; return d.some(v => v > 0); })(),
      }));
      console.log((rp.bar && rp.canvasPx ? '✅' : '❌') + ` replay playback running (${rp.time})`);
      await pc.screenshot({ path: 'shots/10-replay.png' });
      console.log('   shot: shots/10-replay.png');
      await pc.evaluate(() => document.querySelector('#rpExit').click());
      await sleep(400);
    } else {
      console.log('❌ replay button not available on result screen');
    }
  }

  // 9. console errors
  const realErrors = ERRORS.filter(e => !e.includes('favicon') && !e.includes('Autoplay') && !e.includes('deviceorientation') && !e.includes('navigator.vibrate'));
  console.log((realErrors.length === 0 ? '✅' : '❌') + ` zero JS console errors (${realErrors.length} found)`);
  for (const e of realErrors.slice(0, 10)) console.log('   ', e);

  await browser.close();
  srv.kill();
  process.exit(realErrors.length ? 1 : 0);
})().catch(e => { console.error('BROWSER TEST CRASH:', e); srv.kill(); process.exit(1); });
