// Serves the app on http://localhost:3000 with no dependencies, the way GitHub Pages would,
// except every file is sent with "Cache-Control: no-cache" so a reload always shows your edits.
//
//   npm run dev
//
// It listens on this computer only; HOST=0.0.0.0 opens it to your network (to try it on a phone).
// PORT changes the port.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { path = null; }
  const file = path && normalize(join(ROOT, path === '/' ? 'index.html' : path));
  // Only app files: nothing hidden (.git) and nothing that isn't part of the site.
  if (!file || !file.startsWith(ROOT) || /[/\\]\.|[/\\](tests|scripts|node_modules)[/\\]/.test(file.slice(ROOT.length - 1))) {
    res.writeHead(404).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, HOST, () => console.log(`Miles on http://localhost:${PORT}`));
