// Offline support. Every app file is saved on the phone at install, then served from there
// instantly and refreshed in the background (stale-while-revalidate), so the app opens at a till
// with no signal and picks up new code or card rules the next time it's opened online.
// tests/sw.test.js checks this list covers every app file.

const CACHE = 'miles-v1';

const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'data/cards.json',
  'data/categories.json',
  'data/merchants.prefill.json',
  'src/app.js',
  'src/db/idb.js',
  'src/db/repo.js',
  'src/db/schema.js',
  'src/engine/cycles.js',
  'src/engine/dashboard.js',
  'src/engine/earn.js',
  'src/engine/index.js',
  'src/engine/match.js',
  'src/engine/recommend.js',
  'src/engine/rounding.js',
  'src/engine/statement.js',
  'src/ui/add.js',
  'src/ui/backup.js',
  'src/ui/cards.js',
  'src/ui/dom.js',
  'src/ui/history.js',
  'src/ui/overview.js',
  'src/ui/statement.js',
  'src/ui/which.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache so a new install gets fresh files.
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req)
      .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    const res = await fresh;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }));
});
