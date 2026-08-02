/* StickFight Arena — service worker
   Strategy: network-first for app code (always fresh), cache-first only for
   immutable vendor assets + icons. Keeps the controller usable offline-ish
   and makes the app installable (PWA). */
'use strict';
const CACHE = 'sfa-v1';
const PRECACHE = [
  '/mobile.html',
  '/css/style.css',
  '/css/mobile.css',
  '/js/common.js',
  '/js/audio.js',
  '/js/stickman.js',
  '/js/controller.js',
  '/shared/config.js',
  '/vendor-jsqr.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  // never intercept socket.io or API
  if (u.pathname.startsWith('/socket.io') || u.pathname.startsWith('/api')) return;

  // immutable vendor: cache-first
  if (u.pathname.startsWith('/vendor-jsqr.js') || u.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const cl = res.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
        return res;
      }))
    );
    return;
  }

  // everything else: network-first with cache fallback
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const cl = res.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
