/* E2E test: boots the real server and plays a full match via socket.io-client */
'use strict';
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3199;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), CLEANUP_MS: '2000', ROUND_SECONDS: '12' }, cwd: __dirname + '/..' });
srv.stdout.on('data', () => {});
srv.stderr.on('data', () => {});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 10000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

let failures = 0;
const check = (name, cond) => {
  console.log((cond ? '✅' : '❌') + ' ' + name);
  if (!cond) failures++;
};

(async () => {
  await sleep(1500);

  const host = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  let createdState = null;
  let roomStates = [];
  host.on('host:created', d => createdState = d);
  host.on('room:state', rs => roomStates.push(rs));
  host.emit('host:create', { origin: `http://localhost:${PORT}` });
  const created = await waitFor(() => createdState, 8000);
  check('host creates room', /^[A-Z]{3}-\d{3}$/.test(createdState.code));
  const CODE = createdState.code;
  console.log('   room code:', CODE);

  const gotState = await waitFor(() => roomStates.find(rs => rs.qr));
  check('QR generated', !!gotState && gotState.qr.startsWith('data:image'));
  check('QR encodes deep link', !!gotState && gotState.qrUrl.includes('room=' + CODE));

  // --- join with case-insensitive code ---
  const p1 = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const p2 = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const j1 = await new Promise(res => p1.emit('join', { code: CODE.toLowerCase(), name: 'ALEX' }, res));
  check('P1 joins with lowercase code', j1.ok && j1.slot === 0);
  const jBad = await new Promise(res => p1.emit('join', { code: 'WRONG-000', name: 'X' }, res));
  check('bad code rejected', !jBad.ok);
  const j2 = await new Promise(res => p2.emit('join', { code: CODE, name: 'SAM' }, res));
  check('P2 joins', j2.ok && j2.slot === 1);

  const csState = await waitFor(() => roomStates.find(rs => rs.state === 'charselect'));
  check('auto-transition to charselect', !!csState);

  // --- characters + lock ---
  p1.emit('char:select', 'shadow');
  p1.emit('char:lock', true);
  p2.emit('char:select', 'blaze');
  p2.emit('char:lock', true);
  await sleep(250);

  // --- watch stream ---
  let snaps = 0, hits = 0, counts = 0, fightEvent = false, roundEnds = 0, matchEnd = false, kOs = 0;
  let lastStatus = '', matchEndData = null;
  host.on('match:state', (snap) => {
    snaps++;
    if (snap.status !== lastStatus) {
      lastStatus = snap.status;
      console.log(`   [status] ${snap.status} r=${snap.round} t=${snap.timer}s p1wins=${snap.p1wins} p2wins=${snap.p2wins} hp=${snap.f[0].hp}/${snap.f[1].hp}`);
    }
  });
  host.on('match:event', (ev) => {
    if (ev.kind === 'hit') hits++;
    if (ev.kind === 'count') counts++;
    if (ev.kind === 'fight') fightEvent = true;
    if (ev.kind === 'roundend') roundEnds++;
    if (ev.kind === 'ko') kOs++;
    if (ev.kind === 'matchend') matchEnd = true;
  });
  host.on('match:end', (d) => matchEndData = d);

  // --- start match ---
  let started = false;
  host.on('match:start', () => started = true);
  host.emit('host:start');
  check('match starts', await waitFor(() => started, 5000));

  // --- controller inputs flow: approach first, then brawl ---
  // NOTE: tick counter (n) used instead of float t modulo — float accumulation
  // breaks `t % 0.5 < 0.02` conditions.
  let n = 0;
  const inputTimer = setInterval(() => {
    n++;
    const t = n / 20; // seconds (50ms ticks)
    if (t < 2.5) {
      // close the distance
      p1.emit('input', { ax: 1, ay: 0, held: {} });
      p2.emit('input', { ax: -1, ay: 0, held: {} });
      return;
    }
    // in range: alternate approach + attack windows
    p1.emit('input', { ax: (n % 32) < 18 ? 1 : 0, ay: 0, held: {} });
    if (n % 10 === 0) p1.emit('action', { name: 'A' });
    if (n % 30 === 0) p1.emit('action', { name: 'Y' });
    if (n % 46 === 0) p1.emit('action', { name: 'X' });
    p2.emit('input', { ax: (n % 32) < 18 ? -1 : 0, ay: 0, held: {} });
    if (n % 11 === 0) p2.emit('action', { name: 'B' });
    if (n % 38 === 0) p2.emit('action', { name: 'grab' });
  }, 50);

  // --- latency ---
  let pongVal = null;
  p1.on('pong', ({ t }) => pongVal = Date.now() - t);
  p1.emit('ping', Date.now());
  const pong = await waitFor(() => pongVal, 5000);
  check('latency measured', pongVal !== null);

  await sleep(7000); // 3.4s countdown + ~3.6s of fighting
  check('snapshots streaming', snaps > 150);
  check('hit events flowing', hits > 5);
  check('countdown events', counts >= 3);
  check('FIGHT event', fightEvent);
  console.log(`   snaps=${snaps} hits=${hits} counts=${counts} KOs=${kOs}`);

  check('at least one round completes', await waitFor(() => roundEnds >= 1, 30000));
  check('match ends (best of 3)', await waitFor(() => matchEnd, 90000));

  // --- match stats + leaderboard ---
  const endData = await waitFor(() => matchEndData, 5000);
  check('match:end carries stats', !!endData && endData.stats && endData.stats.length === 2 && (endData.stats[0].dmg > 0 || endData.stats[1].dmg > 0));
  check('match:end carries score', !!endData && (endData.p1wins + endData.p2wins) >= 2 && (endData.p1wins === 2 || endData.p2wins === 2));
  const lb = await (await fetch(`http://localhost:${PORT}/api/leaderboard?all=1`)).json();
  check('leaderboard records both fighters', lb && lb.total >= 2 && lb.top.some(p => p.name === 'ALEX') && lb.top.some(p => p.name === 'SAM'));

  // --- rematch flow ---
  host.emit('host:rematch');
  await sleep(400);
  host.emit('host:start');
  check('rematch starts new sim', await waitFor(() => {
    const s = snaps;
    return new Promise(res => setTimeout(() => res(snaps > s + 10), 800));
  }, 6000));

  // --- spectator joins mid-fight ---
  const sp = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const js = await new Promise(res => sp.emit('join', { code: CODE, name: 'VIEWER' }, res));
  check('spectator mode works', js.ok && js.spectate === true);

  // --- room cleanup when empty ---
  clearInterval(inputTimer);
  host.disconnect(); p1.disconnect(); p2.disconnect(); sp.disconnect();
  const empty = await waitFor(async () => {
    const r = await fetch(`http://localhost:${PORT}/api/rooms`);
    return (await r.json()).length === 0;
  }, 8000);
  check('room cleaned up when empty', !!empty);

  console.log(failures === 0 ? '\n🎉 ALL TESTS PASSED' : `\n💥 ${failures} TEST(S) FAILED`);
  srv.kill();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASH:', e); srv.kill(); process.exit(1); });
