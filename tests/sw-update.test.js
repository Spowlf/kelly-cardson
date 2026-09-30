// The service worker tells open pages when a file it serves from the cache has changed on the
// server, so the app can show "Updated, tap to reload" instead of running on stale card rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://example.github.io';

// A fresh worker with a cache holding `cachedBody` for data/cards.json and a server returning `serverBody`.
async function fetchThroughWorker({ cachedBody, serverBody }) {
  const handlers = {};
  const messages = [];
  const store = new Map();
  const cache = {
    match: async (req) => store.get(typeof req === 'string' ? req : req.url)?.clone(),
    put: async (req, res) => { store.set(req.url, res); },
  };
  const url = `${ORIGIN}/data/cards.json`;
  if (cachedBody != null) store.set(url, new Response(cachedBody));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: { matchAll: async () => [{ postMessage: (m) => messages.push(m) }], claim: async () => {} },
    skipWaiting: async () => {},
  };
  const context = {
    self, Request, Response, URL, Promise,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async () => new Response(serverBody),
  };
  vm.runInNewContext(source, context);

  const waits = [];
  let response;
  handlers.fetch({
    request: new Request(url),
    respondWith: (p) => { response = p; },
    waitUntil: (p) => waits.push(p),
  });
  const res = await response;
  await Promise.all(waits);
  return { body: await res.text(), messages, stored: await store.get(url).clone().text() };
}

test('a changed file is served from the cache now, saved, and announced to the page', async () => {
  const r = await fetchThroughWorker({ cachedBody: 'old rules', serverBody: 'new rules' });
  assert.equal(r.body, 'old rules');
  assert.equal(r.stored, 'new rules');
  assert.deepEqual(r.messages.map((m) => m.type), ['updated']);
  assert.match(r.messages[0].url, /data\/cards\.json$/);
});

test('an unchanged file is not announced', async () => {
  const r = await fetchThroughWorker({ cachedBody: 'same rules', serverBody: 'same rules' });
  assert.deepEqual(r.messages, []);
});

test('a first fetch (nothing cached yet) is not announced', async () => {
  const r = await fetchThroughWorker({ cachedBody: null, serverBody: 'rules' });
  assert.equal(r.body, 'rules');
  assert.deepEqual(r.messages, []);
});
