/* ============================================================
   STICKFIGHT ARENA — shared configuration
   Characters, arenas, moves. Pure data + tiny helpers.
   Loads in Node (module.exports) and browser (window.SFA).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SFA = Object.assign(root.SFA || {}, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- CHARACTERS (8 fighters) ---------------- */
  const CHAR = {
    shadow: {
      id: 'shadow', name: 'SHADOW', emoji: '🖤', style: 'Ninja / Stealth',
      color: '#8a5cff', accent: '#b79bff',
      speed: 1.15, jump: 1.15, power: 0.9,
      special: { kind: 'teleport', dmg: 18, desc: 'Vanish + backstab' },
      ultimate: { kind: 'rapid', dmg: 10, hits: 4, desc: 'Shadow Clone barrage' },
    },
    blaze: {
      id: 'blaze', name: 'BLAZE', emoji: '🔥', style: 'Brawler / Fire',
      color: '#ff5a2d', accent: '#ffb03a',
      speed: 1.0, jump: 1.0, power: 1.15,
      special: { kind: 'uppercut', dmg: 20, desc: 'Flaming uppercut' },
      ultimate: { kind: 'aoe', dmg: 32, desc: 'Inferno Rage tornado' },
    },
    volt: {
      id: 'volt', name: 'VOLT', emoji: '⚡', style: 'Speedster',
      color: '#ffe14d', accent: '#9df3ff',
      speed: 1.35, jump: 1.1, power: 0.8,
      special: { kind: 'dash', dmg: 16, desc: 'Lightning dash through' },
      ultimate: { kind: 'storm', dmg: 8, hits: 6, desc: 'Thunder Storm AOE' },
    },
    titan: {
      id: 'titan', name: 'TITAN', emoji: '💪', style: 'Wrestler / Tank',
      color: '#6b7a8f', accent: '#c9d1d9',
      speed: 0.8, jump: 0.85, power: 1.3,
      special: { kind: 'slam', dmg: 18, desc: 'Ground slam shockwave' },
      ultimate: { kind: 'berserk', dmgMult: 2, dur: 6, desc: 'Berserker Mode (2x dmg)' },
    },
    viper: {
      id: 'viper', name: 'VIPER', emoji: '🐍', style: 'Martial Arts',
      color: '#3ddc67', accent: '#b6ffd0',
      speed: 1.05, jump: 1.05, power: 1.0,
      special: { kind: 'poison', dmg: 12, dot: 3, dotDur: 4, desc: 'Poison strike (DOT)' },
      ultimate: { kind: 'rapid', dmg: 8, hits: 8, desc: '7-hit combo burst' },
    },
    frost: {
      id: 'frost', name: 'FROST', emoji: '❄️', style: 'Control / Ice',
      color: '#4dc9ff', accent: '#d9f6ff',
      speed: 0.95, jump: 1.0, power: 0.9,
      special: { kind: 'freeze', dmg: 8, freeze: 2.5, desc: 'Freeze opponent' },
      ultimate: { kind: 'iceage', dmg: 18, freeze: 4, desc: 'Ice Age (arena freeze)' },
    },
    ghost: {
      id: 'ghost', name: 'GHOST', emoji: '👻', style: 'Tricky / Phasing',
      color: '#9ae6e0', accent: '#ffffff',
      speed: 1.1, jump: 1.1, power: 0.85,
      special: { kind: 'phase', dur: 1.4, desc: 'Phase through attacks' },
      ultimate: { kind: 'possess', dur: 3, desc: 'Possession (steal controls)' },
    },
    storm: {
      id: 'storm', name: 'STORM', emoji: '🌪️', style: 'Air / Acrobat',
      color: '#7fd4ff', accent: '#e8f8ff',
      speed: 1.12, jump: 1.3, power: 0.95,
      special: { kind: 'wave', dmg: 14, desc: 'Wind wave projectile' },
      ultimate: { kind: 'tornado', dmg: 26, desc: 'Tornado Slam (aerial)' },
    },
  };

  /* ---------------- MOVES (base kit) ---------------- */
  const MOVES = {
    light: { dmg: 5, startup: 0.06, active: 0.10, recover: 0.16, kb: 110, launch: 0, range: 90, y: 0, shake: 0.6, sfx: 'light', anim: 'punch' },
    kick:  { dmg: 7, startup: 0.10, active: 0.09, recover: 0.20, kb: 170, launch: 90, range: 95, y: 0, shake: 1.0, sfx: 'kick', anim: 'kick' },
    heavy: { dmg: 12, startup: 0.18, active: 0.12, recover: 0.26, kb: 340, launch: 260, range: 110, y: 0, shake: 2.2, sfx: 'heavy', anim: 'heavy' },
  };

  /* ---------------- ARENAS (6) ---------------- */
  const ARENA = {
    city: {
      id: 'city', name: 'City Rooftop', emoji: '🌆',
      theme: 'city', gravity: 1.0,
      bg: '#0b1026', fg: '#1a2142', neon: '#2d9cff',
      platforms: [{ x: 0.30, y: 0.52, w: 0.22 }, { x: 0.62, y: 0.40, w: 0.22 }, { x: 0.18, y: 0.30, w: 0.20 }],
    },
    dojo: {
      id: 'dojo', name: 'Ancient Dojo', emoji: '⛩️',
      theme: 'dojo', gravity: 1.0,
      bg: '#1a0f0a', fg: '#33201a', neon: '#ffb03a',
      platforms: [{ x: 0.25, y: 0.55, w: 0.20 }, { x: 0.55, y: 0.40, w: 0.20 }, { x: 0.08, y: 0.32, w: 0.16 }, { x: 0.76, y: 0.32, w: 0.16 }],
    },
    volcano: {
      id: 'volcano', name: 'Volcano Crater', emoji: '🌋',
      theme: 'volcano', gravity: 1.0, lava: true,
      bg: '#16060a', fg: '#2b0d12', neon: '#ff5a2d',
      platforms: [{ x: 0.28, y: 0.55, w: 0.20, move: 0.5 }, { x: 0.55, y: 0.42, w: 0.20, move: 0.4 }, { x: 0.15, y: 0.30, w: 0.18 }, { x: 0.72, y: 0.28, w: 0.18 }],
    },
    space: {
      id: 'space', name: 'Space Station', emoji: '🛰️',
      theme: 'space', gravity: 0.55,
      bg: '#050714', fg: '#0c1230', neon: '#7fd4ff',
      platforms: [{ x: 0.26, y: 0.55, w: 0.20, move: 0.35 }, { x: 0.60, y: 0.42, w: 0.20 }, { x: 0.12, y: 0.32, w: 0.16 }, { x: 0.74, y: 0.28, w: 0.16 }],
    },
    alley: {
      id: 'alley', name: 'Street Alley', emoji: '🏙️',
      theme: 'alley', gravity: 1.0, bounce: true,
      bg: '#0d0a14', fg: '#221a2e', neon: '#ff2d2d',
      platforms: [{ x: 0.30, y: 0.52, w: 0.20 }, { x: 0.58, y: 0.40, w: 0.20 }, { x: 0.10, y: 0.30, w: 0.15 }, { x: 0.76, y: 0.30, w: 0.15 }],
    },
    club: {
      id: 'club', name: 'Underground Fight Club', emoji: '🥊',
      theme: 'club', gravity: 1.0,
      bg: '#0a0612', fg: '#1e1230', neon: '#ff2dd4',
      platforms: [{ x: 0.30, y: 0.52, w: 0.20 }, { x: 0.60, y: 0.40, w: 0.20 }],
    },
  };

  const ARENA_ORDER = ['city', 'dojo', 'volcano', 'space', 'alley', 'club'];
  const CHAR_ORDER = ['shadow', 'blaze', 'volt', 'titan', 'viper', 'frost', 'ghost', 'storm'];

  /* ---------------- Combo multiplier tiers ---------------- */
  function comboMult(n) {
    if (n >= 11) return 3.0;
    if (n >= 8) return 2.0;
    if (n >= 5) return 1.5;
    if (n >= 3) return 1.2;
    return 1.0;
  }
  function comboLabel(n) {
    if (n >= 11) return 'LEGENDARY!';
    if (n >= 8) return 'AMAZING!';
    if (n >= 5) return 'GREAT!';
    if (n >= 3) return 'GOOD!';
    return '';
  }

  return { CHAR, MOVES, ARENA, ARENA_ORDER, CHAR_ORDER, comboMult, comboLabel };
});
