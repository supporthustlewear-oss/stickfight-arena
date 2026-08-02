/* E2E: TOURNAMENT mode (4 entrants, sequential bracket) + REPLAYS */
'use strict';
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3201;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), ROUND_SECONDS: '10', CLEANUP_MS: '1500' }, cwd: __dirname + '/..' });
srv.stdout.on('data', () => {});
srv.stderr.on('data', () => {});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 20000, step = 120) {
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
  let code = null;
  let roomStates = [];
  host.on('host:created', d => code = d.code);
  host.on('room:state', rs => roomStates.push(rs));
  host.emit('host:create', { origin: `http://localhost:${PORT}` });
  while (!code) await sleep(100);

  // toggle tournament
  const modeRes = await new Promise(res => host.emit('host:mode', 'tournament', res));
  check('tournament mode toggled', modeRes && modeRes.ok && modeRes.mode === 'tournament');

  // 1 human + 3 bots
  const p1 = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const j = await new Promise(res => p1.emit('join', { code, name: 'HERO' }, res));
  check('human joins as entrant', j.ok && j.slot === 0);
  for (const s of [1, 2, 3]) {
    const ok = await new Promise(res => host.emit('host:addBot', s, res));
    check(`bot fills slot ${s}`, ok && ok.ok);
  }

  const cs = await waitFor(() => roomStates.find(rs => rs.state === 'charselect'));
  check('auto charselect with 4 entrants', !!cs && cs.mode === 'tournament');

  p1.emit('char:select', 'volt');
  p1.emit('char:lock', true);
  await sleep(300);

  // bracket tracking
  const phases = [];
  host.on('tournament:update', ({ bracket }) => phases.push(bracket.phase));
  let done = null;
  host.on('tournament:done', d => done = d);

  let started = 0;
  host.on('match:start', () => started++);

  host.emit('host:start');

  // drive the human while its matches run
  let n = 0;
  const timer = setInterval(() => {
    n++;
    p1.emit('input', { ax: (n % 24) < 14 ? 1 : 0, ay: 0, held: {} });
    if (n % 10 === 0) p1.emit('action', { name: 'A' });
    if (n % 23 === 0) p1.emit('action', { name: 'B' });
  }, 50);

  check('sf1 match started', await waitFor(() => started >= 1, 8000));
  check('tournament reaches sf2', await waitFor(() => phases.includes('sf2'), 60000));
  check('tournament reaches final', await waitFor(() => phases.includes('final'), 90000));
  const champ = await waitFor(() => done, 120000);
  check('tournament finishes with champion', !!champ && [0, 1, 2, 3].includes(champ.champion));
  check('3 matches played total', started >= 3);
  console.log(`   phases seen: ${phases.join(' → ')} | champion: ${champ ? champ.championName : '?'} | matches: ${started}`);

  // replays published for each match
  clearInterval(timer);
  await sleep(500);
  const reps = await (await fetch(`http://localhost:${PORT}/api/replays`)).json();
  check('replays recorded for matches', Array.isArray(reps) && reps.length >= 3);
  const r0 = reps[0];
  check('replay has snapshots + events', r0 && r0.snaps > 100 && r0.events > 10);
  const full = await (await fetch(`http://localhost:${PORT}/api/replays/${encodeURIComponent(r0.id)}`)).json();
  check('replay fetch returns data', !!full && full.snaps.length === r0.snaps && full.events.some(e => e.kind === 'hit'));

  // leaderboard persisted to disk
  await sleep(1200);
  const lb = await (await fetch(`http://localhost:${PORT}/api/leaderboard`)).json();
  check('leaderboard has tournament results', lb.total >= 1);
  const fs = require('fs');
  const file = require('path').join(__dirname, '..', 'data', 'leaderboard.json');
  check('leaderboard persisted to file', fs.existsSync(file) && fs.statSync(file).size > 10);

  // cleanup
  host.disconnect(); p1.disconnect();
  await sleep(2500);
  const rooms = await (await fetch(`http://localhost:${PORT}/api/rooms`)).json();
  check('room cleaned up', rooms.length === 0);

  console.log(failures === 0 ? '\n🎉 TOURNAMENT/REPLAY TESTS PASSED' : `\n💥 ${failures} TEST(S) FAILED`);
  srv.kill();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASH:', e); srv.kill(); process.exit(1); });
