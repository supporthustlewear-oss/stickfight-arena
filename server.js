/* ============================================================
   STICKFIGHT ARENA — game server
   Node.js + Express + Socket.io
   - Room creation with memorable codes (XXX-123)
   - QR code generation for phone pairing
   - Authoritative 60Hz simulation, 30Hz state broadcast
   - Input relay with timestamps, latency measurement
   - Bot AI fill, room cleanup
   - 1v1 and 4-player TOURNAMENT modes (sequential bracket)
   - Match recording → replays (API + playback on PC)
   - Persistent leaderboard (data/leaderboard.json)
   ============================================================ */
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Sim, Bot } = require('./shared/sim.js');
const CFG = require('./shared/config.js');

const PORT = process.env.PORT || 3000;
const TICK_MS = 1000 / 60;
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I,L,O (readability)
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* Serve the React website first (/, /game), then legacy pages + assets */
const WEB_DIST = path.join(__dirname, 'web', 'dist');
if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
  app.use(express.static(WEB_DIST));
  app.get('/game', (req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  console.log('· React website mounted from', WEB_DIST);
}
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

/* ---------------- rooms ---------------- */
const rooms = new Map(); // code -> room

function genCode() {
  let code;
  do {
    const l = () => CODE_LETTERS[(Math.random() * CODE_LETTERS.length) | 0];
    const d = () => ((Math.random() * 10) | 0);
    code = `${l()}${l()}${l()}-${d()}${d()}${d()}`;
  } while (rooms.has(code));
  return code;
}
const normCode = (c) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const slotDef = (slot) => ({ slot, name: null, char: null, locked: false, connected: false, isBot: false, ping: 0, sockId: null });

function makeRoom(hostSock, hostOrigin) {
  const code = genCode();
  const room = {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    state: 'lobby',            // lobby | charselect | fight | result
    hostId: hostSock.id,
    mode: '1v1',               // '1v1' | 'tournament'
    matchup: [0, 1],           // player slots in the ACTIVE match (sim slot = index)
    bracket: null,             // tournament bracket
    players: [slotDef(0), slotDef(1), slotDef(2), slotDef(3)],
    spectators: new Set(),
    arena: 'city',
    sim: null,
    inputs: [{ ax: 0, ay: 0, held: {} }, { ax: 0, ay: 0, held: {} }, { ax: 0, ay: 0, held: {} }, { ax: 0, ay: 0, held: {} }],
    inputsTouched: [false, false, false, false],
    actionQueue: [[], [], [], []],
    bots: [],
    matchCount: 0,
    stats: [0, 1, 2, 3].map(() => ({ dmg: 0, hits: 0, bestCombo: 0, kos: 0, perfects: 0 })),
    replay: null,
  };
  // QR encodes a deep link straight into the controller page
  const base = hostOrigin || `http://localhost:${PORT}`;
  room.qrUrl = `${base}/mobile.html?room=${code}`;
  QRCode.toDataURL(room.qrUrl, { margin: 1, width: 300, color: { dark: '#0a0a0a', light: '#ffffff' } })
    .then(url => { room.qr = url; room.hostSocket && emitRoom(room); })
    .catch(() => { room.qr = null; });
  rooms.set(code, room);
  room.hostSocket = hostSock;
  hostSock.join('room:' + code);
  hostSock.emit('host:created', { code, qrUrl: room.qrUrl, state: room.state });
  console.log(`[room] ${code} created by ${hostSock.id}`);
  return room;
}

function entrantSlots(room) {
  return room.mode === 'tournament' ? [0, 1, 2, 3] : [0, 1];
}
function slotName(room, slot) {
  const p = room.players[slot];
  if (!p) return '?';
  return (p.isBot ? '🤖 ' : '') + (p.name || 'P' + (slot + 1));
}

function roomState(room) {
  return {
    code: room.code,
    state: room.state,
    arena: room.arena,
    qr: room.qr,
    qrUrl: room.qrUrl,
    mode: room.mode,
    matchup: room.matchup,
    bracket: room.bracket,
    players: room.players.map(p => ({
      slot: p.slot, name: p.name || (p.isBot ? p.botName || 'BOT' : null),
      char: p.char, locked: p.locked, connected: p.connected, isBot: p.isBot, ping: p.ping,
    })),
  };
}

function emitRoom(room) {
  io.to('room:' + room.code).emit('room:state', roomState(room));
}

/* ---------------- pairing ---------------- */
function tryJoin(sock, code, name) {
  const room = [...rooms.values()].find(r => normCode(r.code) === normCode(code));
  if (!room) return { ok: false, reason: 'ROOM_NOT_FOUND' };
  room.lastActivity = Date.now();
  const slots = entrantSlots(room);
  const pl = slots.map(s => room.players[s]).find(p => !p.connected && !p.isBot);
  let slot = -1;
  if (pl && room.state === 'lobby') { slot = pl.slot; }
  else if (pl && room.state === 'charselect' && !pl.locked) { slot = pl.slot; }
  else if (pl && room.state === 'fight' && room.mode === 'tournament' && !pl.locked) { slot = pl.slot; }
  if (slot >= 0) {
    const p = room.players[slot];
    p.connected = true; p.sockId = sock.id; p.name = name || 'Player ' + (slot + 1);
    sock.join('room:' + room.code);
    sock.emit('joined', { slot, code: room.code, arena: room.arena, state: room.state, mode: room.mode, matchup: room.matchup });
    io.to('room:' + room.code).emit('player:joined', { slot, name: p.name });
    // auto-transition to charselect when all entrant slots filled
    if (room.state === 'lobby' && slots.every(s => room.players[s].connected || room.players[s].isBot)) {
      room.state = 'charselect';
      emitRoom(room);
    }
    // re-sync late joiners during fight (spectate instead)
    if (room.state === 'fight' || room.state === 'result') {
      sock.emit('joined', { slot, code: room.code, arena: room.arena, state: room.state, mode: room.mode, matchup: room.matchup, spectate: true });
    }
    console.log(`[room] ${room.code}: ${p.name} joined as P${slot + 1}`);
    return { ok: true, slot };
  }
  // full -> spectator
  sock.join('room:' + room.code);
  room.spectators.add(sock.id);
  sock.emit('joined', { slot: -1, code: room.code, arena: room.arena, state: room.state, mode: room.mode, matchup: room.matchup, spectate: true });
  return { ok: true, slot: -1, spectate: true };
}

/* ---------------- bot management ---------------- */
function addBot(room, slot) {
  const p = room.players[slot];
  if (!p || p.connected || p.isBot || room.state !== 'lobby' || !entrantSlots(room).includes(slot)) return false;
  p.isBot = true;
  p.botName = pick(['NIGHTFANG', 'IRONFIST', 'GHOSTBLADE', 'THUNDERPAW', 'VENOM', 'SLAMMER', 'DRIFT', 'KRYO']);
  p.name = p.botName;
  p.char = pick(CFG.CHAR_ORDER);
  room.bots.push(new Bot(slot, 0.35 + Math.random() * 0.4, p.botName));
  io.to('room:' + room.code).emit('player:joined', { slot, name: p.name, isBot: true });
  if (room.state === 'lobby' && entrantSlots(room).every(s => room.players[s].connected || room.players[s].isBot)) {
    room.state = 'charselect';
  }
  emitRoom(room);
  return true;
}
function removeBot(room, slot) {
  const p = room.players[slot];
  if (!p || !p.isBot) return;
  p.isBot = false; p.connected = false; p.name = null; p.char = null; p.locked = false;
  room.bots = room.bots.filter(b => b.p !== slot);
  io.to('room:' + room.code).emit('player:left', { slot });
  emitRoom(room);
}
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ---------------- tournament ---------------- */
function initBracket(room) {
  return { phase: 'sf1', results: [], matchup: [0, 1], champion: null };
}
function resetBracket(room) {
  room.bracket = initBracket(room);
  room.matchup = room.bracket.matchup;
}
function advanceTournament(room, winnerPlayerSlot) {
  const b = room.bracket;
  b.results.push(winnerPlayerSlot);
  if (b.phase === 'sf1') { b.phase = 'sf2'; b.matchup = [2, 3]; }
  else if (b.phase === 'sf2') { b.phase = 'final'; b.matchup = [b.results[0], b.results[1]]; }
  else { b.phase = 'done'; b.champion = winnerPlayerSlot; }
  room.matchup = b.matchup;
  io.to('room:' + room.code).emit('tournament:update', { bracket: b });
  console.log(`[tournament] ${room.code} → ${b.phase} ${b.matchup.map(s => slotName(room, s)).join(' vs ')}`);
}

/* ---------------- match lifecycle ---------------- */
function startMatch(room) {
  if (room.state !== 'charselect') return;
  if (room.mode === 'tournament') {
    if (!room.bracket) room.bracket = initBracket(room);
    if (room.bracket.phase === 'done') resetBracket(room);
    room.matchup = room.bracket.matchup;
  } else {
    room.matchup = [0, 1];
  }
  const [a, b] = room.matchup;
  const pa = room.players[a], pb = room.players[b];
  for (const s of entrantSlots(room)) if (!room.players[s].char) room.players[s].char = pick(CFG.CHAR_ORDER);
  room.matchCount++;
  room.stats = [0, 1, 2, 3].map(() => ({ dmg: 0, hits: 0, bestCombo: 0, kos: 0, perfects: 0 }));
  room.inputsTouched = [false, false, false, false];
  room.sim = new Sim(room.arena, pa.char, pb.char, {
    vs: `${slotName(room, a)} vs ${slotName(room, b)}`,
    roundSeconds: Number(process.env.ROUND_SECONDS) || 90,
  });
  room.replay = {
    id: `${room.code}-${room.matchCount}`,
    arena: room.arena,
    mode: room.mode,
    names: [slotName(room, a), slotName(room, b)],
    chars: [pa.char, pb.char],
    startedAt: Date.now(),
    snaps: [], events: [], duration: 0,
  };
  room.state = 'fight';
  emitRoom(room);
  io.to('room:' + room.code).emit('match:start', {
    arena: room.arena, p1: pa.char, p2: pb.char,
    matchup: room.matchup, mode: room.mode, match: room.matchCount,
  });
  console.log(`[match] ${room.code} #${room.matchCount} (${room.mode}) started: ${slotName(room, a)} vs ${slotName(room, b)}`);
}

/* ---------------- leaderboard (persistent) ---------------- */
const LB_FILE = path.join(__dirname, 'data', 'leaderboard.json');
let leaderboard = new Map();
let lbSaveTimer = null;
try {
  if (fs.existsSync(LB_FILE)) {
    leaderboard = new Map(Object.entries(JSON.parse(fs.readFileSync(LB_FILE, 'utf8'))));
  }
} catch (e) { /* fresh start */ }
function persistLeaderboard() {
  clearTimeout(lbSaveTimer);
  lbSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(LB_FILE), { recursive: true });
      fs.writeFileSync(LB_FILE, JSON.stringify(Object.fromEntries(leaderboard)));
    } catch (e) { console.error('[lb] save failed', e.message); }
  }, 800);
}
function recordResult(name, won, dmg, kos) {
  if (!name || name.includes('🤖') || /^BOT$/i.test(name)) return;
  const e = leaderboard.get(name) || { wins: 0, losses: 0, dmg: 0, kos: 0, matches: 0 };
  if (won) e.wins++; else e.losses++;
  e.dmg += Math.round(dmg); e.kos += kos; e.matches++;
  leaderboard.set(name, e);
  persistLeaderboard();
}
function leaderboardTop(n = 10) {
  return [...leaderboard.entries()]
    .map(([name, s]) => ({ name, ...s, winrate: s.matches ? Math.round(s.wins / s.matches * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.winrate - a.winrate || b.dmg - a.dmg)
    .slice(0, n);
}

/* ---------------- replays ---------------- */
const REPLAYS = []; // most recent first, capped
function publishReplay(room) {
  if (!room.replay) return null;
  const r = room.replay;
  r.duration = r.snaps.length ? r.snaps[r.snaps.length - 1].t : 0;
  REPLAYS.unshift(r);
  REPLAYS.length = Math.min(REPLAYS.length, 12);
  room.replay = null;
  return r.id;
}

/* ---------------- 60Hz sim loop ---------------- */
let tick = 0;
setInterval(() => {
  tick++;
  for (const room of rooms.values()) {
    if (!room.sim || room.state !== 'fight') continue;
    const s = room.sim;
    const [m0, m1] = room.matchup;
    // drain controller actions into sim (player slot → sim slot)
    for (let i = 0; i < 2; i++) {
      const slot = room.matchup[i];
      for (const a of room.actionQueue[slot].splice(0)) s.queueAction(i, a.name, a.data);
    }
    // bot brains (only bots in the active matchup)
    for (const b of room.bots) {
      const si = room.matchup.indexOf(b.p);
      if (si === -1) continue;
      const f = s.f[si];
      if (f && (f.st === 'idle' || f.st === 'walk' || f.st === 'run' || f.st === 'air' || f.st === 'jump' || f.st === 'block' || f.st === 'crouch' || f.st === 'charge' || f.st === 'hitstun' || f.st === 'special' || f.st === 'attack')) {
        const { inp, acts } = b.think(s, si);
        if (!f.possessT || Math.random() < 0.5) s.setInputs(si, inp);
        for (const a of acts) s.queueAction(si, a.name, a.data);
      }
    }
    // apply human held inputs (phone players + host keyboard/gamepad)
    // NOTE: bot slots are skipped — the bot brain already set their inputs.
    for (let i = 0; i < 2; i++) {
      const pl = room.players[room.matchup[i]];
      if (!pl || pl.isBot) continue;
      if (pl.connected || room.inputsTouched[pl.slot]) s.setInputs(i, room.inputs[pl.slot]);
      else s.setInputs(i, { ax: 0, ay: 0, held: {} });
    }
    s.tick(1 / 60);

    // forward events + accumulate stats + record replay
    for (const ev of s.events.splice(0)) {
      io.to('room:' + room.code).emit('match:event', ev);
      if (room.replay) room.replay.events.push({ t: s.time, kind: ev.kind, data: ev.data });
      if (ev.kind === 'hit' && ev.data) {
        const slot = room.matchup[ev.data.p];
        const st = room.stats[slot];
        if (st) {
          st.dmg += ev.data.dmg || 0;
          st.hits++;
          if ((ev.data.combo || 0) > st.bestCombo) st.bestCombo = ev.data.combo;
        }
      }
      if (ev.kind === 'ko' && ev.data) {
        const slot = room.matchup[ev.data.winner];
        const st = room.stats[slot];
        if (st) { st.kos++; if (ev.data.perfect) st.perfects++; }
      }
    }
    // state broadcast every 2nd tick (30Hz)
    if (tick % 2 === 0) {
      const snap = s.snapshot();
      room.lastSnap = snap;
      io.to('room:' + room.code).emit('match:state', snap);
      if (room.replay && room.replay.snaps.length < 4500) room.replay.snaps.push(snap);
      // round flow from server side
      if (snap.status === 'result') {
        if (room.state !== 'result') {
          room.state = 'result';
          emitRoom(room);
          const simWinner = snap.f[0].hp <= 0 ? 1 : 0;
          const winnerSlot = room.matchup[simWinner];
          const [pa, pb] = [room.players[room.matchup[0]], room.players[room.matchup[1]]];
          const winnerName = slotName(room, winnerSlot);
          // global leaderboard (human vs human only)
          if (!pa.isBot && !pb.isBot && pa.name && pb.name) {
            recordResult(winnerName, true, room.stats[winnerSlot].dmg, room.stats[winnerSlot].kos);
            recordResult(slotName(room, room.matchup[1 - simWinner]), false, room.stats[room.matchup[1 - simWinner]].dmg, room.stats[room.matchup[1 - simWinner]].kos);
          }
          const replayId = publishReplay(room);
          io.to('room:' + room.code).emit('match:end', {
            winner: winnerSlot,
            winnerName,
            simWinner,
            match: room.matchCount,
            replayId,
            p1wins: snap.p1wins, p2wins: snap.p2wins, reason: snap.reason || 'KO',
            stats: [room.stats[room.matchup[0]], room.stats[room.matchup[1]]],
            players: [
              { name: pa.name, isBot: pa.isBot, char: pa.char },
              { name: pb.name, isBot: pb.isBot, char: pb.char },
            ],
          });
          if (room.mode === 'tournament') {
            advanceTournament(room, winnerSlot);
            if (room.bracket.phase === 'done') {
              io.to('room:' + room.code).emit('tournament:done', { champion: winnerSlot, championName: winnerName, bracket: room.bracket });
              clearTimeout(room._autoBack);
              room._autoBack = setTimeout(() => {
                if (room.state === 'result') {
                  room.state = 'charselect';
                  resetBracket(room);
                  for (const p of room.players) p.locked = false;
                  emitRoom(room);
                }
              }, 12000);
            } else {
              // short result screen → charselect → auto-start next match
              clearTimeout(room._nextMatch);
              room._nextMatch = setTimeout(() => {
                if (room.state !== 'result') return;
                room.state = 'charselect';
                emitRoom(room);
                clearTimeout(room._autoStart);
                room._autoStart = setTimeout(() => {
                  if (room.state === 'charselect') startMatch(room);
                }, 4000);
              }, 5000);
            }
          } else {
            // 1v1: auto back to charselect so the party keeps flowing
            clearTimeout(room._autoBack);
            room._autoBack = setTimeout(() => {
              if (room.state === 'result') {
                room.state = 'charselect';
                for (const p of room.players) p.locked = false;
                emitRoom(room);
              }
            }, 8000);
          }
        }
      } else if (snap.status === 'roundend' && room.state === 'fight') {
        // one-shot: don't reschedule on every roundend snapshot (would never fire)
        if (!room._nextRound) {
          room._nextRound = setTimeout(() => {
            room._nextRound = null;
            if (room.sim && room.sim.status === 'roundend') room.sim.nextRound();
          }, 2600);
        }
      }
    }
  }
}, TICK_MS);

/* ---------------- socket handling ---------------- */
io.on('connection', (sock) => {
  sock.on('host:create', (data = {}, cb) => {
    const room = makeRoom(sock, (data.origin || sock.handshake.headers.origin || '').replace(/\/$/, ''));
    cb && cb({ ok: true, code: room.code });
  });

  sock.on('join', (data, cb) => {
    const r = tryJoin(sock, data && data.code, data && data.name);
    cb && cb(r);
    if (r.ok) {
      const room = [...rooms.values()].find(x => x.players.some(p => p.sockId === sock.id) || x.spectators.has(sock.id));
      if (room) { sock.emit('room:state', roomState(room)); if (room.lastSnap) sock.emit('match:state', room.lastSnap); }
    }
  });

  sock.on('host:addBot', (slot, cb) => {
    const room = findRoomBySocket(sock);
    if (!room || room.hostId !== sock.id) return;
    const ok = addBot(room, slot);
    cb && cb({ ok });
  });
  sock.on('host:removeBot', (slot) => {
    const room = findRoomBySocket(sock);
    if (!room || room.hostId !== sock.id) return;
    removeBot(room, slot);
  });
  sock.on('host:mode', (mode, cb) => {
    const room = findRoomBySocket(sock);
    if (!room || room.hostId !== sock.id || room.state !== 'lobby') return;
    if (mode === 'tournament') {
      room.mode = 'tournament';
      room.bracket = initBracket(room);
      room.matchup = room.bracket.matchup;
    } else {
      room.mode = '1v1';
      room.bracket = null;
      room.matchup = [0, 1];
    }
    for (const s of [2, 3]) {
      const p = room.players[s];
      p.connected = false; p.isBot = false; p.name = null; p.char = null; p.locked = false; p.sockId = null;
    }
    room.bots = room.bots.filter(b => b.p < 2 || room.mode === 'tournament');
    emitRoom(room);
    cb && cb({ ok: true, mode: room.mode });
  });
  sock.on('host:start', () => {
    const room = findRoomBySocket(sock);
    if (!room || room.hostId !== sock.id) return;
    if (room.state === 'charselect') return startMatch(room);
    // console quick-start: from lobby, when every slot is a bot or empty (PC plays)
    if (room.state === 'lobby' && entrantSlots(room).every(s => room.players[s].isBot || !room.players[s].connected)) {
      room.state = 'charselect';
      emitRoom(room);
      return startMatch(room);
    }
  });
  sock.on('host:rematch', () => {
    const room = findRoomBySocket(sock);
    if (!room || room.hostId !== sock.id) return;
    if (room.sim && room.sim.status === 'result') {
      room.sim = null;
      if (room.mode === 'tournament') resetBracket(room);
      for (const p of room.players) { p.locked = false; }
      room.state = 'charselect';
      emitRoom(room);
    }
  });
  sock.on('host:arena', (arenaId, cb) => {
    const room = findRoomBySocket(sock);
    if (!room || room.hostId !== sock.id || (room.state !== 'lobby' && room.state !== 'charselect')) return;
    if (CFG.ARENA[arenaId]) { room.arena = arenaId; emitRoom(room); cb && cb({ ok: true }); }
  });

  sock.on('char:select', (charId) => {
    const room = findRoomBySocket(sock);
    if (!room || room.state !== 'charselect') return;
    const p = room.players.find(p => p.sockId === sock.id);
    if (!p || p.isBot) return;
    if (CFG.CHAR[charId]) { p.char = charId; p.locked = false; emitRoom(room); io.to('room:' + room.code).emit('char:change', { slot: p.slot, char: charId }); }
  });
  sock.on('char:lock', (lock) => {
    const room = findRoomBySocket(sock);
    if (!room || room.state !== 'charselect') return;
    const p = room.players.find(p => p.sockId === sock.id);
    if (!p || !p.char) return;
    p.locked = !!lock;
    emitRoom(room);
    io.to('room:' + room.code).emit('char:lock', { slot: p.slot, locked: p.locked });
  });

  // controller inputs (rate limited)
  // NOTE: the HOST socket may also play (keyboard/gamepad on the PC = console style).
  // Host input binds to the first entrant slot without a phone/bot.
  function hostSlot(room) {
    const slots = room.mode === 'tournament' ? room.matchup : [0, 1];
    for (const s of slots) {
      const pl = room.players[s];
      if (pl && !pl.connected && !pl.isBot) return s;
    }
    return -1;
  }
  sock.on('input', (data) => {
    const room = findRoomBySocket(sock);
    if (!room) return;
    let p = room.players.find(p => p.sockId === sock.id);
    if (!p && room.hostId === sock.id && room.state === 'fight') {
      const s = hostSlot(room);
      if (s < 0) return;
      p = room.players[s];
    }
    if (!p) return;
    room.inputs[p.slot] = {
      ax: Math.max(-1, Math.min(1, data.ax || 0)),
      ay: Math.max(-1, Math.min(1, data.ay || 0)),
      held: data.held || {},
    };
    room.inputsTouched[p.slot] = true;
  });
  sock.on('action', (data) => {
    const room = findRoomBySocket(sock);
    if (!room) return;
    let p = room.players.find(p => p.sockId === sock.id);
    if (!p && room.hostId === sock.id && room.state === 'fight') {
      const s = hostSlot(room);
      if (s < 0) return;
      p = room.players[s];
    }
    if (!p) return;
    room.actionQueue[p.slot].push({ name: data.name, data: data.data, ts: Date.now() });
  });
  sock.on('emote', (emoji) => {
    const room = findRoomBySocket(sock);
    if (!room) return;
    const p = room.players.find(p => p.sockId === sock.id);
    if (p) io.to('room:' + room.code).emit('match:event', { kind: 'emote', data: { p: p.slot, emoji } });
    else if (room.spectators.has(sock.id)) {
      io.to('room:' + room.code).emit('match:event', { kind: 'emote', data: { p: -1, emoji } });
    }
  });

  // latency
  sock.on('ping', (t) => {
    sock.emit('pong', { t });
    const room = findRoomBySocket(sock);
    if (room) {
      const p = room.players.find(p => p.sockId === sock.id);
      if (p) p.ping = Math.round((Date.now() - t) / 2);
    }
  });

  sock.on('pause', () => {
    const room = findRoomBySocket(sock);
    if (!room || !room.sim || room.state !== 'fight') return;
    room.sim.paused = !room.sim.paused;
    io.to('room:' + room.code).emit('match:paused', { paused: room.sim.paused });
  });

  sock.on('disconnect', () => {
    for (const room of rooms.values()) {
      const wasHost = room.hostId === sock.id;
      const p = room.players.find(p => p.sockId === sock.id);
      if (p) {
        p.connected = false; p.sockId = null;
        io.to('room:' + room.code).emit('player:left', { slot: p.slot, name: p.name });
        console.log(`[room] ${room.code}: ${p.name} disconnected`);
        if (room.state === 'charselect') { p.locked = false; }
      }
      room.spectators.delete(sock.id);
      if (wasHost && room.hostSocket === sock) {
        // promote a connected player to host (PC page will reconnect anyway)
        const np = entrantSlots(room).map(s => room.players[s]).find(p => p.connected);
        if (np) { room.hostId = np.sockId; }
      }
      const anyEntrant = entrantSlots(room).some(s => room.players[s].connected || room.players[s].isBot);
      if (!anyEntrant && room.spectators.size === 0) {
        // empty room -> schedule cleanup
        room._cleanup = setTimeout(() => { rooms.delete(room.code); console.log(`[room] ${room.code} cleaned up`); }, Number(process.env.CLEANUP_MS || 120000));
      }
    }
  });
});

function findRoomBySocket(sock) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.sockId === sock.id) || room.spectators.has(sock.id) || room.hostSocket === sock) return room;
  }
  return null;
}

