import React, { useEffect, useState, useRef } from 'react';

/* Fallback shown while the server is unreachable (e.g. static hosting):
   offer a local bot demo or a custom server address. */
function BootFallback({ connected, serverInput, setServerInput, onDemo, onServer }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 4000); // give the server a chance
    return () => clearTimeout(t);
  }, []);
  if (connected || !show) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginTop: 10 }}>
      <div className="txt" style={{ color: '#ff9d9d' }}>⚠️ GAME SERVER NOT REACHABLE</div>
      <button className="btn gold" onClick={onDemo} style={{ fontSize: 15, padding: '14px 26px' }}>
        🎮 PLAY LOCAL DEMO (BOTS)
      </button>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          value={serverInput} onChange={e => setServerInput(e.target.value)}
          placeholder="http://your-server:3000"
          style={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 13, width: 240 }}
        />
        <button className="btn small" onClick={onServer}>CONNECT</button>
      </div>
      <div className="txt" style={{ maxWidth: 420, lineHeight: 1.7, marginTop: 6 }}>
        For online 1v1 with friends, run the game server (see DEPLOY.md) and enter its
        address here — then the full lobby, QR pairing and tournaments unlock.
      </div>
    </div>
  );
}
import { store, on, connect, sio, setServer, startLocalDemo } from '../game/net.js';
import ArenaCanvas from '../game/engine/ArenaCanvas.jsx';
import Lobby from './Lobby.jsx';
import CharSelect from './CharSelect.jsx';
import Hud from './Hud.jsx';
import Result from './Result.jsx';
import ReplayBar, { startReplay, stopReplay } from './ReplayBar.jsx';
import ControlsOverlay from './ControlsOverlay.jsx';

