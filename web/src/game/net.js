/* ============================================================
   StickFight Arena — React socket layer
   Singleton socket + mutable store (mirrors the classic client)
   ============================================================ */
import { SFAAudio } from './engine/audio.js';

export const store = {
  room: null,          // room:state
  code: null, qr: null,
  snaps: [],           // [{t, snap}]
  lastSnap: null,
  shake: 0, hitstop: 0, poseClock: 0,
  paused: false, matchOver: false,
  arenaId: 'city',
  latency: 0,
  fx: [],              // {kind, data} queue for the canvas
  replay: null,        // {data, i, evi, paused, timer}
};

const bus = new Map(); // event -> Set(cb)
export function on(ev, cb) { if (!bus.has(ev)) bus.set(ev, new Set()); bus.get(ev).add(cb); return () => bus.get(ev).delete(cb); }
function emit(ev, data) { const s = bus.get(ev); if (s) s.forEach(cb => { try { cb(data); } catch (e) { console.error(e); } }); }

let sock = null;
export function connect() {
  if (sock) return sock;
  sock = window.io((store.serverUrl || undefined), { transports: ['websocket', 'polling'] });
  window.SFA = window.SFA || {};
  window.SFA.sock = sock; // test / debug hook (matches classic client API)
  window.SFA.store = store;

  sock.on('connect', () => { sock.emit('ping', Date.now()); emit('connected'); });
  sock.on('disconnect', () => emit('disconnected'));
  sock.on('pong', ({ t }) => { store.latency = Math.round((Date.now() - t) / 2); });

  sock.on('host:created', ({ code, qrUrl }) => {
    store.code = code;
    fetch(`/api/qr?text=${encodeURIComponent(qrUrl)}`).then(r => r.json()).then(d => { store.qr = d.dataUrl; emit('room:created'); })
      .catch(() => { store.qr = null; emit('room:created'); });
  });

  sock.on('room:state', (rs) => {
    store.room = rs;
    emit('room:state', rs);
  });

  sock.on('player:joined', ({ slot, name, isBot }) => emit('toast', { msg: (isBot ? '🤖 Bot joined as P' : name + ' joined as P') + (slot + 1) }));
  sock.on('player:left', ({ slot, name }) => emit('toast', { msg: (name || 'Player ' + (slot + 1)) + ' left' }));

  sock.on('match:start', ({ arena }) => {
    store.arenaId = arena;
    store.snaps = []; store.shake = 0; store.matchOver = false;
    SFAAudio.music.start(arena);
    SFAAudio.crowd(true);
    SFAAudio.music.setIntensity(false);
    emit('match:start', { arena });
  });

  sock.on('match:state', (snap) => {
    const t = performance.now();
    if (store.snaps.length && store.snaps[store.snaps.length - 1].snap.tick === snap.tick) return;
    store.snaps.push({ t, snap });
    if (store.snaps.length > 6) store.snaps.shift();
    store.lastSnap = snap;
    emit('snap', snap);
  });

  sock.on('match:event', (ev) => handleEvent(ev));

  sock.on('match:paused', ({ paused }) => {
    store.paused = paused;
    emit('paused', paused);
  });

  sock.on('match:end', (d) => emit('match:end', d));
  sock.on('tournament:update', (d) => emit('tournament:update', d));
  sock.on('tournament:done', (d) => emit('tournament:done', d));
  sock.on('player:ping', (pings) => emit('ping', pings));

  return sock;
}
export const sio = () => sock;

/* point the client at a specific game server (hosted/LAN) and reconnect */
export function setServer(url) {
  if (!url) return;
  store.serverUrl = url.trim().replace(/\/$/, '');
  try { localStorage.setItem('sfa_server', store.serverUrl); } catch (e) {}
  if (sock) { sock.disconnect(); sock.off(); sock = null; }
  connect();
}

/* ---------------- LOCAL DEMO MODE (static-host fallback) ----------------
   Runs the REAL sim in the browser with 2 bots — perfect for the deployed
   Cloudflare Pages site, which has no Node server behind it. */
