/* ============================================================
   StickFight Arena — PC game screen
   Hosts rooms, renders the 2.5D arena from server snapshots,
   plays synthesized SFX, shows banners / HUD / combos.
   ============================================================ */
(function () {
  'use strict';
  const R = SFA; // common helpers
  const canvas = SFA.$('#arenaCanvas');
  const ctx = canvas.getContext('2d');
  const { draw: drawStickman, preview } = SFAStickman;
  const AR = SFARender;
  const AUDIO = SFAAudio;
  const CFG = window.SFA; // shared config (config.js)

  const state = {
    connected: false,
    room: null,           // room:state payload
    mySlot: -1, host: false,
    snaps: [],            // [{t, snap}]
    shake: 0, hitstop: 0,
    poseClock: 0,
    paused: false,
    matchOver: false,
  };

  /* ---------------- socket ---------------- */
  const sock = SFA.connect({
    onConnect: () => {
      state.connected = true;
      R.$('#boot').classList.add('hide');
      if (!state.room) sock.emit('host:create', { origin: location.origin }, () => {});
    },
    onDisconnect: () => {
      state.connected = false;
      R.$('#boot').classList.remove('hide');
      R.$('#boot .txt').textContent = 'SERVER LOST — RECONNECTING…';
    },
    onLatency: (ms) => {
      const el = R.$('#pingP1'); el.textContent = ms + 'ms';
      el.style.color = ms > 100 ? '#ff9d9d' : ms > 50 ? '#ffd700' : '#8b8fa3';
    },
  });

  sock.on('host:created', ({ code, qrUrl }) => {
    state.host = true;
    R.$('#roomCode').textContent = code;
    fetch(`/api/qr?text=${encodeURIComponent(qrUrl)}`).then(r => r.json()).then(d => {
      const img = document.createElement('img');
      img.src = d.dataUrl;
      R.$('#qrBox').innerHTML = '';
      R.$('#qrBox').appendChild(img);
    }).catch(() => { R.$('#qrBox').innerHTML = '<div style="color:#999;font-size:12px;">QR offline<br><br>' + qrUrl + '</div>'; });
    R.toast('Room created: ' + code);
  });

  sock.on('room:state', (rs) => {
    state.room = rs;
    renderLobby(rs); // sets the correct screen; calls renderCharSelect only in charselect
  });

  sock.on('player:joined', ({ slot, name, isBot }) => {
    if (!state.room) return;
    if (isBot) R.toast('🤖 Bot joined as P' + (slot + 1));
    else R.toast(name + ' joined as P' + (slot + 1));
  });
  sock.on('player:left', ({ slot, name }) => {
    R.toast((name || 'Player ' + (slot + 1)) + ' left');
  });

  sock.on('match:start', ({ arena, p1, p2 }) => {
    R.screen('hud');
    state.snaps = [];
    state.shake = 0; state.matchOver = false;
    R.$('#pausedOverlay').style.display = 'none';
    const a = CFG.ARENA[arena];
    R.$('#arenaTag').innerHTML = '<b>' + a.emoji + ' ' + a.name + '</b> · ' + (state.room ? state.room.players.map(p => p.name || 'BOT').join(' vs ') : '');
    R.$('#arenaName').textContent = a.emoji + ' ' + a.name.toUpperCase();
    // per-arena music + crowd
    AUDIO.music.start(arena);
    AUDIO.crowd(true);
    AUDIO.music.setIntensity(false);
  });

  sock.on('player:ping', (pings) => {
    if (!state.room) return;
    for (const { slot, ping } of pings) {
      const el = R.$('#ping' + (slot + 1));
      if (el) {
        el.textContent = ping + 'ms';
        el.style.color = ping > 100 ? '#ff9d9d' : ping > 50 ? '#ffd700' : '#8b8fa3';
      }
    }
  });

  sock.on('match:state', (snap) => {
    const t = performance.now();
    if (state.snaps.length && state.snaps[state.snaps.length - 1].snap.tick === snap.tick) return;
    state.snaps.push({ t, snap });
    if (state.snaps.length > 6) state.snaps.shift();
  });

  sock.on('match:event', (ev) => handleEvent(ev));

  sock.on('match:paused', ({ paused }) => {
    state.paused = paused;
    R.$('#pausedOverlay').style.display = paused ? 'flex' : 'none';
    if (paused) AUDIO.play('blocked'); else AUDIO.play('count', 1);
  });

  sock.on('match:end', (data) => {
    state.matchOver = true;
    showResult(data);
  });

  /* ---------------- lobby ---------------- */
  const SLOT_COLORS = ['var(--p1)', 'var(--p2)', '#c77dff', '#3ddc67'];
  const SLOT_LABELS = ['PLAYER 1', 'PLAYER 2', 'PLAYER 3', 'PLAYER 4'];
  function buildLobby() {
    const box = R.$('#lobbySlots');
    if (box.dataset.built) return;
    box.dataset.built = '1';
    for (let s = 0; s < 4; s++) {
      const el = document.createElement('div');
      el.className = 'lobby-player';
      el.dataset.slot = s;
      el.style.borderColor = SLOT_COLORS[s];
      el.innerHTML = `
        <div class="slot-label" style="color:${SLOT_COLORS[s]}">${SLOT_LABELS[s]}</div>
        <div class="who">—</div>
        <div class="status"><span class="waiting-dot"></span> Waiting for fighter…</div>`;
      box.appendChild(el);
      const b = document.createElement('button');
      b.className = 'btn small';
      b.style.borderColor = SLOT_COLORS[s];
      b.id = 'bot' + s;
      b.textContent = '🤖 Fill P' + (s + 1) + ' with Bot';
      b.onclick = () => {
        const room = state.room;
        if (!room) return;
        if (room.players[s].isBot) sock.emit('host:removeBot', s);
        else sock.emit('host:addBot', s, () => {});
      };
      R.$('#botRow').appendChild(b);
    }
  }
  function renderLobby(rs) {
    buildLobby();
    const slots = rs.mode === 'tournament' ? [0, 1, 2, 3] : [0, 1];
    for (let s = 0; s < 4; s++) {
      const panel = R.$('#lobbySlots').children[s];
      panel.classList.toggle('hidden', !slots.includes(s));
      const pl = rs.players[s];
      const who = panel.querySelector('.who');
      const st = panel.querySelector('.status');
      if (pl.isBot) { who.textContent = '🤖 ' + (pl.name || 'BOT'); who.style.color = 'var(--gold)'; }
      else if (pl.connected) { who.textContent = pl.name || '—'; who.style.color = SLOT_COLORS[s]; }
      else { who.textContent = '—'; who.style.color = ''; }
      st.innerHTML = pl.connected || pl.isBot
        ? '<span class="waiting-dot ok"></span>' + (pl.isBot ? 'Bot ready' : 'Connected ✓') + (pl.ping ? ' · ' + pl.ping + 'ms' : '')
        : '<span class="waiting-dot"></span> Waiting for fighter…';
      const b = R.$('#bot' + s);
      b.disabled = pl.connected || pl.isBot || rs.state !== 'lobby';
      b.textContent = pl.isBot ? '🤖 Bot (tap to remove)' : ('🤖 Fill P' + (s + 1) + ' with Bot');
    }
    const modeBtn = R.$('#modeBtn');
    modeBtn.textContent = rs.mode === 'tournament' ? '🥊 1V1 MODE' : '🏆 4-PLAYER TOURNAMENT';
    modeBtn.classList.toggle('gold', rs.mode === 'tournament');
    R.screen(rs.state === 'lobby' ? 'lobby' : (rs.state === 'charselect' ? 'charselect' : 'hud'));
    if (rs.state === 'charselect') renderCharSelect(rs);
    else if (rs.state === 'fight' || rs.state === 'result') R.screen('hud');
  }

  R.$('#modeBtn').onclick = () => {
    const room = state.room;
    if (!room) return;
    AUDIO.play('menuclick');
    sock.emit('host:mode', room.mode === 'tournament' ? '1v1' : 'tournament', (d) => {
      if (d && d.ok) R.toast(d.mode === 'tournament' ? '🏆 Tournament mode — 4 fighters!' : '🥊 1v1 mode');
    });
  };

  /* ---------------- console layer: fullscreen / mute / help ---------------- */
  function toggleFS() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => R.toast('Fullscreen blocked by browser', 'err'));
  }
  R.$('#fsBtn').onclick = toggleFS;
  R.$('#lobbyFsBtn').onclick = toggleFS;
  R.$('#startBtn').addEventListener('click', () => {
    // console experience: go fullscreen on match start (user gesture = allowed)
    if (!document.fullscreenElement && !window.__fsDenied) {
      document.documentElement.requestFullscreen().catch(() => { window.__fsDenied = true; });
    }
  });
  R.$('#quickStartBtn').onclick = () => {
    AUDIO.play('menuclick');
    sock.emit('host:start');
    if (!document.fullscreenElement && !window.__fsDenied) {
      document.documentElement.requestFullscreen().catch(() => { window.__fsDenied = true; });
    }
  };
  document.addEventListener('fullscreenchange', () => {
    R.$('#fsBtn').textContent = document.fullscreenElement ? '⛶' : '⛶';
  });
  // hide cursor after idle in fullscreen (console feel)
  let cursorT = null;
  document.addEventListener('mousemove', () => {
    document.body.classList.remove('cursor-hidden');
    clearTimeout(cursorT);
    cursorT = setTimeout(() => document.body.classList.add('cursor-hidden'), 2600);
  });
  // mute
  let muted = false;
  R.$('#muteBtn').onclick = () => {
    muted = !muted;
    AUDIO.setMuted(muted);
    R.$('#muteBtn').textContent = muted ? '🔇' : '🔊';
    R.$('#muteBtn').classList.toggle('off', muted);
  };
  // help overlay
  R.$('#helpBtn').onclick = () => R.screen('controlsHelp');
  R.$('#lobbyHelpBtn').onclick = () => R.screen('controlsHelp');
  R.$('#chClose').onclick = () => R.screen(state.room && state.room.state === 'fight' ? 'hud' : (state.room && state.room.state === 'charselect' ? 'charselect' : 'lobby'));
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.repeat) { R.$('#muteBtn').click(); }
    if (e.key.toLowerCase() === 'p' && !e.repeat) { sock.emit('pause'); }
    if (e.key.toLowerCase() === 'f11') { /* browser handles */ }
  });

  /* ---------------- console layer: keyboard + gamepad as controllers ---------------- */
  // The host PC can BE a player (console style). Keyboard = P1-ish, Gamepad 0/1 = P1/P2.
  // Only binds to a slot that has no phone connected.
  const kb = { ax: 0, ay: 0, held: {} };
  const KB_MAP = {
    KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
    ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
    Space: 'jump', ShiftLeft: 'block', ShiftRight: 'block', ControlLeft: 'dash', ControlRight: 'dash',
    KeyJ: 'A', KeyK: 'B', KeyL: 'X', KeyU: 'Y', KeyO: 'ult', KeyE: 'grab', KeyR: 'RB', KeyQ: 'taunt', KeyF: 'rage',
  };
  function kbSlot() {
    const room = state.room;
    if (!room) return -1;
    const slots = room.mode === 'tournament' ? room.matchup : [0, 1];
    for (const s of slots) {
      const pl = room.players[s];
      if (pl && !pl.connected && !pl.isBot) return s;
    }
    return -1;
  }
  function kbSendInput() {
    const s = kbSlot();
    if (s < 0) return;
    sock.emit('input', { ax: kb.ax, ay: kb.ay, held: { ...kb.held } });
  }
  function kbAct(name, data) {
    const s = kbSlot();
    if (s < 0) return;
    sock.emit('action', { name, data });
  }
  window.addEventListener('keydown', (e) => {
    const k = KB_MAP[e.code];
    if (!k) return;
    if (['up', 'left', 'down', 'right', 'block', 'dash'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    switch (k) {
      case 'up': kb.ax = 0; kb.ay = -1; kbAct('jump'); break;
      case 'down': kb.ay = 1; kb.ax = 0; break;
      case 'left': kb.ax = -1; kb.ay = 0; break;
      case 'right': kb.ax = 1; kb.ay = 0; break;
      case 'jump': kbAct('jump'); break;
      case 'block': kb.held.block = true; kbAct('blockOn'); break;
      case 'dash': kbAct('dash'); break;
      case 'RB': kb.held.RB = true; break;
      case 'A': kbAct('A'); break;
      case 'B': kbAct('B'); break;
      case 'X': kbAct('X'); break;
      case 'Y': kbAct('Y'); break;
      case 'ult': kbAct('ult'); break;
      case 'grab': kbAct('grab'); break;
      case 'taunt': kbAct('taunt', { emoji: '😤' }); break;
      case 'rage': kbAct('rage'); break;
    }
    kbSendInput();
  });
  window.addEventListener('keyup', (e) => {
    const k = KB_MAP[e.code];
    if (!k) return;
    switch (k) {
      case 'up': if (kb.ay === -1) kb.ay = 0; break;
      case 'down': if (kb.ay === 1) kb.ay = 0; break;
      case 'left': if (kb.ax === -1) kb.ax = 0; break;
      case 'right': if (kb.ax === 1) kb.ax = 0; break;
      case 'block': kb.held.block = false; kbAct('blockOff'); break;
      case 'RB': kb.held.RB = false; kbAct('releaseRB'); break;
    }
    kbSendInput();
  });
  // gamepads: poll every frame; pad i -> free slot i
  const padState = {}; // index -> {slot, prev:[]}
  function pollGamepads() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
    const room = state.room;
    if (!room) return;
    const free = (room.mode === 'tournament' ? room.matchup : [0, 1]).filter(s => {
      const pl = room.players[s];
      return pl && !pl.connected && !pl.isBot;
    });
    for (let i = 0; i < pads.length && i < 2; i++) {
      const gp = pads[i];
      if (!gp) { delete padState[i]; continue; }
      const st = padState[i] || (padState[i] = { slot: -1, prev: [] });
      if (st.slot === -1 || !free.includes(st.slot)) st.slot = free[i] !== undefined ? free[i] : -1;
      if (st.slot < 0) { st.prev = gp.buttons.map(b => b.pressed); continue; }
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      let mx = ax, my = ay;
      if (Math.abs(mx) < 0.12) mx = 0;
      if (Math.abs(my) < 0.12) my = 0;
      if (gp.buttons[14].pressed) mx = -1;
      if (gp.buttons[15].pressed) mx = 1;
      if (gp.buttons[12].pressed) my = -1;
      if (gp.buttons[13].pressed) my = 1;
      const held = {};
      if (gp.buttons[4].pressed) held.block = true;   // LB
      if (gp.buttons[5].pressed) held.RB = true;      // RB
      sock.emit('input', { ax: mx, ay: my, held });
      // edges
      const MAP = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 6: 'dash', 7: 'grab', 9: 'rage', 8: 'pause' };
      gp.buttons.forEach((b, bi) => {
        if (b.pressed && !st.prev[bi]) {
          const act = MAP[bi];
          if (act === 'pause') { sock.emit('pause'); return; }
          if (act) sock.emit('action', { name: act });
        }
        if (!b.pressed && st.prev[bi] && bi === 5) sock.emit('action', { name: 'releaseRB' });
        if (!b.pressed && st.prev[bi] && bi === 4) sock.emit('action', { name: 'blockOff' });
      });
      st.prev = gp.buttons.map(b => b.pressed);
    }
  }
  // (gamepad polling is invoked inside frame() below)

  R.$('#lbReplayBtn').onclick = () => {
    fetch('/api/replays').then(r => r.json()).then(list => {
      if (!list.length) return R.toast('No replays yet — play a match first!', 'err');
      startReplay(list[0].id);
    }).catch(() => R.toast('Replay server unavailable', 'err'));
  };

  /* ---------------- character select ---------------- */
  const previewCans = [];
  function renderCharSelect(rs) {
    if (!rs) return;
    const grid = R.$('#csGrid');
    if (!grid.dataset.built) {
      grid.dataset.built = '1';
      for (const id of CFG.CHAR_ORDER) {
        const c = CFG.CHAR[id];
        const card = document.createElement('div');
        card.className = 'cs-card';
        card.dataset.id = id;
        card.innerHTML = `<canvas width="200" height="140"></canvas><div class="nm" style="color:${c.color}">${c.emoji} ${c.name}</div><div class="st">${c.style}</div><div class="lock-badge">🔒</div>`;
        grid.appendChild(card);
        previewCans.push(card.querySelector('canvas'));
      }
      // arena select
      const sel = R.$('#arenaSelect');
      sel.innerHTML = '';
      for (const id of CFG.ARENA_ORDER) {
        const a = CFG.ARENA[id];
        const o = document.createElement('option');
        o.value = id; o.textContent = a.emoji + ' ' + a.name;
        sel.appendChild(o);
      }
      sel.onchange = () => {
        sock.emit('host:arena', sel.value, (d) => { if (d && d.ok) R.toast('Arena: ' + CFG.ARENA[sel.value].name); });
        R.$('#arenaPreview').textContent = CFG.ARENA[sel.value].emoji;
      };
      sel.value = rs.arena;
      R.$('#arenaPreview').textContent = CFG.ARENA[rs.arena].emoji;
      // status panels (dynamic)
      const st = R.$('#csStatus');
      for (let s = 0; s < 4; s++) {
        const el = document.createElement('div');
        el.className = 'cs-slot';
        el.dataset.slot = s;
        el.style.borderColor = SLOT_COLORS[s];
        el.innerHTML = `<div class="who" style="color:${SLOT_COLORS[s]}">P${s + 1}</div><div class="picked">choosing…</div>`;
        st.appendChild(el);
      }
    }
    const slots = rs.mode === 'tournament' ? [0, 1, 2, 3] : [0, 1];
    for (let s = 0; s < 4; s++) {
      const panel = R.$('#csStatus').children[s];
      panel.classList.toggle('hidden', !slots.includes(s));
      const pl = rs.players[s];
      const who = panel.querySelector('.who');
      who.textContent = 'P' + (s + 1) + ': ' + (pl.isBot ? '🤖 ' : '') + (pl.name || '—');
      const picked = panel.querySelector('.picked');
      picked.textContent = pl.char
        ? (pl.locked ? '🔒 ' : '') + CFG.CHAR[pl.char].emoji + ' ' + CFG.CHAR[pl.char].name + (pl.locked ? ' — LOCKED' : ' — choosing')
        : (!pl.connected && !pl.isBot ? '🎮 PC (keyboard/gamepad)' : 'choosing…');
      picked.style.color = pl.locked ? 'var(--gold)' : (!pl.connected && !pl.isBot ? 'var(--p2)' : '');
    }
    renderBracket(rs);
    // readiness: locked/bot slots are ready; empty slots = host plays them via
    // keyboard/gamepad (console style) and get auto-assigned a fighter on start.
    const allReady = slots.every(s => {
      const p = rs.players[s];
      if (!p) return false;
      if (p.char && (p.locked || p.isBot)) return true;
      return !p.connected && !p.isBot; // empty → PC plays
    });
    R.$('#startBtn').disabled = !allReady;
    R.$('#startBtn').textContent = rs.mode === 'tournament' ? '🏆 START TOURNAMENT' : '⚡ START FIGHT';
    const pcSlots = slots.filter(s => !rs.players[s].connected && !rs.players[s].isBot);
    R.$('#csHint').innerHTML = allReady
      ? (rs.mode === 'tournament' ? 'All 4 fighters ready — the bracket begins!' : 'Both fighters ready!') +
        (pcSlots.length ? ` · <span style="color:var(--p2)">🎮 PC plays P${pcSlots.map(s => s + 1).join(' & P')} (keyboard/gamepad)</span>` : '')
      : 'Waiting for fighters to pick…';
    R.screen('charselect');
    // highlight picked cards
    for (const card of grid.children) {
      const id = card.dataset.id;
      card.classList.remove('sel', 'locked');
      const p = rs.players.find(x => x.char === id);
      if (p) {
        card.classList.add('sel');
        if (p.locked) card.classList.add('locked');
        if (p.isBot) {
          card.style.borderColor = 'var(--gold)';
          card.style.boxShadow = '0 0 24px rgba(255,215,0,0.4)';
        } else {
          card.style.borderColor = SLOT_COLORS[p.slot] || (p.slot === 0 ? 'var(--p1)' : 'var(--p2)');
          card.style.boxShadow = '0 0 24px rgba(255,255,255,0.25)';
        }
      } else {
        card.style.borderColor = '';
        card.style.boxShadow = '';
      }
    }
  }

  /* ---------------- bracket ---------------- */
  function renderBracket(rs) {
    const b = rs.bracket;
    const mk = (slots, results, phase) => {
      const col = document.createElement('div');
      col.className = 'bcol';
      col.innerHTML = `<div class="bt">${phase.toUpperCase()}</div>` +
        slots.map((s, i) => {
          const nm = rs.players[s] ? (rs.players[s].name || 'P' + (s + 1)) : 'P' + (s + 1);
          const won = results.includes(s);
          const isNext = b && b.phase === phase && b.matchup && b.matchup.includes(s) && !won;
          const champ = b && b.champion === s;
          return `<div class="bf ${won ? 'win' : ''} ${isNext ? 'next' : ''} ${champ ? 'champ' : ''}">${won ? '✅ ' : isNext ? '⚔️ ' : ''}${R.esc(nm)}</div>`;
        }).join('');
      return col;
    };
    const names = (slots) => slots.map(s => rs.players[s] ? (rs.players[s].name || 'P' + (s + 1)) : 'P' + (s + 1));
    let html = '';
    if (b) {
      const col1 = mk([0, 1], b.results.slice(0, 1), 'sf1');
      const col2 = mk([2, 3], b.results.slice(1, 2), 'sf2');
      const finalists = b.results.length >= 2 ? [b.results[0], b.results[1]] : [];
      const col3 = mk(finalists, b.results.slice(2, 3), 'final');
      const champCol = document.createElement('div');
      champCol.className = 'bcol';
      champCol.innerHTML = `<div class="bt">CHAMPION</div>` +
        (b.champion !== null && b.champion !== undefined
          ? `<div class="bf champ">🏆 ${R.esc(rs.players[b.champion] ? rs.players[b.champion].name : '?')}</div>`
          : `<div class="bf">—</div>`);
      html = `<div class="bracket">${col1.outerHTML}${col2.outerHTML}${col3.outerHTML}${champCol.outerHTML}</div>`;
    } else {
      html = `<div class="bracket"><div class="bcol"><div class="bt">1V1</div><div class="bf">${R.esc(names([0, 1]).join(' vs '))}</div></div></div>`;
    }
    R.$('#csBracket').innerHTML = html;
    const rb = R.$('#resBracket');
    if (rb) rb.innerHTML = html;
  }

  R.$('#startBtn').onclick = () => sock.emit('host:start');

  /* ---------------- result ---------------- */
  function showResult(d) {
    const rs = state.room;
    const winner = d.winner;
    const p1n = (d.players && d.players[0] && d.players[0].name) || (rs && rs.players[0].name) || 'P1';
    const p2n = (d.players && d.players[1] && d.players[1].name) || (rs && rs.players[1].name) || 'P2';
    const wName = d.winnerName || (winner === 0 ? p1n : p2n);
    R.$('#resTitle').textContent = wName.toUpperCase() + ' WINS';
    R.$('#resTitle').className = 'result-title ' + (winner === 0 ? 'neon-red' : 'neon-blue');
    R.$('#resSub').textContent = (d.reason || 'K.O.') + ' — best of 3';
    R.$('#resScore').innerHTML =
      `<span class="neon-red">${R.esc(p1n)}</span> <span class="vs">${d.p1wins || 0} — ${d.p2wins || 0}</span> <span class="neon-blue">${R.esc(p2n)}</span>`;
    // tournament: bracket + next-match hint
    if (rs && rs.mode === 'tournament' && rs.bracket) {
      renderBracket(rs);
      const b = rs.bracket;
      R.$('#resSub').textContent = (d.reason || 'K.O.') + ' — ' +
        (b.phase === 'done' ? '🏆 TOURNAMENT OVER' : 'next: ' + (b.phase === 'sf1' ? 'SEMIFINAL 2' : 'THE FINAL'));
    }
    // replay button
    const rb = R.$('#replayBtn');
    if (d.replayId) { rb.style.display = ''; rb.onclick = () => startReplay(d.replayId); }
    else rb.style.display = 'none';
    // per-player stat cards
    const stats = d.stats || [];
    const cards = [
      { n: p1n, c: '#ff6a6a', s: stats[0] || {} },
      { n: p2n, c: '#6ab8ff', s: stats[1] || {} },
    ];
    R.$('#resStats').innerHTML = cards.map(p => `
      <div class="result-stat">
        <div style="font-family:var(--font-head);font-size:12px;letter-spacing:2px;color:${p.c};margin-bottom:8px;">${R.esc(p.n)}</div>
        <div class="v">${Math.round(p.s.dmg || 0)}</div><div class="k">DAMAGE</div>
        <div class="v" style="font-size:18px;margin-top:6px;">${p.s.hits || 0}</div><div class="k">HITS</div>
        <div class="v" style="font-size:18px;margin-top:6px;">${p.s.bestCombo || 0}x</div><div class="k">BEST COMBO</div>
        <div class="v" style="font-size:18px;margin-top:6px;">${p.s.kos || 0}${p.s.perfects ? ' (PERFECT!)' : ''}</div><div class="k">KOS</div>
      </div>`).join('');
    // leaderboard teaser
    fetch('/api/leaderboard').then(r => r.json()).then(lb => {
      if (lb && lb.total) {
        const mine = (lb.top || []).filter(x => x.name === p1n || x.name === p2n)[0];
        R.$('#resLbHint').innerHTML = mine
          ? `🏆 <b>${R.esc(mine.name)}</b> — ${mine.wins}W / ${mine.losses}L · rank ${(lb.top || []).indexOf(mine) + 1} of ${lb.total}`
          : `🏆 ${lb.total} fighters on the leaderboard — keep winning to climb`;
      } else {
        R.$('#resLbHint').textContent = '🏆 First match — you just founded the leaderboard!';
      }
    }).catch(() => { R.$('#resLbHint').textContent = ''; });
    R.screen('result');
    if (AUDIO) AUDIO.play('ko');
  }
  R.$('#rematchBtn').onclick = () => { sock.emit('host:rematch'); R.screen('charselect'); };
  R.$('#lobbyBtn').onclick = () => location.reload();

  /* ---------------- replay playback ---------------- */
  let replay = null; // { data, i, evi, paused, timer }
  function startReplay(id) {
    R.toast('🎬 Loading replay…');
    fetch('/api/replays/' + encodeURIComponent(id)).then(r => r.json()).then(data => {
      if (!data || !data.snaps) return R.toast('Replay unavailable', 'err');
      stopReplay(true);
      replay = { data, i: 0, evi: 0, paused: false, timer: null };
      state.snaps = [];
      state.shake = 0; state.matchOver = true;
      R.screen('hud');
      R.$('#replayBar').classList.add('show');
      R.$('#rpNames').textContent = data.names.join(' vs ');
      const a = CFG.ARENA[data.arena];
      R.$('#arenaName').textContent = '🎬 REPLAY · ' + a.emoji + ' ' + a.name.toUpperCase();
      R.$('#arenaTag').innerHTML = '<b>🎬 REPLAY</b> · ' + data.names.join(' vs ');
      replay.timer = setInterval(() => {
        if (!replay || replay.paused) return;
        const s = data.snaps[replay.i];
        if (!s) { stopReplay(); return; }
        state.snaps.push({ t: performance.now(), snap: s });
        if (state.snaps.length > 6) state.snaps.shift();
        while (replay.evi < data.events.length && data.events[replay.evi].t <= s.t) {
          handleEvent({ kind: data.events[replay.evi].kind, data: data.events[replay.evi].data });
          replay.evi++;
        }
        replay.i++;
        R.$('#rpTime').textContent = Math.round(s.t) + 's / ' + Math.round(data.duration) + 's';
      }, 1000 / 30);
    }).catch(() => R.toast('Replay unavailable', 'err'));
  }
  function stopReplay(silent) {
    if (replay) { clearInterval(replay.timer); replay = null; }
    R.$('#replayBar').classList.remove('show');
    if (!silent) R.screen('result');
  }
  R.$('#rpPause').onclick = () => {
    if (!replay) return;
    replay.paused = !replay.paused;
    R.$('#rpPause').textContent = replay.paused ? '▶' : '⏸';
  };
  R.$('#rpExit').onclick = () => stopReplay();
  canvas.addEventListener('click', () => { if (replay) { replay.paused = !replay.paused; R.$('#rpPause').textContent = replay.paused ? '▶' : '⏸'; } });

  /* ---------------- tournament events ---------------- */
  sock.on('tournament:update', ({ bracket }) => {
    if (!state.room) return;
    state.room.bracket = bracket;
    state.room.matchup = bracket.matchup;
    renderBracket(state.room);
    const stage = { sf1: 'Semifinal 1 done', sf2: 'Semifinal 2 starting', final: 'THE FINAL' }[bracket.phase];
    if (stage && bracket.phase !== 'sf1') R.toast('⚔️ ' + stage + '!');
  });
  sock.on('tournament:done', ({ champion, championName, bracket }) => {
    R.toast('🏆 CHAMPION: ' + championName + '!');
    banner('🏆 ' + championName.toUpperCase() + ' IS THE CHAMPION!', 'gold');
  });

  /* ---------------- events ---------------- */
  function handleEvent(ev) {
    const d = ev.data || {};
    AR.onEvent(ev, state.room ? CFG.ARENA[state.room.arena] : CFG.ARENA.city, { add: (p) => { state.shake = Math.min(16, state.shake + p * 5); } });
    switch (ev.kind) {
      case 'count': banner(String(d.n), d.n === 1 ? 'gold' : ''); AUDIO.play('count', d.n); if (d.n === 1) AUDIO.play('fill'); break;
      case 'fight': banner('FIGHT!', 'gold'); AUDIO.play('roundstart'); break;
      case 'roundstart': banner('ROUND ' + d.round, ''); AUDIO.play('count', 0); break;
      case 'ko': banner('K.O.!', 'red'); AUDIO.play('ko'); AUDIO.crowd(true, true); state.hitstop = 0.12; break;
      case 'roundend': AUDIO.play('sting'); break;
      case 'announce': banner(d.text, 'gold'); AUDIO.play('perfect'); break;
      case 'hit': {
        const s = { light: 'light', kick: 'kick', heavy: 'heavy', special: 'special', ult: 'ult', poison: 'poison', freeze: 'freeze', lava: 'lava', wave: 'wave' }[d.kind];
        if (s) AUDIO.play(s);
        if (d.blocked && !d.perfect) AUDIO.play('blocked');
        if (d.perfect) AUDIO.play('perfect');
        if (d.power >= 2) state.hitstop = Math.max(state.hitstop, 0.05);
        break;
      }
      case 'combo': {
        comboPopup(d.p, d.count, d.label);
        AUDIO.play('combo', d.count);
        break;
      }
      case 'special': AUDIO.play('special'); break;
      case 'ult': AUDIO.play('ult'); state.hitstop = 0.08; break;
      case 'grab': AUDIO.play('grab'); break;
      case 'throw': AUDIO.play('throw'); break;
      case 'jump': AUDIO.play('jump'); break;
      case 'dash': AUDIO.play('dash'); break;
      case 'rage': AUDIO.play('rage'); banner('RAGE MODE!', 'red'); break;
      case 'berserk': AUDIO.play('rage'); banner('BERSERKER!', 'red'); break;
      case 'freeze': AUDIO.play('freeze'); break;
      case 'wave': AUDIO.play('wave'); break;
      case 'wall': AUDIO.play('wall'); break;
      case 'lava': AUDIO.play('lava'); break;
      case 'matchend': {
        AUDIO.music.stop();
        AUDIO.crowd(false);
        const win = state.snaps.length ? (state.snaps[state.snaps.length - 1].snap.f[0].hp <= 0 ? 1 : 0) : 0;
        AUDIO.play(win === 0 ? 'fanfare' : 'lose');
        break;
      }
      case 'emote': {
        // players: float above their fighter · spectators: random top area
        const s1 = state.snaps[state.snaps.length - 1];
        const pos = (s1 && d.p >= 0 && s1.snap.f[d.p])
          ? { x: s1.snap.f[d.p].x, y: s1.snap.f[d.p].y - 190 }
          : { x: 300 + Math.random() * 1000, y: 260 + Math.random() * 220 };
        AR.floater(pos.x, pos.y, d.emoji, '#ffffff', 42, 1.6, -60);
        break;
      }
      case 'blink': AR.spawn(d.x, d.y, { n: 14, color: ['#8a5cff', '#b79bff'], speed: 220 }); break;
      case 'possess': banner('POSSESSED!', 'blue'); break;
      case 'ultwhiff': R.toast('Ultimate whiffed!'); break;
    }
  }

  function banner(text, cls = '') {
    const el = R.$('#bannerText');
    el.textContent = text;
    el.className = 'btext show ' + cls;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = 'btext ' + cls, 900);
  }

  let comboPopT = [0, 0];
  function comboPopup(p, count, label) {
    const el = R.$('#combo' + (p === 0 ? 'L' : 'R'));
    const v = R.$('#combo' + (p === 0 ? 'Lv' : 'Rv'));
    const l = R.$('#combo' + (p === 0 ? 'Llbl' : 'Rlbl'));
    v.textContent = count + 'x';
    l.textContent = label || '';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    comboPopT[p] = 1.2;
  }

  /* ---------------- HUD ---------------- */
  function hudMeter(el, v) {
    el.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const seg = document.createElement('div');
      seg.className = 'seg' + (v >= i + 1 ? (i === 3 ? ' ult' : ' on') : '');
      el.appendChild(seg);
    }
  }
  function hudPips(w1, w2) {
    const el = R.$('#pips');
    el.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const p = document.createElement('div');
      p.className = 'pip' + (i < w1 ? ' win' : '');
      el.appendChild(p);
    }
    const sep = document.createElement('div');
    sep.style.width = '10px';
    el.appendChild(sep);
    for (let i = 0; i < 2; i++) {
      const p = document.createElement('div');
      p.className = 'pip' + (i < w2 ? ' win' : '');
      el.appendChild(p);
    }
  }

  /* ---------------- render loop ---------------- */
  let lastT = performance.now();
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function frame(now) {
    requestAnimationFrame(frame);
    pollGamepads();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    state.poseClock += dt;

    // hit-stop freeze
    if (state.hitstop > 0) { state.hitstop -= dt; return; }

    // shake decay
    state.shake = Math.max(0, state.shake - dt * 30);

    // combo popup timers
    for (let p = 0; p < 2; p++) {
      if (comboPopT[p] > 0) {
        comboPopT[p] -= dt;
        if (comboPopT[p] <= 0) R.$('#combo' + (p === 0 ? 'L' : 'R')).classList.remove('show');
      }
    }

    const cw = innerWidth, ch = innerHeight;
    const cam = AR.makeCam(cw, ch);
    const arenaCfg = state.room ? CFG.ARENA[state.room.arena] : CFG.ARENA.city;

    // background
    ctx.save();
    if (state.shake > 0.3) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    AR.drawArena(ctx, arenaCfg, cam, now / 1000, { lava: arenaCfg.lava ? AR.FLOOR_Y + 90 : undefined });

    // fighters (interpolated between last two snapshots)
    const s1 = state.snaps[state.snaps.length - 1];
    const s0 = state.snaps.length > 1 ? state.snaps[state.snaps.length - 2] : null;
    let fighters = [];
    if (s1) {
      const f = s0 ? Math.min(1, Math.max(0, (now - s1.t) / Math.max(1, s1.t - s0.t))) : 1;
      fighters = s1.snap.f.map((sf, i) => {
        const pf = s0 ? s0.snap.f[i] : sf;
        const stChanged = pf.st !== sf.st;
        return {
          ...sf,
          x: SFA.lerp(pf.x, sf.x, f),
          y: SFA.lerp(pf.y, sf.y, f),
          vx: SFA.lerp(pf.vx, sf.vx, f),
          vy: SFA.lerp(pf.vy, sf.vy, f),
          hp: SFA.lerp(pf.hp, sf.hp, f),
          meter: SFA.lerp(pf.meter, sf.meter, f),
          stT: stChanged ? sf.stT : SFA.lerp(pf.stT, sf.stT, f),
          charge: SFA.lerp(pf.charge, sf.charge, f),
          poseT: state.poseClock,
        };
      });
      // HUD
      updateHUD(s1.snap, fighters);
    }

    // depth sort (draw higher fighters first)
    fighters.sort((a, b) => a.y - b.y);
    for (const f of fighters) {
      const c = CFG.CHAR[f.char];
      const scale = cam.s * (1 + (AR.FLOOR_Y - f.y) / AR.FLOOR_Y * 0.28) * 1.15;
      const alpha = f.vanish ? 0.25 : f.phase ? 0.55 : 1;
      drawStickman(ctx, f, c, { p: f.p, scale, alpha, glowColor: f.p === 0 ? '#ff2d2d' : '#2d9cff' });
      // name tag
      const sp = AR.worldToScreen(cam, f.x, f.y - 110 * scale / cam.s);
      ctx.save();
      ctx.font = '11px Orbitron, Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.p === 0 ? '#ff6a6a' : '#6ab8ff';
      ctx.shadowColor = f.p === 0 ? '#ff2d2d' : '#2d9cff';
      ctx.shadowBlur = 8;
      const m = state.room ? (state.room.matchup || [0, 1]) : [0, 1];
      const nm = state.room ? (state.room.players[m[f.p]].name || 'P' + (m[f.p] + 1)) : 'P' + (f.p + 1);
      ctx.fillText(nm, sp.x, sp.y);
      ctx.restore();
    }

    // projectiles
    if (s1) for (const pr of s1.snap.proj) {
      const sp = AR.worldToScreen(cam, pr.x, pr.y);
      ctx.save();
      ctx.shadowColor = '#7fd4ff'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#d9f6ff';
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, 16 * cam.s * 2.2, 10 * cam.s, 0, 0, 6.29);
      ctx.fill();
      ctx.restore();
    }

    // particles / rings / floaters
    AR.updateParticles(dt, cam);
    AR.updateRings(dt);
    AR.updateFloaters(dt, cam);
    AR.drawParticles(ctx, cam);
    AR.drawRings(ctx, cam);
    AR.drawFloaters(ctx, cam);

    ctx.restore();
  }

  function updateHUD(snap, fighters) {
    const [f1, f2] = fighters;
    if (!f1) return;
    const hp1 = SFA.$('#hp1'), hp2 = SFA.$('#hp2');
    const g1 = SFA.$('#hp1g'), g2 = SFA.$('#hp2g');
    hp1.style.width = f1.hp + '%';
    hp2.style.width = f2.hp + '%';
    hp1.classList.toggle('low', f1.hp < 25);
    hp2.classList.toggle('low', f2.hp < 25);
    // ghost bar trails
    const gp1 = parseFloat(g1.style.width || 100);
    const gp2 = parseFloat(g2.style.width || 100);
    if (gp1 > f1.hp) g1.style.width = Math.max(f1.hp, gp1 - 2) + '%';
    else g1.style.width = f1.hp + '%';
    if (gp2 > f2.hp) g2.style.width = Math.max(f2.hp, gp2 - 2) + '%';
    else g2.style.width = f2.hp + '%';
    if (snap.paused) return;
    hudMeter(SFA.$('#m1'), f1.meter);
    hudMeter(SFA.$('#m2'), f2.meter);
    const c1 = SFA.$('#c1'), c2 = SFA.$('#c2');
    c1.textContent = f1.combo > 1 ? 'COMBO ' + f1.combo + 'x' : '';
    c2.textContent = f2.combo > 1 ? 'COMBO ' + f2.combo + 'x' : '';
    c1.classList.toggle('big', f1.combo >= 5);
    c2.classList.toggle('big', f2.combo >= 5);
    SFA.$('#roundLabel').textContent = 'ROUND ' + Math.min(snap.round, 3) + ' / 3';
    hudPips(snap.p1wins, snap.p2wins);
    const tm = SFA.$('#timer');
    tm.textContent = snap.timer;
    tm.classList.toggle('low', snap.timer <= 10);
    // names (use the active matchup — matters in tournament mode)
    if (state.room) {
      const m = state.room.matchup || [0, 1];
      SFA.$('#nameP1').textContent = state.room.players[m[0]].name || '—';
      SFA.$('#nameP2').textContent = state.room.players[m[1]].name || '—';
      const d1 = SFA.$('#statusP1 .dot'), d2 = SFA.$('#statusP2 .dot');
      d1.classList.toggle('on', state.room.players[m[0]].connected);
      d2.classList.toggle('on', state.room.players[m[1]].connected);
    }
  }

  requestAnimationFrame(frame);

  /* HUD is also driven by a cheap 10Hz interval, so it stays live even if
     rAF gets throttled (background/occluded window) */
  let lastLowT = 99;
  setInterval(() => {
    const s1 = state.snaps[state.snaps.length - 1];
    if (!s1) return;
    const fighters = s1.snap.f.map(sf => ({
      ...sf, x: sf.x, y: sf.y, vx: sf.vx, vy: sf.vy,
      hp: sf.hp, meter: sf.meter, stT: sf.stT, charge: sf.charge,
      poseT: state.poseClock,
    }));
    updateHUD(s1.snap, fighters);
    // music intensity when someone is nearly dead
    if (s1.snap.status === 'fight' && s1.snap.f.some(f => f.hp <= 25)) AUDIO.music.setIntensity(true);
    // low timer beeps
    if (s1.snap.status === 'fight' && s1.snap.timer <= 10 && s1.snap.timer !== lastLowT && s1.snap.timer > 0) {
      AUDIO.play('lowtime');
      lastLowT = s1.snap.timer;
    }
    if (s1.snap.status !== 'fight') lastLowT = 99;
  }, 100);

  /* ---------------- char select previews ---------------- */
  setInterval(() => {
    const rs = state.room;
    if (!rs || rs.state !== 'charselect') return;
    previewCans.forEach((cv, i) => {
      const c = CFG.CHAR[CFG.CHAR_ORDER[i]];
      const pctx = cv.getContext('2d');
      pctx.clearRect(0, 0, 200, 140);
      // mini background
      const g = pctx.createLinearGradient(0, 0, 0, 140);
      g.addColorStop(0, '#0d0d18'); g.addColorStop(1, '#1a1a2e');
      pctx.fillStyle = g;
      pctx.fillRect(0, 0, 200, 140);
      pctx.strokeStyle = 'rgba(255,255,255,0.06)';
      pctx.beginPath(); pctx.moveTo(0, 118); pctx.lineTo(200, 118); pctx.stroke();
      preview(pctx, c, c.color, performance.now() / 1000, 'idle', 200, 140);
    });
  }, 100);

  /* ---------------- audio unlock on first interaction ---------------- */
  window.addEventListener('pointerdown', () => AUDIO.init(), { once: true });
  window.addEventListener('keydown', () => AUDIO.init(), { once: true });
})();
