/* ============================================================
   StickFight Arena — mobile controller
   Virtual joystick + ABXY + block/grab/special/dash +
   swipe/double-tap/circle/shake gestures + haptics.
   ============================================================ */
(function () {
  'use strict';
  const R = SFA;
  const CFG = window.SFA;
  const AUDIO = SFAAudio;
  const { preview } = SFAStickman;

  const state = {
    slot: -1, code: null, roomState: null, mode: '1v1', matchup: [0, 1],
    name: localStorage.getItem('sfa_name') || 'FIGHTER_' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    joystick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, ax: 0, ay: 0 },
    held: {}, lastSent: 0,
    hp: 100, combo: 0, ping: '—',
    gesture: { x0: 0, y0: 0, t0: 0, taps: 0, lastTap: 0, path: [], circling: false, angle: 0 },
    shakeCooldown: 0,
    settings: Object.assign({
      lefty: false, btnSize: 1, haptics: 0.7, gestures: true, opacity: 0.85, sound: true,
    }, JSON.parse(localStorage.getItem('sfa_settings') || '{}')),
    emoteIdx: 0,
  };

  /* ---------------- socket ---------------- */
  const sock = SFA.connect({
    onConnect: () => {
      R.$('#connStatus').textContent = '🟢 connected';
      const boot = R.$('#boot');
      if (boot) boot.classList.add('hide');
    },
    onDisconnect: () => {
      R.$('#connStatus').textContent = '🔴 offline';
      const boot = R.$('#boot');
      if (boot) boot.classList.remove('hide');
    },
    onLatency: (ms) => { state.ping = ms; },
  });

  /* ---- deep link ?room=CODE ---- */
  const qroom = new URLSearchParams(location.search).get('room');
  if (qroom) setTimeout(() => {
    R.screen('pairing');
    R.$('#codeInput').value = qroom.toUpperCase();
    join(qroom);
  }, 300);

  sock.on('joined', (d) => {
    state.slot = d.slot;
    state.code = d.code;
    state.mode = d.mode || '1v1';
    state.matchup = d.matchup || [0, 1];
    if (d.spectate) {
      R.toast('👀 You joined as spectator');
      R.screen('spectate');
      R.haptic.tap();
      return;
    }
    if (d.state === 'fight' && state.mode === 'tournament' && !d.matchup.includes(d.slot)) {
      R.screen('waiting');
      renderWaitingBracket();
      return;
    }
    R.$('#cPname').textContent = (state.slot === 0 ? '🔴 P1' : '🔵 P2') + ' · ' + state.name;
    if (d.state === 'charselect') R.screen('charselect');
    else if (d.state === 'fight' || d.state === 'result') R.screen('controller');
    else R.screen('charselect');
    R.toast('Connected as Player ' + (d.slot + 1));
    R.haptic.round();
  });

  sock.on('room:state', (rs) => {
    state.roomState = rs;
    state.mode = rs.mode || state.mode;
    state.matchup = rs.matchup || state.matchup;
    if (state.slot < 0) return;
    if (rs.state === 'charselect') {
      if (state.mode === 'tournament' && rs.players[state.slot] && rs.players[state.slot].locked) {
        // already locked in — waiting for the next match
        renderWaitingBracket();
        R.screen('waiting');
      } else {
        R.screen('charselect');
        R.$('#lockBtn').textContent = '🔒 LOCK IN';
        R.$('#lockBtn').disabled = false;
        R.$('#csNote').textContent = '';
      }
    } else if (rs.state === 'fight' || rs.state === 'result') {
      if (state.mode === 'tournament' && rs.matchup && !rs.matchup.includes(state.slot)) {
        renderWaitingBracket();
        R.screen('waiting');
      } else {
        R.screen('controller');
        R.$('#lockBtn').textContent = '🔒 LOCK IN';
        R.$('#lockBtn').disabled = false;
        R.$('#csNote').textContent = '';
      }
    }
  });

  /* ---- tournament bracket (waiting screen) ---- */
  function renderWaitingBracket() {
    const rs = state.roomState;
    if (!rs || !rs.bracket) return;
    const b = rs.bracket;
    const p = (s) => rs.players[s] ? (rs.players[s].name || 'P' + (s + 1)) : 'P' + (s + 1);
    const row = (stage, names, cls, extra) =>
      `<div class="wait-row ${cls}"><span class="stage">${stage}</span><span>${names}</span>${extra || ''}</div>`;
    let html = row('SF1', p(0) + ' vs ' + p(1), b.results[0] !== undefined ? 'win' : '');
    if (b.results[0] !== undefined) html += row('SF1 WINNER', '✅ ' + p(b.results[0]), 'win');
    html += row('SF2', p(2) + ' vs ' + p(3), b.results[1] !== undefined ? 'win' : '');
    if (b.results[1] !== undefined) html += row('SF2 WINNER', '✅ ' + p(b.results[1]), 'win');
    const finalists = b.results.length >= 2 ? b.results : null;
    html += row('FINAL', finalists ? p(finalists[0]) + ' vs ' + p(finalists[1]) : '—', b.champion !== null ? 'win' : '');
    if (b.champion !== null) html += row('CHAMPION', '🏆 ' + p(b.champion), 'champ');
    R.$('#waitBracket').innerHTML = html;
    // highlight my slot
    R.$('#waitYou').textContent =
      b.champion !== null
        ? (b.champion === state.slot ? '🏆 YOU ARE THE CHAMPION!' : 'Tournament over — rematch incoming')
        : (b.matchup && b.matchup.includes(state.slot) ? '⚔️ YOUR MATCH IS UP!' : 'You fight in: ' + (state.slot < 2 ? 'Semifinal 1' : 'Semifinal 2') + ' · waiting…');
  }
  sock.on('tournament:update', ({ bracket }) => {
    if (!state.roomState) return;
    state.roomState.bracket = bracket;
    state.roomState.matchup = bracket.matchup;
    renderWaitingBracket();
  });
  sock.on('tournament:done', ({ champion, championName }) => {
    R.toast('🏆 ' + championName + ' is the champion!');
    if (champion === state.slot) {
      R.haptic.victory();
      const t = R.$('#resTitle');
      t.textContent = 'CHAMPION 🏆';
      t.className = 'result-title neon-gold';
      R.$('#resSub').textContent = 'You won the tournament!';
      R.screen('result');
    }
  });

  sock.on('match:state', (snap) => {
    if (state.slot >= 0 && snap.f[state.slot]) {
      const f = snap.f[state.slot];
      state.hp = f.hp;
      state.combo = f.combo;
      R.$('#cHp').style.width = f.hp + '%';
      R.$('#cHp').style.background = f.hp < 25 ? 'linear-gradient(90deg,#a30000,#ff2d2d)' : 'linear-gradient(90deg,#a30000,#ff2d2d)';
      R.$('#cCombo').textContent = f.combo > 1 ? f.combo + 'x' : '';
      R.$('#cCombo').style.opacity = f.combo > 1 ? 1 : 0.25;
    }
    R.$('#cPing').textContent = state.ping + 'ms';
    R.$('#cPing').className = 'ping' + (state.ping > 100 ? ' bad' : state.ping > 50 ? ' warn' : '');
    if (snap.status === 'countdown' && snap.countdown > 0) R.$('#cCombo').textContent = snap.countdown;
    if (snap.status === 'fight') R.$('#cCombo').textContent = state.combo > 1 ? state.combo + 'x' : 'FIGHT';
    // spectator HUD
    if (state.slot < 0) {
      R.$('#specHp1').style.width = snap.f[0].hp + '%';
      R.$('#specHp2').style.width = snap.f[1].hp + '%';
      R.$('#specRound').textContent = snap.status === 'countdown'
        ? 'ROUND ' + snap.round + ' · ' + snap.countdown
        : (snap.status === 'fight' ? 'ROUND ' + snap.round + ' · ' + snap.timer + 's' : snap.status.toUpperCase());
    }
  });

  /* spectator emotes → float on the PC screen */
  R.$$('#spectate .spec-emo').forEach(b => {
    b.onclick = () => {
      sock.emit('emote', b.dataset.e);
      R.haptic.tap();
      b.style.transform = 'scale(1.25)';
      setTimeout(() => b.style.transform = '', 140);
    };
  });

  /* haptic + audio feedback from match events */
  sock.on('match:event', (ev) => {
    const d = ev.data || {};
    const hap = (fn) => { if (state.settings.haptics > 0) fn(); };
    switch (ev.kind) {
      case 'hit': {
        if (state.slot < 0) break;
        if (d.target === state.slot) hap(R.haptic.buzz);
        else if (d.p === state.slot) hap(R.haptic.tap);
        if (state.settings.sound) AUDIO.play(d.kind === 'heavy' ? 'heavy' : d.kind === 'kick' ? 'kick' : 'light');
        break;
      }
      case 'combo': if (d.p === state.slot) hap(() => R.haptic.combo(d.count)); break;
      case 'ko':
        if (d.winner === state.slot) hap(R.haptic.victory);
        else hap(R.haptic.heavy);
        break;
      case 'fight': hap(R.haptic.tap); if (state.settings.sound) AUDIO.play('count', 0); break;
      case 'roundstart': hap(R.haptic.round); break;
      case 'special': if (d.p === state.slot) hap(R.haptic.heavy); break;
      case 'ult': if (d.p === state.slot) hap(R.haptic.victory); break;
      case 'block': if (d.p === state.slot) hap(R.haptic.tap); break;
      case 'grab': if (d.p === state.slot) hap(R.haptic.buzz); break;
      case 'throw': if (d.target === state.slot) hap(R.haptic.buzz); break;
      case 'freeze': if (d.p === state.slot) hap(R.haptic.heavy); break;
      case 'possess': if (d.p === state.slot) hap(R.haptic.victory); break;
      case 'emote': if (d.p === state.slot) hap(R.haptic.tap); break;
    }
  });

  sock.on('match:end', (d) => {
    const winner = d.winner;
    if (state.slot < 0) {
      // spectator: show winner + return to watching next match
      R.$('#resTitle').textContent = (d.players && d.players[winner] ? d.players[winner].name : 'P' + (winner + 1)).toUpperCase() + ' WINS';
      R.$('#resTitle').className = 'result-title ' + (winner === 0 ? 'neon-red' : 'neon-blue');
      R.$('#resSub').textContent = (d.reason || 'K.O.') + ' · ' + (d.p1wins || 0) + ' — ' + (d.p2wins || 0);
      R.screen('result');
      setTimeout(() => { if (state.roomState && state.roomState.state === 'charselect') R.screen('spectate'); }, 3500);
      return;
    }
    const title = R.$('#resTitle');
    title.textContent = winner === state.slot ? 'VICTORY 🏆' : 'DEFEAT';
    title.className = 'result-title ' + (winner === state.slot ? 'neon-gold' : 'neon-red');
    const st = d.stats && d.stats[state.slot];
    R.$('#resSub').innerHTML = (winner === state.slot ? 'You dominated the arena!' : 'Better luck next round…') +
      (st ? `<br><span style="font-size:12px;letter-spacing:1px;color:var(--muted);margin-top:6px;display:inline-block;">DMG ${Math.round(st.dmg)} · HITS ${st.hits} · BEST COMBO ${st.bestCombo}x · KOs ${st.kos}</span>` : '');
    R.screen('result');
    if (winner === state.slot) { R.haptic.victory(); if (state.settings.sound) AUDIO.play('win'); }
    else { R.haptic.heavy(); if (state.settings.sound) AUDIO.play('lose'); }
    setTimeout(() => { if (state.roomState && state.roomState.state === 'charselect') R.screen('charselect'); }, 4000);
  });

  /* ---------------- screens ---------------- */
  R.$('#joinBtn').onclick = () => R.screen('pairing');
  R.$('#howBtn').onclick = () => {
    R.screen('pairing');
    R.toast('📖 Code from PC → Fight! Swipe up to jump, shake for Rage!');
  };
  R.$('#backHomeBtn').onclick = () => R.screen('home');
  R.$('#settingsHomeBtn').onclick = () => openSettings();
  R.$('#closeSettings').onclick = () => R.screen(state.slot >= 0 ? 'controller' : 'home');
  R.$('#enterBtn').onclick = () => join(R.$('#codeInput').value);
  R.$('#codeInput').addEventListener('input', (e) => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3);
    e.target.value = v;
  });
  R.$('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(e.target.value); });

  function join(code) {
    if (!code) return R.toast('Enter the room code first', 'err');
    sock.emit('join', { code, name: state.name }, (res) => {
      if (!res || !res.ok) R.toast(res && res.reason === 'ROOM_NOT_FOUND' ? 'Room not found — check the code' : 'Could not join', 'err');
    });
  }

  /* ---- auto-detect nearby ---- */
  R.$('#nearbyBtn').onclick = async () => {
    const list = R.$('#nearbyList');
    list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:10px;">scanning…</div>';
    try {
      const r = await fetch('/api/rooms');
      const rooms = await r.json();
      if (!rooms.length) { list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:10px;">no open games on this server</div>'; return; }
      list.innerHTML = '';
      for (const rm of rooms) {
        const el = document.createElement('div');
        el.className = 'nearby-item';
        el.innerHTML = `<span>🥊 ${rm.code}</span><span class="info">${rm.players}/2 players · ${rm.arena}</span>`;
        el.onclick = () => { R.$('#codeInput').value = rm.code; join(rm.code); };
        list.appendChild(el);
      }
    } catch (e) {
      list.innerHTML = '<div style="color:var(--p1);text-align:center;padding:10px;">server unreachable — enter its address below</div>';
    }
  };

  /* ---- manual server address ---- */
  R.$('#serverInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let url = e.target.value.trim();
      if (!url) return;
      if (!/^https?:\/\//.test(url)) url = 'http://' + url;
      if (state.code) location.href = url + '/mobile.html?room=' + state.code;
      else location.href = url + '/mobile.html';
    }
  });

  /* ---- QR scan ---- */
  R.$('#scanBtn').onclick = () => {
    if (!window.jsQR) return R.toast('Scanner not available here', 'err');
    const box = R.$('#scanBox');
    box.classList.add('active');
    const video = R.$('#scanVideo');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        video.srcObject = stream;
        video.play();
        scanLoop();
      })
      .catch(() => { box.classList.remove('active'); R.toast('Camera unavailable', 'err'); });
  };
  R.$('#scanClose').onclick = () => { stopScan(); };
  let scanTimer = null;
  function scanLoop() {
    const video = R.$('#scanVideo');
    if (!R.$('#scanBox').classList.contains('active')) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const cv = document.createElement('canvas');
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      const c = cv.getContext('2d');
      c.drawImage(video, 0, 0);
      const img = c.getImageData(0, 0, cv.width, cv.height);
      const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (res && res.data) {
        const m = res.data.match(/[?&]room=([A-Z0-9-]+)/i) || res.data.match(/([A-Z]{3}-\d{3})/i);
        if (m) {
          stopScan();
          R.$('#codeInput').value = m[1].toUpperCase();
          R.haptic.tap();
          join(m[1]);
          return;
        }
      }
    }
    scanTimer = setTimeout(scanLoop, 120);
  }
  function stopScan() {
    R.$('#scanBox').classList.remove('active');
    clearTimeout(scanTimer);
    const video = R.$('#scanVideo');
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }

  /* ---------------- character select (phone) ---------------- */
  const csc = [];
  (function buildCS() {
    const grid = R.$('#csGrid');
    for (const id of CFG.CHAR_ORDER) {
      const c = CFG.CHAR[id];
      const card = document.createElement('div');
      card.className = 'cs-card';
      card.innerHTML = `<canvas width="180" height="120"></canvas><div class="nm" style="color:${c.color}">${c.emoji} ${c.name}</div><div class="st">${c.style}</div>`;
      card.onclick = () => {
        sock.emit('char:select', id);
        grid.querySelectorAll('.cs-card').forEach(x => x.classList.remove('sel'));
        card.classList.add('sel');
        state.char = id;
        R.haptic.tap();
      };
      grid.appendChild(card);
      csc.push({ card, canvas: card.querySelector('canvas') });
    }
    R.$('#lockBtn').onclick = () => {
      if (!state.char) return R.toast('Pick a fighter first', 'err');
      sock.emit('char:lock', true);
      R.$('#lockBtn').textContent = '🔒 LOCKED ✓';
      R.$('#lockBtn').disabled = true;
      R.$('#csNote').textContent = 'Waiting for the other fighter…';
      R.haptic.round();
    };
  })();

  setInterval(() => {
    if (!R.$('#charselect').classList.contains('active')) return;
    csc.forEach(({ canvas }, i) => {
      const c = CFG.CHAR[CFG.CHAR_ORDER[i]];
      const p = canvas.getContext('2d');
      p.clearRect(0, 0, 180, 120);
      const g = p.createLinearGradient(0, 0, 0, 120);
      g.addColorStop(0, '#0d0d18'); g.addColorStop(1, '#1a1a2e');
      p.fillStyle = g; p.fillRect(0, 0, 180, 120);
      preview(p, c, c.color, performance.now() / 1000, 'idle', 180, 120);
    });
  }, 100);

  /* ---------------- joystick ---------------- */
  const joyBase = R.$('#joyBase'), joyKnob = R.$('#joyKnob');
  const zLeft = R.$('#zoneLeft');
  const JOY_R = 55;

  zLeft.addEventListener('pointerdown', (e) => {
    if (state.slot < 0) return;
    e.preventDefault();
    try { zLeft.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/non-active pointer */ }
    state.joystick.active = true;
    state.joystick.id = e.pointerId;
    const r = zLeft.getBoundingClientRect();
    state.joystick.ox = e.clientX - r.left;
    state.joystick.oy = e.clientY - r.top;
    joyBase.classList.remove('ghost');
    joyBase.style.left = state.joystick.ox + 'px';
    joyBase.style.bottom = 'auto';
    joyBase.style.top = (state.joystick.oy - 65) + 'px';
    updateJoy(e);
  });
  zLeft.addEventListener('pointermove', (e) => {
    if (state.joystick.active && e.pointerId === state.joystick.id) updateJoy(e);
  });
  function endJoy(e) {
    if (state.joystick.active && (!e || e.pointerId === state.joystick.id)) {
      state.joystick.active = false;
      state.joystick.ax = 0; state.joystick.ay = 0;
      joyKnob.style.transform = 'translate(-50%,-50%)';
      sendInput();
      setTimeout(() => joyBase.classList.add('ghost'), 180);
    }
  }
  zLeft.addEventListener('pointerup', endJoy);
  zLeft.addEventListener('pointercancel', endJoy);
  zLeft.addEventListener('pointerleave', endJoy);

  function updateJoy(e) {
    const r = zLeft.getBoundingClientRect();
    let dx = e.clientX - r.left - state.joystick.ox;
    let dy = e.clientY - r.top - state.joystick.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    state.joystick.ax = dx / JOY_R;
    state.joystick.ay = dy / JOY_R;
    // deadzone
    if (Math.abs(state.joystick.ax) < 0.12) state.joystick.ax = 0;
    if (Math.abs(state.joystick.ay) < 0.12) state.joystick.ay = 0;
    sendInput();
  }

  /* ---------------- buttons ---------------- */
  function btn(el, name, onPress, onRelease) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      if (state.settings.haptics > 0) R.haptic.tap();
      if (state.settings.sound) AUDIO.play('emote');
      onPress && onPress();
    });
    el.addEventListener('pointerup', () => {
      el.classList.remove('pressed');
      onRelease && onRelease();
    });
    el.addEventListener('pointercancel', () => {
      el.classList.remove('pressed');
      onRelease && onRelease();
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('pressed');
      onRelease && onRelease();
    });
  }
  const act = (name, data) => { if (state.slot >= 0) sock.emit('action', { name, data }); };

  btn(R.$('#btnA'), 'A', () => act('A'));
  btn(R.$('#btnB'), 'B', () => act('B'));
  btn(R.$('#btnX'), 'X', () => act('X'));
  btn(R.$('#btnY'), 'Y', () => act('Y'));
  btn(R.$('#btnRB'), 'RB', () => { state.held.RB = true; sendInput(); }, () => { state.held.RB = false; act('releaseRB'); sendInput(); });
  btn(R.$('#btnBlock'), 'BLOCK', () => { state.held.block = true; act('blockOn'); sendInput(); }, () => { state.held.block = false; act('blockOff'); sendInput(); });
  btn(R.$('#btnGrab'), 'GRAB', () => act('grab'));
  btn(R.$('#btnDash'), 'DASH', () => act('dash'));
  btn(R.$('#btnSpecial'), 'SPECIAL', () => act('Y'));

  /* ultimate: long-press special when meter full is handled via Y button; add ult button combo: double-tap special = ultimate */
  let specialTaps = 0, specialTapT = 0;
  R.$('#btnSpecial').addEventListener('pointerdown', () => {
    if (Date.now() - specialTapT < 350) {
      specialTaps++;
      if (specialTaps >= 2) { act('ult'); specialTaps = 0; R.haptic.victory(); }
    } else specialTaps = 1;
    specialTapT = Date.now();
  });

  /* ---------------- gestures ---------------- */
  const zGest = R.$('#zoneGesture');
  const g = state.gesture;

  zGest.addEventListener('pointerdown', (e) => {
    if (!state.settings.gestures || state.slot < 0) return;
    if (e.pointerType === 'touch' && e.isPrimary) {
      g.x0 = e.clientX; g.y0 = e.clientY; g.t0 = performance.now();
      g.path = [{ x: e.clientX, y: e.clientY }];
      g.angle = 0;
      g.touchId = e.pointerId;
      zGest.setPointerCapture(e.pointerId);
    } else if (e.pointerType === 'touch') {
      // second finger = taunt
      g.twoFinger = true;
      act('taunt', { emoji: '😤' });
      R.haptic.tap();
    }
  });
  zGest.addEventListener('pointermove', (e) => {
    if (g.touchId !== e.pointerId || !g.path.length) return;
    const p = { x: e.clientX, y: e.clientY };
    const last = g.path[g.path.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 8) {
      // circle detection via cumulative angle
      if (g.path.length > 2) {
        const a1 = Math.atan2(g.path[0].y - g.path[1].y, g.path[0].x - g.path[1].x);
        const a2 = Math.atan2(p.y - last.y, p.x - last.x);
        let dA = a2 - a1;
        while (dA > Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        g.angle += Math.abs(dA);
        g.path.shift();
      }
      g.path.push(p);
      if (g.angle > Math.PI * 2) { act('spin'); g.angle = 0; R.haptic.buzz(); }
    }
  });
  zGest.addEventListener('pointerup', (e) => {
    if (e.pointerId !== g.touchId) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    const dur = performance.now() - g.t0;
    if (Math.hypot(dx, dy) < 14 && dur < 280) {
      // tap → double-tap dodge
      if (performance.now() - g.lastTap < 320) { act('dodge'); g.lastTap = 0; R.haptic.tap(); }
      else g.lastTap = performance.now();
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 40) {
      act(dy < 0 ? 'jump' : 'slide');
      R.haptic.tap();
    } else if (Math.abs(dx) > 40) {
      act(dx > 0 ? 'dash' : 'dodge');
      R.haptic.tap();
    }
    g.touchId = null; g.path = []; g.twoFinger = false;
  });

  /* ---- shake = Rage Mode ---- */
  let lastAccel = 0;
  window.addEventListener('devicemotion', (e) => {
    if (!state.settings.gestures || state.slot < 0) return;
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.abs(a.x) + Math.abs(a.y) + Math.abs(a.z);
    const now = performance.now();
    if (mag - lastAccel > 22 && now - state.shakeCooldown > 4000) {
      state.shakeCooldown = now;
      act('rage');
      R.haptic.victory();
      R.toast('😡 RAGE MODE!');
    }
    lastAccel = mag;
  });

  /* ---------------- input sender (held state, 20Hz) ---------------- */
  function sendInput() {
    if (state.slot < 0) return;
    const now = performance.now();
    if (now - state.lastSent < 50) return;
    state.lastSent = now;
    sock.emit('input', {
      ax: state.joystick.ax, ay: state.joystick.ay,
      held: { ...state.held },
      ts: Date.now(),
    });
  }
  setInterval(sendInput, 50);

  /* ---------------- util buttons ---------------- */
  const EMOTES = ['😤', '🔥', '👏', '💀', '😱', '❤️', '🤡', '😈'];
  R.$('#emoteBtn').onclick = () => {
    state.emoteIdx = (state.emoteIdx + 1) % EMOTES.length;
    R.$('#emoteBtn').textContent = EMOTES[state.emoteIdx];
    sock.emit('emote', EMOTES[state.emoteIdx]);
    R.haptic.tap();
  };
  R.$('#pauseBtn').onclick = () => { sock.emit('pause'); R.haptic.tap(); };
  R.$('#settingsBtn').onclick = openSettings;

  /* ---------------- settings ---------------- */
  function openSettings() {
    R.$('#settings').classList.add('active');
    applySettings();
  }
  function applySettings() {
    const s = state.settings;
    localStorage.setItem('sfa_settings', JSON.stringify(s));
    R.$('#controller').classList.toggle('lefty', s.lefty);
    R.$('#setLefty').classList.toggle('on', s.lefty);
    document.querySelectorAll('#settings .seg-btns[data-setting]').forEach(() => {});
    // button size
    document.documentElement.style.setProperty('--btn-scale', s.btnSize);
    for (const el of R.$$('.abxy, .action-row, .joystick-base')) {
      el.style.transform = `scale(${s.btnSize})`;
      el.style.transformOrigin = 'bottom center';
    }
    // opacity
    R.$('#controller').style.opacity = s.opacity;
    // haptic / sound / gesture toggles
    R.$('#setGestures').classList.toggle('on', s.gestures);
    R.$('#setSound').classList.toggle('on', s.sound);
    AUDIO.setMuted(!s.sound);
  }
  R.$('#setLefty').onclick = (e) => { state.settings.lefty = !state.settings.lefty; applySettings(); };
  R.$('#setGestures').onclick = (e) => { state.settings.gestures = !state.settings.gestures; applySettings(); };
  R.$('#setSound').onclick = (e) => { state.settings.sound = !state.settings.sound; applySettings(); };
  R.$$('#settings .seg').forEach(seg => {
    seg.onclick = () => {
      const parent = seg.parentElement;
      const set = parent.dataset.setting;
      parent.querySelectorAll('.seg').forEach(x => x.classList.remove('on'));
      seg.classList.add('on');
      const s = state.settings;
      if (set === 'size') { s.btnSize = parseFloat(seg.dataset.size); }
      if (set === 'haptic') { s.haptics = parseFloat(seg.dataset.haptic); }
      if (set === 'opacity') { s.opacity = parseFloat(seg.dataset.opacity); }
      applySettings();
      R.haptic.tap();
    };
  });
  // wire up data-setting attrs
  R.$('#settings .size-row').dataset.setting = 'size';
  R.$$('#settings .seg-btns')[1].dataset.setting = 'haptic';
  R.$$('#settings .seg-btns')[2].dataset.setting = 'opacity';

  applySettings();

  /* ---------------- splash ---------------- */
  const scv = R.$('#splashCanvas');
  const sctx = scv.getContext('2d');
  const splashT0 = performance.now();
  R.haptic.victory();
  AUDIO.init();
  (function splash() {
    const t = (performance.now() - splashT0) / 1000;
    if (t > 2.7) {
      // done — stop the loop (critical: never re-force screens afterwards)
      R.$('#splash').classList.remove('active');
      R.screen('home');
      return;
    }
    sctx.clearRect(0, 0, 360, 440);
    const g = sctx.createLinearGradient(0, 0, 0, 440);
    g.addColorStop(0, '#07070f'); g.addColorStop(1, '#12122a');
    sctx.fillStyle = g; sctx.fillRect(0, 0, 360, 440);
    // stickman flip: jump → spin → taunt → punch
    let pose = 'jump';
    if (t > 0.6) pose = 'spin';
    if (t > 1.3) pose = 'taunt';
    if (t > 2.0) pose = 'attack';
    preview(sctx, CFG.CHAR.blaze, '#ff2d2d', t * 3, pose, 360, 400);
    if (t > 1.9) R.$('#splashBadge').classList.add('show');
    requestAnimationFrame(splash);
  })();
})();
