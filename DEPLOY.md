# 🚀 Deploying StickFight Arena

The whole game is one Node process: React website + game server + API.
Deploy it anywhere Node 20 runs.

## 1. Build the React site (once)
```bash
cd web && npm ci && npm run build     # → web/dist (served automatically by server.js)
```

## 2. Run the server
```bash
npm start            # serves React site at / and /game, controllers at /mobile.html
PORT=3000 node server.js
```

## 3. Options

### Docker (any VPS / NAS / home server)
```bash
docker build -t stickfight . && docker run -d -p 3000:3000 stickfight
```

### Render / Railway / Fly.io
- Root directory: repo root
- Build: `cd web && npm ci && npm run build`
- Start: `node server.js`
- Expose port 3000. WebSocket is handled by socket.io automatically.

### Local network (party mode)
Run on your PC → phones on the same WiFi open the app and enter
`http://<PC-LAN-IP>:3000` once (saved on the device). QR codes work too.

## 4. The Android app
`dist/StickFight-Arena-Android-v1.0.apk` is the native (Java + Kotlin) controller.
Install on any Android 6+ phone, enter your server address once, then join by
code or QR scan.

Rebuild the APK:
```bash
cd android-app
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # or your JDK 17+
export ANDROID_HOME=/path/to/android-sdk
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

## 5. Notes
- Rooms live in memory; leaderboard persists to `data/leaderboard.json`.
- For public play, use `ROUND_SECONDS=90` (default) and open your firewall to 3000.
