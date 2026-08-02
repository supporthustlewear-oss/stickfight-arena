/* Browser E2E: console mode — PC plays P1 with the KEYBOARD, bot is P2 */
'use strict';
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const PORT = 3205;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), ROUND_SECONDS: '14' }, cwd: __dirname + '/..' });
srv.stdout.on('data', () => {});
srv.stderr.on('data', () => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ERRORS = [];

(async () => {
  await sleep(1500);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pc = await browser.newPage();
  pc.on('console', m => { if (m.type() === 'error') ERRORS.push('[pc] ' + m.text().slice(0, 200)); });
  pc.on('pageerror', e => ERRORS.push('[pc pageerror] ' + String(e).slice(0, 200)));
  await pc.setViewport({ width: 1440, height: 860 });
  await pc.goto(`http://localhost:${PORT}/game`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  // bot on P2
  await pc.evaluate(() => document.querySelector('#bot1').click());
  await sleep(600);
  const lobbyHasQuickStart = await pc.evaluate(() => !!document.querySelector('#quickStartBtn'));
  console.log((lobbyHasQuickStart ? '✅' : '❌') + ' lobby has QUICK START (console flow)');

  // start + drive P1 with the keyboard (hold D to walk, tap J to punch)
  await pc.evaluate(() => {
    window.__lastSnap = null;
    window.SFA.sock.on('match:state', s => { window.__lastSnap = s; });
  });
  await pc.evaluate(() => document.querySelector('#quickStartBtn').click());
  await sleep(1200);
  let kt = 0;
  const kbDrive = setInterval(async () => {
    kt++;
    await pc.evaluate((n) => {
      const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
      const cycle = n % 20; // 200ms ticks
      if (cycle < 14) fire('KeyD', 'keydown'); else fire('KeyD', 'keyup');
      if (n % 5 === 2) { fire('KeyJ', 'keydown'); fire('KeyJ', 'keyup'); }
      if (n % 9 === 4) { fire('KeyK', 'keydown'); fire('KeyK', 'keyup'); }
    }, kt);
  }, 100);

  // watch for damage + movement via snapshots
  const t0 = Date.now();
  let damaged = false, moved = false, x0 = null;
  while (Date.now() - t0 < 60000) {
    const probe = await pc.evaluate(() => {
      const s = window.__lastSnap;
      return { hp2: document.querySelector('#hp2').style.width, x1: s ? s.f[0].x : null, st: s ? s.f[0].st : null };
    });
    if (x0 === null && probe.x1 !== null) x0 = probe.x1;
    if (probe.x1 !== null && Math.abs(probe.x1 - x0) > 120) moved = true;
    if (parseFloat(probe.hp2) < 99) { damaged = true; break; }
    if (moved && Date.now() - t0 > 8000 && !damaged) break; // if we can move, keep going for hits
    await sleep(700);
  }
  clearInterval(kbDrive);
  console.log((moved ? '✅' : '❌') + ' keyboard moved P1 (x ' + x0 + ' → ' + (await pc.evaluate(() => window.__lastSnap ? window.__lastSnap.f[0].x : '?')) + ')');
  console.log((damaged ? '✅' : '❌') + ' keyboard player damaged the bot (P2 HP < 99)');
  if (damaged) await pc.screenshot({ path: 'shots/14-console-keyboard.png' });

  const realErrors = ERRORS.filter(e => !e.includes('favicon') && !e.includes('vibrate'));
  console.log((realErrors.length === 0 ? '✅' : '❌') + ` zero JS console errors (${realErrors.length})`);
  await browser.close();
  srv.kill();
  process.exit(realErrors.length || !damaged ? 1 : 0);
})().catch(e => { console.error('KEYBOARD TEST CRASH:', e); srv.kill(); process.exit(1); });
