# 🥊 StickFight Arena

**Your phone is the controller. The screen is the ring.**

A 2.5D browser fighting game where the **PC/TV shows the arena on a canvas** and
up to 4 phones (native Android app **built with Java + Kotlin**) act as full fight
pads — joystick, ABXY, block/dash/grab/special, gestures, shake-to-rage, haptics.

```
📱 Native Android APK (Java + Kotlin)          🖥️ React website (canvas arena)
      │  Socket.io (input/actions @20Hz)               │
      └──────────────►  Node.js server  ◄──────────────┘
                (authoritative 60Hz sim, 30Hz state)
```

---

## 🚀 Quick start

```bash
npm install
cd web && npm install && npm run build     # build the React site
cd .. && npm start                          # http://localhost:3000
```

| Screen | URL | What it is |
|---|---|---|
| 🖥️ React website | `http://localhost:3000` | Landing page: live bot demo + leaderboard |
| ⚔️ The Arena | `http://localhost:3000/game` | **Canvas fight screen** — lobby, charselect, HUD, tournament, replays |
| 📱 Web controller | `http://localhost:3000/mobile.html` | Fallback phone controller (no install) |

**To fight between two online friends:** one opens `/game`, the other two install
the APK (or open `/mobile.html`), scan the QR / type the code, pick fighters —
**FIGHT!** Works over the internet or LAN; the server just needs to be reachable.

---

## 📱 Android app (native, Java + Kotlin)

**`dist/StickFight-Arena-Android-v1.0.apk`** — real native app, no WebView:

| Layer | Language |
|---|---|
| `MainActivity.kt` — screens, state machine, socket handling | Kotlin |
| `JoystickView.kt` — custom canvas joystick (360°, deadzone, jump flick) | Kotlin |
| `SocketManager.kt` — Socket.io client, 20Hz input sender | Kotlin |
| `GameProtocol.java` — protocol constants, QR code parsing | Java |
| `HapticHelper.java` — tap/buzz/heavy/combo/victory patterns | Java |
| `ShakeDetector.java` — accelerometer → Rage Mode | Java |

Features: splash → home → pairing (code / **QR scan via ZXing** / auto-detect
nearby via `/api/rooms`) → character select → controller with joystick, ABXY,
block/grab/special/dash, swipe gestures (jump/slide/dash/spin/dodge/taunt),
double-tap special = ultimate, shake = Rage, live HP/combo/ping bar, left-handed
mode, button sizes, haptics toggle. Server address saved per device (default
`10.0.2.2:3000` for emulators).

```bash
npm run apk    # rebuild → dist/StickFight-Arena-Android-v1.0.apk
adb install dist/StickFight-Arena-Android-v1.0.apk
```

---

## 🖥️ React website (the arena)

- **Landing** — live bot-vs-bot demo (real server sim running in the browser),
  features, persistent leaderboard, menu music
- **/game** — lobby (QR + code + bots + tournament toggle + QUICK START) →
  character select (8 fighters, live previews, bracket panel) → **HUD over the
  canvas arena** (HP bars, meter, combos, pips, timer, ping, mute/fullscreen/help)
  → result (stats + leaderboard + replay) → replay bar (pause/exit)
- Canvas engine: IK stickmen with glowing joints, 6 themed arenas, particles,
  screen shake, hit-stop, projectiles, emotes — ported as React components over
  the same render core the server sim drives
- **Console mode**: keyboard = P1 (WASD/JKL/UO/Shift/Ctrl/E/R/Space/Q/F), up to 2
  gamepads, auto-fullscreen, cursor auto-hide, controls overlay
- React (Vite) + socket.io-client + the synthesized WebAudio engine (per-arena
  music with intensity layers, KO stingers, fanfares, crowd roar)

## 🗄️ Server (Node.js + Socket.io)

Rooms (`SKY-847` codes), QR deep links, 60Hz authoritative sim, 30Hz broadcasts,
input relay with timestamps, latency, bot AI, 1v1 + 4-player tournaments, replay
recording, persistent leaderboard, spectator mode, REST APIs (`/api/rooms`,
`/api/qr`, `/api/replays`, `/api/leaderboard`).

## 🧪 Tests

```bash
npm test                  # server E2E
npm run test:tournament   # server E2E: bracket + replays + persistence
npm run test:browser      # Chrome headless: React PC + 2 phones + spectator + replay
npm run test:btournament  # Chrome headless: 4-bot tournament on the React screen
npm run test:keyboard     # Chrome headless: console mode (keyboard vs bot)
```

## 🚀 Deploy

See **DEPLOY.md** — Docker, Render/Railway, or LAN. One process serves everything:
`docker build -t stickfight . && docker run -p 3000:3000 stickfight`
