// The service worker's precache list must cover every file the app loads, or that file is
// missing the first time she opens the app offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const listed = new Set(JSON.parse(`[${sw.match(/const FILES = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`));

const walk = (dir) => readdirSync(new URL(dir, root), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`]));

test('every app script is precached', () => {
  for (const f of walk('src/')) assert.ok(listed.has(f), `${f} is missing from sw.js FILES`);
});

test('shell, data, manifest and icons are precached', () => {
  for (const f of ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'data/cards.json', 'data/categories.json', 'data/merchants.prefill.json']) {
    assert.ok(listed.has(f), `${f} is missing from sw.js FILES`);
  }
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  for (const icon of manifest.icons) assert.ok(listed.has(icon.src), `${icon.src} is missing from sw.js FILES`);
});

test('every precached file exists', () => {
  for (const f of listed) if (f !== './') assert.doesNotThrow(() => readFileSync(new URL(f, root)), `${f} doesn't exist`);
});