/* ---------------- REST API ---------------- */
app.get('/api/rooms', (req, res) => {
  const list = [...rooms.values()]
    .filter(r => r.state === 'lobby' || r.state === 'charselect')
    .map(r => ({
      code: r.code, state: r.state, mode: r.mode,
      players: entrantSlots(r).filter(s => r.players[s].connected || r.players[s].isBot).length,
      arena: r.arena,
    }));
  res.json(list);
});
app.get('/api/leaderboard', (req, res) => {
  if (req.query.all) {
    res.json({ top: leaderboardTop(1000), total: leaderboard.size });
  } else {
    res.json({ top: leaderboardTop(10), total: leaderboard.size });
  }
});
app.get('/api/qr', (req, res) => {
  QRCode.toDataURL(req.query.text || 'https://stickfight.arena', { margin: 1, width: 300, color: { dark: '#0a0a0a', light: '#ffffff' } })
    .then(dataUrl => res.json({ dataUrl }))
    .catch(() => res.status(500).json({ error: 'qr failed' }));
});
app.get('/api/replays', (req, res) => {
  res.json(REPLAYS.map(r => ({
    id: r.id, arena: r.arena, mode: r.mode, names: r.names, chars: r.chars,
    duration: Math.round(r.duration), snaps: r.snaps.length, events: r.events.length, startedAt: r.startedAt,
  })));
});
app.get('/api/replays/:id', (req, res) => {
  const r = REPLAYS.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'replay not found' });
  res.json(r);
});
app.get('/api/info', (req, res) => res.json({ name: 'StickFight Arena Server', version: '1.2.0', port: PORT }));

/* broadcast player pings to the room every 2s (PC status bar) */
setInterval(() => {
  for (const room of rooms.values()) {
    const pings = room.players.filter(p => p.connected).map(p => ({ slot: p.slot, ping: p.ping }));
    if (pings.length) io.to('room:' + room.code).emit('player:ping', pings);
  }
}, 2000);

/* ---------------- boot ---------------- */
server.listen(PORT, () => {
  console.log('🥊 StickFight Arena server running');
  console.log(`   PC game:   http://localhost:${PORT}`);
  console.log(`   Controller: http://localhost:${PORT}/mobile.html`);
});
