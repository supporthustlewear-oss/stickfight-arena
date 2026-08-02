import React, { useEffect, useRef, useState } from 'react';
import { store, on, sio } from '../game/net.js';
import Bracket from './Bracket.jsx';

const SLOT_COLORS = ['var(--p1)', 'var(--p2)', '#c77dff', '#3ddc67'];

export default function CharSelect({ onStart }) {
  const [rs, setRs] = useState(store.room);
  useEffect(() => on('room:state', setRs), []);
  const gridRef = useRef(null);

  // build the 8 cards once
  useEffect(() => {
    if (gridRef.current.children.length) return;
    for (const id of window.SFA.CHAR_ORDER) {
      const c = window.SFA.CHAR[id];
      const card = document.createElement('div');
      card.className = 'cs-card';
      card.dataset.id = id;
      card.innerHTML = `<canvas width="200" height="140"></canvas><div class="nm" style="color:${c.color}">${c.emoji} ${c.name}</div><div class="st">${c.style}</div><div class="lock-badge">🔒</div>`;
      gridRef.current.appendChild(card);
    }
    // live previews
    const t = setInterval(() => {
      for (const card of gridRef.current.children) {
        const c = window.SFA.CHAR[card.dataset.id];
        const cv = card.querySelector('canvas');
        const p = cv.getContext('2d');
        p.clearRect(0, 0, 200, 140);
        const g = p.createLinearGradient(0, 0, 0, 140);
        g.addColorStop(0, '#0d0d18'); g.addColorStop(1, '#1a1a2e');
        p.fillStyle = g; p.fillRect(0, 0, 200, 140);
        window.SFAStickman.preview(p, c, c.color, performance.now() / 1000, 'idle', 200, 140);
      }
    }, 100);
    return () => clearInterval(t);
  }, []);

  if (!rs) return null;
  const slots = rs.mode === 'tournament' ? [0, 1, 2, 3] : [0, 1];

  // highlight picks
  for (const card of gridRef.current?.children || []) {
    const p = rs.players.find(x => x.char === card.dataset.id);
    card.classList.toggle('sel', !!p);
    card.classList.toggle('locked', !!(p && p.locked));
    card.style.borderColor = p ? (p.isBot ? 'var(--gold)' : SLOT_COLORS[p.slot]) : '';
    card.style.boxShadow = p ? `0 0 24px ${p.isBot ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.25)'}` : '';
  }

  const allReady = slots.every(s => {
    const p = rs.players[s];
    if (!p) return false;
    if (p.char && (p.locked || p.isBot)) return true;
    return !p.connected && !p.isBot; // empty = PC plays
  });
  const pcSlots = slots.filter(s => !rs.players[s].connected && !rs.players[s].isBot);

  return (
    <div id="charselect" className="screen active">
      <div className="cs-title">⚔️ SELECT YOUR <span>FIGHTER</span> ⚔️</div>
      <div className="cs-bracket-wrap"><div id="csBracket"><Bracket rs={rs} /></div></div>
      <div className="cs-pick" ref={gridRef} />
      <div className="cs-status">
        {slots.map(s => {
          const p = rs.players[s];
          return (
            <div key={s} className="cs-slot" style={{ borderColor: SLOT_COLORS[s] }}>
              <div className="who" style={{ color: SLOT_COLORS[s] }}>P{s + 1}: {p?.isBot ? '🤖 ' : ''}{p?.name || '—'}</div>
              <div className="picked" style={p?.locked ? { color: 'var(--gold)' } : (!p?.connected && !p?.isBot ? { color: 'var(--p2)' } : {})}>
                {p?.char ? (p.locked ? '🔒 ' : '') + window.SFA.CHAR[p.char].emoji + ' ' + window.SFA.CHAR[p.char].name + (p.locked ? ' — LOCKED' : ' — choosing')
                  : (!p?.connected && !p?.isBot ? '🎮 PC (keyboard/gamepad)' : 'choosing…')}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cs-arena-row">
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-head)', fontSize: 12, letterSpacing: 2 }}>ARENA:</span>
        <select className="btn small" defaultValue={rs.arena} onChange={(e) => sio().emit('host:arena', e.target.value, () => {})}>
          {window.SFA.ARENA_ORDER.map(id => <option key={id} value={id}>{window.SFA.ARENA[id].emoji} {window.SFA.ARENA[id].name}</option>)}
        </select>
      </div>
      <div className="cs-start">
        <div className="hint" dangerouslySetInnerHTML={{ __html: allReady
          ? (rs.mode === 'tournament' ? 'All 4 fighters ready — the bracket begins!' : 'Both fighters ready!') +
            (pcSlots.length ? ` · <span style="color:var(--p2)">🎮 PC plays P${pcSlots.map(s => s + 1).join(' & P')} (keyboard/gamepad)</span>` : '')
          : 'Waiting for fighters to pick…' }} />
        <button id="startBtn" className="btn gold" style={{ fontSize: 17, padding: '16px 44px' }} disabled={!allReady} onClick={onStart}>
          {rs.mode === 'tournament' ? '🏆 START TOURNAMENT' : '⚡ START FIGHT'}
        </button>
      </div>
    </div>
  );
}
