import React, { useEffect, useState } from 'react';
import { store, on, sio } from '../game/net.js';

export default function Hud({ banner, setBanner, comboPop, muted, setMuted, onHelp }) {
  const [snap, setSnap] = useState(null);
  const [pings, setPings] = useState({ 0: '—', 1: '—' });

  useEffect(() => {
    const t = setInterval(() => { if (store.lastSnap) setSnap(store.lastSnap); }, 100);
    const off = on('ping', (list) => {
      const p = {};
      for (const x of list) p[x.slot] = x.ping + 'ms';
      setPings(prev => ({ ...prev, ...p }));
    });
    return () => { clearInterval(t); off(); };
  }, []);

  if (!snap) return <div id="hud" className="screen active" />;
  const [f1, f2] = snap.f;
  const m = store.room ? (store.room.matchup || [0, 1]) : [0, 1];
  const p1n = store.room ? (store.room.players[m[0]].name || 'P1') : 'P1';
  const p2n = store.room ? (store.room.players[m[1]].name || 'P2') : 'P2';
  const a = window.SFA.ARENA[store.arenaId] || window.SFA.ARENA.city;

  const meter = (v) => [0, 1, 2, 3].map(i => <div key={i} className={'seg' + (v >= i + 1 ? (i === 3 ? ' ult' : ' on') : '')} />);
  const pips = () => {
    const r = [];
    for (let i = 0; i < 2; i++) r.push(<div key={'a' + i} className={'pip' + (i < snap.p1wins ? ' win' : '')} />);
    r.push(<div key="s" style={{ width: 10 }} />);
    for (let i = 0; i < 2; i++) r.push(<div key={'b' + i} className={'pip' + (i < snap.p2wins ? ' win' : '')} />);
    return r;
  };

  return (
    <div id="hud" className="screen active">
      <div className="hud-top">
        <div className="hud-panel">
          <div className="hud-name"><span className="neon-red">P1</span><span id="c1" className={'combo' + (f1.combo >= 5 ? ' big' : '')}>{f1.combo > 1 ? 'COMBO ' + f1.combo + 'x' : ''}</span></div>
          <div className="hud-bar p1"><div className="ghost" style={{ width: f1.hp + '%' }} /><div id="hp1" className={'fill' + (f1.hp < 25 ? ' low' : '')} style={{ width: f1.hp + '%' }} /></div>
          <div className="hud-meter">{meter(f1.meter)}</div>
        </div>
        <div className="hud-center">
          <div id="roundLabel" className="hud-round">ROUND {Math.min(snap.round, 3)} / 3</div>
          <div className="hud-pips">{pips()}</div>
          <div id="timer" className={'hud-timer' + (snap.timer <= 10 ? ' low' : '')}>{snap.timer}</div>
        </div>
        <div className="hud-panel hud-p2">
          <div className="hud-name"><span id="c2" className={'combo' + (f2.combo >= 5 ? ' big' : '')}>{f2.combo > 1 ? 'COMBO ' + f2.combo + 'x' : ''}</span><span className="neon-blue">P2</span></div>
          <div className="hud-bar p2"><div className="ghost" style={{ width: f2.hp + '%' }} /><div id="hp2" className={'fill' + (f2.hp < 25 ? ' low' : '')} style={{ width: f2.hp + '%' }} /></div>
          <div className="hud-meter">{meter(f2.meter)}</div>
        </div>
      </div>
      <div className={'combo-pop l ' + (comboPop[0] ? 'show' : '')}><span>{comboPop[0]?.count}x</span><span className="lbl">{comboPop[0]?.label}</span></div>
      <div className={'combo-pop r ' + (comboPop[1] ? 'show' : '')}><span>{comboPop[1]?.count}x</span><span className="lbl">{comboPop[1]?.label}</span></div>
      <div className="arena-tag"><b>{a.emoji} {a.name}</b> · {p1n} vs {p2n}</div>
      <div id="banner"><div className={'btext show ' + (banner?.cls || '')}>{banner?.text}</div></div>
      <div className="hud-bottom">
        <div><span className="dot" /> P1 {p1n} · {pings[0]}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ letterSpacing: 3 }}>{a.emoji} {a.name.toUpperCase()}</span>
          <button className="mini-btn" onClick={() => { setMuted(!muted); window.SFAAudio.setMuted(!muted); }} title="Mute (M)">{muted ? '🔇' : '🔊'}</button>
          <button className="mini-btn" onClick={toggleFS} title="Fullscreen">⛶</button>
          <button className="mini-btn" onClick={onHelp} title="Controls">❓</button>
        </div>
        <div><span className="dot" /> P2 {p2n} · {pings[1]}</div>
      </div>
      {store.paused && <div id="pausedOverlay" style={{ display: 'flex' }}>PAUSED</div>}
    </div>
  );
}

export function toggleFS() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