export default function Game() {
  const [screen, setScreen] = useState('boot'); // boot|lobby|charselect|hud|result
  const [banner, setBanner] = useState(null);
  const [comboPop, setComboPop] = useState([null, null]);
  const [result, setResult] = useState(null);
  const [muted, setMuted] = useState(false);
  const [replayT, setReplayT] = useState(null); // visible while replaying
  const [toastMsg, setToastMsg] = useState(null);
  const [connected, setConnected] = useState(false);
  const [serverInput, setServerInput] = useState('');
  const comboPopT = useRef([0, 0]);

  /* ---------- socket wiring ---------- */
  useEffect(() => {
    const offs = [];
    connect();
    offs.push(on('connected', () => {
      setConnected(true);
      if (store.demoMode) return;
      setScreen('lobby');
      if (!store.code) sio().emit('host:create', { origin: location.origin });
    }));
    offs.push(on('disconnected', () => { setConnected(false); if (!store.demoMode) setScreen('boot'); }));
    offs.push(on('room:state', (rs) => {
      // stay on the HUD while a replay is playing (room may advance underneath)
      if (store.replay) return;
      setScreen(rs.state === 'lobby' ? 'lobby' : rs.state === 'charselect' ? 'charselect' : 'hud');
    }));
    offs.push(on('match:start', () => { setScreen('hud'); setReplayT(null); }));
    offs.push(on('banner', (b) => {
      setBanner(b);
      setTimeout(() => setBanner(null), b.t || 900);
    }));
    offs.push(on('combopop', ({ p, count, label }) => {
      const arr = [null, null];
      arr[p] = { count, label };
      setComboPop(prev => ({ ...prev, [p]: { count, label } }));
      comboPopT.current[p] = 1.2;
    }));
    offs.push(on('toast', ({ msg }) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 2400); }));
    offs.push(on('paused', (paused) => { store.paused = paused; }));
    offs.push(on('match:end', (d) => { setResult(d); setScreen('result'); }));
    offs.push(on('tournament:update', (d) => {
      if (store.room) { store.room.bracket = d.bracket; store.room.matchup = d.matchup; }
      const stage = { sf2: 'Semifinal 2 starting', final: 'THE FINAL' }[d.bracket.phase];
      if (stage) { setToastMsg('⚔️ ' + stage + '!'); setTimeout(() => setToastMsg(null), 2400); }
    }));
    offs.push(on('tournament:done', ({ championName }) => {
      setToastMsg('🏆 CHAMPION: ' + championName + '!');
      setTimeout(() => setToastMsg(null), 3000);
    }));
    return () => offs.forEach(f => f());
  }, []);

  /* ---------- combo popup timers ---------- */
  useEffect(() => {
    const t = setInterval(() => {
      comboPopT.current = comboPopT.current.map(v => Math.max(0, v - 0.1));
      if (comboPopT.current[0] <= 0 || comboPopT.current[1] <= 0) {
        const arr = [null, null];
        if (comboPopT.current[0] <= 0) arr[0] = null;
        if (comboPopT.current[1] <= 0) arr[1] = null;
        setComboPop(prev => {
          const next = { ...prev };
          if (comboPopT.current[0] <= 0) next[0] = null;
          if (comboPopT.current[1] <= 0) next[1] = null;
          return next;
        });
      }
    }, 100);
    return () => clearInterval(t);
  }, []);

  /* ---------- console: keyboard + gamepad (port of classic client) ---------- */
  useEffect(() => {
    const kb = { ax: 0, ay: 0, held: {} };
    const KB_MAP = {
      KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
      ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
      Space: 'jump', ShiftLeft: 'block', ShiftRight: 'block', ControlLeft: 'dash', ControlRight: 'dash',
      KeyJ: 'A', KeyK: 'B', KeyL: 'X', KeyU: 'Y', KeyO: 'ult', KeyE: 'grab', KeyR: 'RB', KeyQ: 'taunt', KeyF: 'rage',
    };
    const slot = () => {
      const room = store.room;
      if (!room) return -1;
      const slots = room.mode === 'tournament' ? (room.matchup || [0, 1]) : [0, 1];
      for (const s of slots) { const pl = room.players[s]; if (pl && !pl.connected && !pl.isBot) return s; }
      return -1;
    };
    const act = (name, data) => { if (slot() >= 0) sio().emit('action', { name, data }); };
    const send = () => { if (slot() >= 0) sio().emit('input', { ax: kb.ax, ay: kb.ay, held: { ...kb.held } }); };
    const down = (e) => {
      if (e.code === 'KeyM' && !e.repeat) { setMuted(m => { window.SFAAudio.setMuted(!m); return !m; }); }
      if (e.code === 'KeyP' && !e.repeat) sio().emit('pause');
      const k = KB_MAP[e.code];
      if (!k) return;
      if (['up', 'left', 'down', 'right', 'block', 'dash'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      switch (k) {
        case 'up': kb.ax = 0; kb.ay = -1; act('jump'); break;
        case 'down': kb.ay = 1; kb.ax = 0; break;
        case 'left': kb.ax = -1; kb.ay = 0; break;
        case 'right': kb.ax = 1; kb.ay = 0; break;
        case 'jump': act('jump'); break;
        case 'block': kb.held.block = true; act('blockOn'); break;
        case 'dash': act('dash'); break;
        case 'RB': kb.held.RB = true; break;
        case 'A': case 'B': case 'X': case 'Y': act(k); break;
        case 'ult': act('ult'); break;
        case 'grab': act('grab'); break;
        case 'taunt': act('taunt', { emoji: '😤' }); break;
        case 'rage': act('rage'); break;
      }
      send();
    };
    const up = (e) => {
      const k = KB_MAP[e.code];
      if (!k) return;
      switch (k) {
        case 'up': if (kb.ay === -1) kb.ay = 0; break;
        case 'down': if (kb.ay === 1) kb.ay = 0; break;
        case 'left': if (kb.ax === -1) kb.ax = 0; break;
        case 'right': if (kb.ax === 1) kb.ax = 0; break;
        case 'block': kb.held.block = false; act('blockOff'); break;
        case 'RB': kb.held.RB = false; act('releaseRB'); break;
      }
      send();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    // gamepads — polled from the canvas loop via a hook
    const padState = {};
    window.__pollPads = () => {
      let pads = [];
      try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
      const room = store.room;
      if (!room) return;
      const free = (room.mode === 'tournament' ? (room.matchup || [0, 1]) : [0, 1]).filter(s => {
        const pl = room.players[s]; return pl && !pl.connected && !pl.isBot;
      });
      for (let i = 0; i < pads.length && i < 2; i++) {
        const gp = pads[i];
        if (!gp) { delete padState[i]; continue; }
        const st = padState[i] || (padState[i] = { slot: -1, prev: [] });
        if (st.slot === -1 || !free.includes(st.slot)) st.slot = free[i] !== undefined ? free[i] : -1;
        if (st.slot < 0) { st.prev = gp.buttons.map(b => b.pressed); continue; }
        let mx = gp.axes[0] || 0, my = gp.axes[1] || 0;
        if (Math.abs(mx) < 0.12) mx = 0;
        if (Math.abs(my) < 0.12) my = 0;
        if (gp.buttons[14].pressed) mx = -1;
        if (gp.buttons[15].pressed) mx = 1;
        if (gp.buttons[12].pressed) my = -1;
        if (gp.buttons[13].pressed) my = 1;
        const held = {};
        if (gp.buttons[4].pressed) held.block = true;
        if (gp.buttons[5].pressed) held.RB = true;
        sio().emit('input', { ax: mx, ay: my, held });
        const MAP = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 6: 'dash', 7: 'grab', 9: 'rage', 8: 'pause' };
        gp.buttons.forEach((b, bi) => {
          if (b.pressed && !st.prev[bi]) { const a = MAP[bi]; if (a === 'pause') { sio().emit('pause'); return; } if (a) sio().emit('action', { name: a }); }
          if (!b.pressed && st.prev[bi] && bi === 5) sio().emit('action', { name: 'releaseRB' });
          if (!b.pressed && st.prev[bi] && bi === 4) sio().emit('action', { name: 'blockOff' });
        });
        st.prev = gp.buttons.map(b => b.pressed);
      }
    };
    // hook pad polling into the rAF loop
    const orig = window.requestAnimationFrame;
    const raf = window.requestAnimationFrame;
    // ArenaCanvas already loops; poll pads from a lightweight own loop instead
    const padTimer = setInterval(() => window.__pollPads && window.__pollPads(), 100);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      clearInterval(padTimer);
      delete window.__pollPads;
    };
  }, []);

  const replayExit = () => { stopReplay(); setReplayT(null); setScreen('result'); };

  return (
    <>
      {screen !== 'boot' && screen !== 'lobby' && screen !== 'charselect' && <ArenaCanvas />}
      {screen === 'boot' && (
        <div id="boot" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#05050a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <div className="ring" />
          <div className="txt">{connected ? 'CONNECTED' : store.serverUrl ? 'CONNECTING TO ' + store.serverUrl + '…' : 'CONNECTING TO SERVER…'}</div>
          <BootFallback connected={connected} serverInput={serverInput} setServerInput={setServerInput} onDemo={() => { startLocalDemo(); setScreen('hud'); }} onServer={() => setServer(serverInput)} />
        </div>
      )}
      {screen === 'lobby' && <Lobby onHelp={() => setScreen('controls')} onReplay={() => {
        fetch('/api/replays').then(r => r.json()).then(list => {
          if (!list.length) { setToastMsg('No replays yet — play a match first!'); setTimeout(() => setToastMsg(null), 2400); return; }
          setScreen('hud');
          setReplayT({ id: list[0].id });
          startReplay(list[0].id, (t, dur) => setReplayT(prev => ({ ...prev, t: t + 's / ' + dur + 's' })));
        }).catch(() => {});
      }} />}
      {screen === 'charselect' && <CharSelect onStart={() => {
        sio().emit('host:start');
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      }} />}
      {screen === 'hud' && (
        <Hud banner={banner} setBanner={setBanner} comboPop={comboPop} muted={muted} setMuted={setMuted} onHelp={() => setScreen('controls')} />
      )}
      {screen === 'result' && <Result result={result} onReplay={(id) => { setScreen('hud'); setReplayT({ id }); startReplay(id, (t, dur) => setReplayT(prev => ({ ...prev, t: t + 's / ' + dur + 's' }))); }} />}
      {screen === 'controls' && <ControlsOverlay onClose={() => setScreen(store.room?.state === 'fight' ? 'hud' : store.room?.state === 'charselect' ? 'charselect' : 'lobby')} />}
      {replayT && screen === 'hud' && <ReplayBar visible time={replayT.t || '0s / 0s'} onExit={replayExit} />}
      {toastMsg && <div id="toast" className="show">{toastMsg}</div>}
    </>
  );
}
