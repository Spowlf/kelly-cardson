// Offline support. Every app file is saved on the phone at install, then served from there
// instantly and refreshed in the background (stale-while-revalidate), so the app opens at a till
// with no signal. When a refresh brings a changed file, open pages are told so she can reload.
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
  'data/mcc-codes.json',
  'src/app.js',
  'src/db/idb.js',
  'src/db/repo.js',
  'src/db/schema.js',
  'src/engine/cycles.js',
  'src/engine/dashboard.js',
  'src/engine/earn.js',
  'src/engine/index.js',
  'src/engine/match.js',
  'src/engine/merchants.js',
  'src/engine/recommend.js',
  'src/engine/rounding.js',
  'src/engine/statement.js',
  'src/ui/add.js',
  'src/ui/backup.js',
  'src/ui/cards.js',
  'src/ui/dom.js',
  'src/ui/history.js',
  'src/ui/merchants.js',
  'src/ui/overview.js',
  'src/ui/statement.js',
  'src/ui/which.js',
];

async function sameBody(a, b) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return false;
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
}

// A cached file changed on the server (new card rules or app code): tell open pages, which
// offer "Updated, tap to reload" so she never runs on stale rules without knowing.
async function announce(url) {
  const pages = await self.clients.matchAll({ type: 'window' });
  for (const page of pages) page.postMessage({ type: 'updated', url });
}

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
    const before = cached?.clone();
    const fresh = fetch(req)
      .then(async (res) => {
        if (!res.ok) return res;
        const changed = before && !(await sameBody(before, res.clone()));
        await cache.put(req, res.clone());
        if (changed) await announce(req.url);
        return res;
      })
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