export function startLocalDemo() {
  const Sim = window.SFASim.Sim, Bot = window.SFASim.Bot;
  const SFA = window.SFA;
  const chars = [SFA.CHAR_ORDER[(Math.random() * 8) | 0], SFA.CHAR_ORDER[(Math.random() * 8) | 0]];
  const sim = new Sim('city', chars[0], chars[1]);
  const b0 = new Bot(0, 0.7), b1 = new Bot(1, 0.7);
  store.demoMode = true;
  store.arenaId = 'city';
  store.room = {
    state: 'fight', mode: '1v1', matchup: [0, 1], arena: 'city',
    players: [
      { slot: 0, name: 'BOT A', char: chars[0], connected: false, isBot: true },
      { slot: 1, name: 'BOT B', char: chars[1], connected: false, isBot: true },
    ],
  };
  store.snaps = [];
  emit('room:state', store.room);
  emit('match:start', { arena: 'city' });
  let demoTick = 0;
  const tick = setInterval(() => {
    for (const b of [b0, b1]) {
      const f = sim.f[b.p];
      if (['idle', 'walk', 'run', 'air', 'jump', 'block', 'crouch', 'charge', 'hitstun', 'special', 'attack'].includes(f.st)) {
        const { inp, acts } = b.think(sim, b.p);
        sim.setInputs(b.p, inp);
        for (const a of acts) sim.queueAction(b.p, a.name, a.data);
      }
    }
    sim.tick(1 / 60);
    for (const ev of sim.events.splice(0)) {
      if (ev.kind === 'roundend') {
        setTimeout(() => { if (sim.status === 'roundend') sim.nextRound(); }, 2600);
      }
      handleEvent(ev);
    }
    if (sim.status === 'result') {
      clearInterval(tick);
      const winner = sim.f[0].hp <= 0 ? 1 : 0;
      emit('match:end', {
        winner, winnerName: store.room.players[winner].name,
        p1wins: sim.f[0].roundsWon, p2wins: sim.f[1].roundsWon,
        reason: sim.result ? sim.result.reason : 'KO', replayId: null,
        stats: sim.f.map(f => ({ dmg: Math.round(f.stats.dmg), hits: f.stats.hits, bestCombo: f.stats.bestCombo, kos: f.stats.kos, perfects: 0 })),
        players: [
          { name: 'BOT A', isBot: true, char: chars[0] },
          { name: 'BOT B', isBot: true, char: chars[1] },
        ],
      });
      return;
    }
    if (demoTick++ % 2 === 0) {
      const snap = sim.snapshot();
      store.snaps.push({ t: performance.now(), snap });
      if (store.snaps.length > 6) store.snaps.shift();
      store.lastSnap = snap;
      emit('snap', snap);
    }
  }, 1000 / 60);
}

/* ---------------- event -> fx + audio ---------------- */
export function handleEvent(ev) {
  const d = ev.data || {};
  const AR = window.SFARender;
  const addShake = (p) => { store.shake = Math.min(16, store.shake + p * 5); };
  AR.onEvent(ev, window.SFA.ARENA[store.arenaId] || window.SFA.ARENA.city, { add: addShake });

  switch (ev.kind) {
    case 'count': emit('banner', { text: String(d.n), cls: d.n === 1 ? 'gold' : '', t: 900 }); SFAAudio.play('count', d.n); if (d.n === 1) SFAAudio.play('fill'); break;
    case 'fight': emit('banner', { text: 'FIGHT!', cls: 'gold', t: 900 }); SFAAudio.play('roundstart'); break;
    case 'roundstart': emit('banner', { text: 'ROUND ' + d.round, cls: '', t: 900 }); SFAAudio.play('count', 0); break;
    case 'ko': emit('banner', { text: 'K.O.!', cls: 'red', t: 900 }); SFAAudio.play('ko'); SFAAudio.crowd(true, true); store.hitstop = 0.12; break;
    case 'roundend': SFAAudio.play('sting'); break;
    case 'announce': emit('banner', { text: d.text, cls: 'gold', t: 1200 }); SFAAudio.play('perfect'); break;
    case 'hit': {
      const s = { light: 'light', kick: 'kick', heavy: 'heavy', special: 'special', ult: 'ult', poison: 'poison', freeze: 'freeze', lava: 'lava', wave: 'wave' }[d.kind];
      if (s) SFAAudio.play(s);
      if (d.blocked && !d.perfect) SFAAudio.play('blocked');
      if (d.perfect) SFAAudio.play('perfect');
      if (d.power >= 2) store.hitstop = Math.max(store.hitstop, 0.05);
      break;
    }
    case 'combo': emit('combopop', { p: d.p, count: d.count, label: window.SFA.comboLabel(d.count) }); SFAAudio.play('combo', d.count); break;
    case 'special': SFAAudio.play('special'); break;
    case 'ult': SFAAudio.play('ult'); store.hitstop = 0.08; break;
    case 'grab': SFAAudio.play('grab'); break;
    case 'throw': SFAAudio.play('throw'); break;
    case 'jump': SFAAudio.play('jump'); break;
    case 'dash': SFAAudio.play('dash'); break;
    case 'rage': SFAAudio.play('rage'); emit('banner', { text: 'RAGE MODE!', cls: 'red', t: 1000 }); break;
    case 'berserk': SFAAudio.play('rage'); emit('banner', { text: 'BERSERKER!', cls: 'red', t: 1000 }); break;
    case 'freeze': SFAAudio.play('freeze'); break;
    case 'wave': SFAAudio.play('wave'); break;
    case 'wall': SFAAudio.play('wall'); break;
    case 'lava': SFAAudio.play('lava'); break;
    case 'matchend': {
      SFAAudio.music.stop(); SFAAudio.crowd(false);
      const s1 = store.snaps[store.snaps.length - 1];
      const win = s1 && s1.snap.f[0].hp <= 0 ? 1 : 0;
      SFAAudio.play(win === 0 ? 'fanfare' : 'lose');
      break;
    }
    case 'emote': {
      const s1 = store.snaps[store.snaps.length - 1];
      const pos = (s1 && d.p >= 0 && s1.snap.f[d.p])
        ? { x: s1.snap.f[d.p].x, y: s1.snap.f[d.p].y - 190 }
        : { x: 300 + Math.random() * 1000, y: 260 + Math.random() * 220 };
      AR.floater(pos.x, pos.y, d.emoji, '#ffffff', 42, 1.6, -60);
      break;
    }
    default: break;
  }
}

export function pushFx(kind, data) { store.fx.push({ kind, data }); if (store.fx.length > 80) store.fx.shift(); }
