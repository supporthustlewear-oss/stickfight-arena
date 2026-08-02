/* Browser E2E: full 4-bot TOURNAMENT on the PC screen (no phones needed) */
'use strict';
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const PORT = 3204;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), ROUND_SECONDS: '8' }, cwd: __dirname + '/..' });
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

  // toggle tournament
  await pc.evaluate(() => document.querySelector('#modeBtn').click());
  await sleep(600);
  const slots = await pc.evaluate(() => [...document.querySelectorAll('.lobby-player')].filter(p => !p.classList.contains('hidden')).length);
  console.log((slots === 4 ? '✅' : '❌') + ` tournament lobby shows 4 slots (got ${slots})`);

  // add 4 bots
  for (let s = 0; s < 4; s++) {
    await pc.evaluate((i) => document.querySelector('#bot' + i).click(), s);
    await sleep(500);
  }
  await sleep(800);
  const cs = await pc.evaluate(() => {
    const active = [...document.querySelectorAll('.screen')].find(s => s.classList.contains('active'));
    const bracket = document.querySelector('#csBracket').textContent;
    return { screen: active ? active.id : 'none', bracket: bracket.slice(0, 60) };
  });
  console.log((cs.screen === 'charselect' ? '✅' : '❌') + ' charselect with bracket panel: ' + cs.bracket);
  await pc.screenshot({ path: 'shots/11-tournament-charselect.png' });

  // start
  await pc.evaluate(() => document.querySelector('#startBtn').click());
  await sleep(1500);

  // watch the whole tournament: poll room state via socket events stored on window
  await pc.evaluate(() => {
    window.__phases = [];
    window.__champ = null;
    window.SFA.sock.on('tournament:update', ({ bracket }) => window.__phases.push(bracket.phase));
    window.SFA.sock.on('tournament:done', (d) => { window.__champ = d.championName; });
  });

  const t0 = Date.now();
  let champ = null;
  while (Date.now() - t0 < 240000) {
    champ = await pc.evaluate(() => window.__champ);
    if (champ) break;
    await sleep(2000);
  }
  const phases = await pc.evaluate(() => window.__phases);
  console.log((champ ? '✅' : '❌') + ' tournament completed: champion = ' + champ);
  console.log('   phases: ' + phases.join(' → '));

  // result screen should show champion + bracket
  await sleep(1500);
  const res = await pc.evaluate(() => ({
    bracket: document.querySelector('#resBracket').textContent.slice(0, 80),
    stats: document.querySelector('#resStats').textContent.length,
  }));
  console.log((res.stats > 50 ? '✅' : '❌') + ' final result shows stats + bracket: ' + res.bracket);
  await pc.screenshot({ path: 'shots/12-tournament-final.png' });

  const realErrors = ERRORS.filter(e => !e.includes('favicon') && !e.includes('vibrate'));
  console.log((realErrors.length === 0 ? "✅" : "❌") + ` zero JS console errors (${realErrors.length})`);
  for (const e of realErrors.slice(0, 6)) console.log("   ERR:", e);
  await browser.close();
  srv.kill();
  process.exit(realErrors.length ? 1 : 0);
})().catch(e => { console.error('TOURNAMENT TEST CRASH:', e); srv.kill(); process.exit(1); });
