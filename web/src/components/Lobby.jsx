import React, { useEffect, useState } from 'react';
import { store, on, sio } from '../game/net.js';
import { toggleFS } from './Hud.jsx';

const SLOT_COLORS = ['var(--p1)', 'var(--p2)', '#c77dff', '#3ddc67'];
const SLOT_LABELS = ['PLAYER 1', 'PLAYER 2', 'PLAYER 3', 'PLAYER 4'];

export default function Lobby({ onHelp, onReplay }) {
  const [rs, setRs] = useState(store.room);
  useEffect(() => on('room:state', setRs), []);
  if (!rs) return <div className="screen active" />;
  const slots = rs.mode === 'tournament' ? [0, 1, 2, 3] : [0, 1];

  const toggleMode = () => {
    window.SFAAudio.play('menuclick');
    sio().emit('host:mode', rs.mode === 'tournament' ? '1v1' : 'tournament', () => {});
  };
  const quickStart = () => {
    window.SFAAudio.play('menuclick');
    sio().emit('host:start');
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <div id="lobby" className="screen active">
      <div className="lobby-title">HOSTING <span className="neon-gold">STICKFIGHT</span> ARENA</div>
      <div className="lobby-row">
        <div className="lobby-qr">{store.qr ? <img src={store.qr} alt="QR" /> : <div style={{ width: 230, height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontFamily: 'var(--font-head)', fontSize: 11 }}>generating…</div>}</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', letterSpacing: 3, fontSize: 12, fontFamily: 'var(--font-head)', marginBottom: 10 }}>ROOM CODE</div>
          <div className="lobby-code">{store.code || '———'}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12, letterSpacing: 1 }}>Scan with the <b style={{ color: 'var(--p2)' }}>mobile app</b> or type the code</div>
        </div>
      </div>
      <div className="lobby-row">
        {slots.map(s => {
          const p = rs.players[s];
          return (
            <div key={s} className="lobby-player" style={{ borderColor: SLOT_COLORS[s] }}>
              <div className="slot-label" style={{ color: SLOT_COLORS[s] }}>{SLOT_LABELS[s]}</div>
              <div className="who" style={p?.isBot ? { color: 'var(--gold)' } : p?.connected ? { color: SLOT_COLORS[s] } : {}}>{p?.isBot ? '🤖 ' + (p.name || 'BOT') : p?.connected ? p.name : '—'}</div>
              <div className="status">{p?.connected || p?.isBot
                ? <><span className="waiting-dot ok" />{p.isBot ? 'Bot ready' : 'Connected ✓'}{p.ping ? ' · ' + p.ping + 'ms' : ''}</>
                : <><span className="waiting-dot" /> Waiting for fighter…</>}</div>
            </div>
          );
        })}
      </div>
      <div className="lobby-row">
        {slots.map(s => (
          <button key={s} id={"bot" + s} className="btn small" style={{ borderColor: SLOT_COLORS[s] }}
            disabled={rs.players[s].connected || rs.players[s].isBot || rs.state !== 'lobby'}
            onClick={() => sio().emit(rs.players[s].isBot ? 'host:removeBot' : 'host:addBot', s)}>
            {rs.players[s].isBot ? '🤖 Bot (tap to remove)' : '🤖 Fill P' + (s + 1) + ' with Bot'}
          </button>
        ))}
      </div>
      <div className="lobby-row">
        <button id="modeBtn" className={'btn small' + (rs.mode === 'tournament' ? ' gold' : '')} onClick={toggleMode}>{rs.mode === 'tournament' ? '🥊 1V1 MODE' : '🏆 4-PLAYER TOURNAMENT'}</button>
        <button className="btn small ghost" onClick={onReplay}>🎬 LAST REPLAY</button>
        <button className="btn small ghost" onClick={toggleFS}>⛶ FULLSCREEN</button>
        <button className="btn small ghost" onClick={onHelp}>❓ CONTROLS</button>
      </div>
      <button id="quickStartBtn" className="btn gold" style={{ fontSize: 16, padding: '16px 34px' }} onClick={quickStart}>🎮 QUICK START — PC + BOTS</button>
      <div className="lobby-hint">Everyone watches on this screen.<br />
        <b>1.</b> Open the <b>StickFight app</b> on phones &nbsp; <b>2.</b> Enter the code &nbsp; <b>3.</b> Pick fighters<br />
        Guests can also join to <b>watch &amp; react</b> once the match starts.</div>
    </div>
  );
}
