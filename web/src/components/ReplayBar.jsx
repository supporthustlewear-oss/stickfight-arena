import React, { useState } from 'react';
import { store, on, handleEvent } from '../game/net.js';

/* Replay playback: loads the replay, replays its snapshots + events through the store */
export function startReplay(id, cb) {
  fetch('/api/replays/' + encodeURIComponent(id)).then(r => r.json()).then(data => {
    if (!data || !data.snaps) return cb && cb('Replay unavailable');
    stopReplay(true);
    store.replay = { data, i: 0, evi: 0, paused: false, timer: null };
    store.snaps = []; store.shake = 0; store.matchOver = true;
    store.arenaId = data.arena;
    cb && cb(0, Math.round(data.duration || 0));
    store.replay.timer = setInterval(() => {
      const r = store.replay;
      if (!r || r.paused) return;
      const s = r.data.snaps[r.i];
      if (!s) { stopReplay(); return; }
      store.snaps.push({ t: performance.now(), snap: s });
      if (store.snaps.length > 6) store.snaps.shift();
      while (r.evi < r.data.events.length && r.data.events[r.evi].t <= s.t) {
        handleEvent({ kind: r.data.events[r.evi].kind, data: r.data.events[r.evi].data });
        r.evi++;
      }
      r.i++;
      cb && cb(Math.round(s.t), Math.round(r.data.duration));
    }, 1000 / 30);
  }).catch(() => cb && cb('Replay unavailable'));
}
export function stopReplay(silent) {
  if (store.replay) { clearInterval(store.replay.timer); store.replay = null; }
}

export default function ReplayBar({ visible, onExit, time }) {
  const [paused, setPaused] = useState(false);
  if (!visible) return null;
  return (
    <div id="replayBar" className="show">
      <span id="rpTitle">▶ REPLAY</span>
      <span id="rpNames">{store.replay?.data?.names?.join(' vs ') || ''}</span>
      <span id="rpTime">{time}</span>
      <button className="btn small ghost" onClick={() => {
        if (!store.replay) return;
        store.replay.paused = !store.replay.paused;
        setPaused(store.replay.paused);
      }}>{paused ? '▶' : '⏸'}</button>
      <button id="rpExit" className="btn small ghost" onClick={onExit}>✕</button>
    </div>
  );
}
