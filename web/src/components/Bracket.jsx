import React from 'react';

export default function Bracket({ rs }) {
  const b = rs?.bracket;
  if (!rs) return null;
  const mk = (slots, results, phase) => (
    <div className="bcol">
      <div className="bt">{phase.toUpperCase()}</div>
      {slots.map(s => {
        const nm = rs.players[s] ? (rs.players[s].name || 'P' + (s + 1)) : 'P' + (s + 1);
        const won = results.includes(s);
        const isNext = b && b.phase === phase && b.matchup?.includes(s) && !won;
        const champ = b && b.champion === s;
        return <div key={s} className={`bf ${won ? 'win' : ''} ${isNext ? 'next' : ''} ${champ ? 'champ' : ''}`}>{won ? '✅ ' : isNext ? '⚔️ ' : ''}{nm}</div>;
      })}
    </div>
  );
  if (!b) {
    return (
      <div className="bracket">
        <div className="bcol"><div className="bt">1V1</div>
          <div className="bf">{rs.players[0]?.name || 'P1'} vs {rs.players[1]?.name || 'P2'}</div>
        </div>
      </div>
    );
  }
  const finalists = b.results.length >= 2 ? [b.results[0], b.results[1]] : [];
  return (
    <div className="bracket">
      {mk([0, 1], b.results.slice(0, 1), 'sf1')}
      {mk([2, 3], b.results.slice(1, 2), 'sf2')}
      {mk(finalists, b.results.slice(2, 3), 'final')}
      <div className="bcol">
        <div className="bt">CHAMPION</div>
        <div className={`bf ${b.champion !== null && b.champion !== undefined ? 'champ' : ''}`}>
          {b.champion !== null && b.champion !== undefined ? '🏆 ' + (rs.players[b.champion]?.name || '?') : '—'}
        </div>
      </div>
    </div>
  );
}
