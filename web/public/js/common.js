/* StickFight Arena — shared browser helpers */
window.SFA = window.SFA || {};
SFA.$ = (s, el) => (el || document).querySelector(s);
SFA.$$ = (s, el) => [...(el || document).querySelectorAll(s)];
SFA.screen = (id) => { SFA.$$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); };
SFA.esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
SFA.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
SFA.lerp = (a, b, t) => a + (b - a) * t;

/* socket.io singleton with auto-reconnect + latency probe */
SFA.connect = function (opts = {}) {
  const sock = io({ transports: ['websocket', 'polling'] });
  sock.on('connect', () => { SFA.sock = sock; sock.emit('ping', Date.now()); opts.onConnect && opts.onConnect(); });
  sock.on('disconnect', () => opts.onDisconnect && opts.onDisconnect());
  sock.on('pong', ({ t }) => {
    const rtt = Date.now() - t;
    SFA.latency = Math.round(rtt / 2);
    opts.onLatency && opts.onLatency(SFA.latency);
  });
  setInterval(() => { if (sock.connected) sock.emit('ping', Date.now()); }, 2000);
  return sock;
};

/* haptics (vibrate) — patterns from the design doc */
SFA.haptic = {
  ok: !!navigator.vibrate,
  tap: () => { try { navigator.vibrate(8); } catch (e) {} },
  buzz: () => { try { navigator.vibrate(30); } catch (e) {} },
  heavy: () => { try { navigator.vibrate(60); } catch (e) {} },
  combo: (n) => { try { navigator.vibrate(Array(Math.min(n, 8)).fill(0).map((_, i) => (i % 2 ? 40 : 15))); } catch (e) {} },
  round: () => { try { navigator.vibrate([30, 60, 30]); } catch (e) {} },
  victory: () => { try { navigator.vibrate([40, 50, 40, 50, 40, 120]); } catch (e) {} },
};

/* tiny DOM-toast */
SFA.toast = (msg, cls = '') => {
  let el = SFA.$('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'show ' + cls;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = '', 2400);
};
