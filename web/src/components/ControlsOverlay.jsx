import React from 'react';

export default function ControlsOverlay({ onClose }) {
  return (
    <div id="controlsHelp" className="screen active">
      <div className="ch-title">🎮 CONTROLS</div>
      <div className="ch-cols">
        <div className="ch-col">
          <div className="ch-head">KEYBOARD — P1</div>
          {[['W A S D / ← ↑ ↓ →', 'Move · jump · crouch'], ['J · K · L', 'Light · Kick · Heavy'], ['U · O', 'Special · Ultimate'], ['SHIFT · CTRL', 'Block · Dash'], ['E · R (hold)', 'Grab · Charge'], ['SPACE · Q · F', 'Jump · Taunt · Rage'], ['P · M', 'Pause · Mute']]
            .map(([b, s]) => <div className="ch-row" key={b}><b>{b}</b><span>{s}</span></div>)}
        </div>
        <div className="ch-col">
          <div className="ch-head">GAMEPAD — P1 &amp; P2</div>
          {[['Left stick / D-pad', 'Move'], ['A · B · X · Y', 'Light · Kick · Heavy · Special'], ['LB · RB', 'Block · Charge (hold)'], ['LT / RT', 'Dash · Grab'], ['Select · Start', 'Rage · Pause']]
            .map(([b, s]) => <div className="ch-row" key={b}><b>{b}</b><span>{s}</span></div>)}
        </div>
        <div className="ch-col">
          <div className="ch-head">PHONE / APK — CONTROLLER</div>
          {[['Joystick', 'Move · jump · crouch'], ['A B X Y · RB', 'Attacks · charge'], ['Swipe zone', 'Jump · slide · dash · spin'], ['Shake', 'Rage mode']]
            .map(([b, s]) => <div className="ch-row" key={b}><b>{b}</b><span>{s}</span></div>)}
        </div>
      </div>
      <button className="btn gold" onClick={onClose}>LET'S FIGHT</button>
    </div>
  );
}
