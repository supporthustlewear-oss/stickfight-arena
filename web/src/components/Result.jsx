import React, { useEffect, useState } from 'react';
import { store, sio } from '../game/net.js';
import Bracket from './Bracket.jsx';

export default function Result({ result, onReplay }) {
  const [lb, setLb] = useState(null);
  const rs = store.room;
  const d = result;
  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.json()).then(setLb).catch(() => {});
  }, []);
  if (!d) return null;
  const p1n = d.players?.[0]?.name || (rs?.players[0]?.name) || 'P1';
  const p2n = d.players?.[1]?.name || (rs?.players[1]?.name) || 'P2';
  const wName = d.winnerName || (d.winner === 0 ? p1n : p2n);
  const st = d.stats || [{}, {}];
  const card = (n, c, s) => (
    <div className="result-stat">
      <div style={{ fontFamily: 'var(--font-head)', fontSize: 12, letterSpacing: 2, color: c, marginBottom: 8 }}>{n}</div>
      <div className="v">{Math.round(s.dmg || 0)}</div><div className="k">DAMAGE</div>
      <div className="v" style={{ fontSize: 18, marginTop: 6 }}>{s.hits || 0}</div><div className="k">HITS</div>
      <div className="v" style={{ fontSize: 18, marginTop: 6 }}>{s.bestCombo || 0}x</div><div className="k">BEST COMBO</div>
      <div className="v" style={{ fontSize: 18, marginTop: 6 }}>{s.kos || 0}{s.perfects ? ' (PERFECT!)' : ''}</div><div className="k">KOS</div>
    </div>
  );
  const mine = lb?.top?.find(x => x.name === p1n || x.name === p2n);
  return (
    <div id="result" className="screen active">
      <div id="resTitle" className={'result-title ' + (d.winner === 0 ? 'neon-red' : 'neon-blue')}>{wName.toUpperCase()} WINS</div>
      <div id="resSub" className="result-sub">{(d.reason || 'K.O.') + ' — best of 3'}{rs?.mode === 'tournament' && rs.bracket
        ? ' — ' + (rs.bracket.phase === 'done' ? '🏆 TOURNAMENT OVER' : 'next: ' + (rs.bracket.phase === 'sf1' ? 'SEMIFINAL 2' : 'THE FINAL')) : ''}</div>
      <div id="resScore" className="result-score"><span className="neon-red">{p1n}</span> <span className="vs">{d.p1wins || 0} — {d.p2wins || 0}</span> <span className="neon-blue">{p2n}</span></div>
      {rs?.mode === 'tournament' && <div id="resBracket" className="result-bracket"><Bracket rs={rs} /></div>}
      <div id="resStats" className="result-stats">{card(p1n, '#ff6a6a', st[0])}{card(p2n, '#6ab8ff', st[1])}</div>
      <div className="result-actions">
        <button id="rematchBtn" className="btn gold" onClick={() => sio().emit('host:rematch')}>🔄 REMATCH</button>
        {d.replayId && <button id="replayBtn" className="btn" onClick={() => onReplay(d.replayId)}>🎬 WATCH REPLAY</button>}
        <button className="btn" onClick={() => location.reload()}>🏠 LOBBY</button>
      </div>
      <div id="resLbHint" className="result-lb-hint">{lb?.total
        ? (mine ? `🏆 <b>${mine.name}</b> — ${mine.wins}W / ${mine.losses}L · rank ${lb.top.indexOf(mine) + 1} of ${lb.total}` : `🏆 ${lb.total} fighters on the leaderboard — keep winning to climb`)
        : '🏆 First match — you just founded the leaderboard!'}</div>
    </div>
  );
}
