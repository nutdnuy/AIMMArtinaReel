// Serves <project>/build over HTTP (Chromium blocks ES-module imports from file://) and opens the page.
// Node only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { W, H } from '../engine/layout.mjs';

export const LOAD_TIMEOUT_MS = 30_000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// Static file server on 127.0.0.1, port chosen by the system. Resolves to {url, close()}.
function serveFolder(root) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const file = resolve(base, `.${path === '/' ? '/index.html' : path}`);
      if (file !== base && !file.startsWith(base + sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      done({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise((end) => {
          server.close(() => end());
          server.closeAllConnections();
        }),
      });
    });
  });
}

const messageOf = (err) => (err instanceof Error ? err.message : String(err));

// Opens <projectDir>/build in Chromium (1080x1920, device scale 1) and waits for window.__paim.ready.
// A failed font, image, icon or data load, or any page error, becomes a thrown Error. The browser and
// the server are closed on every path.
export async function openPage(projectDir, { timeout = LOAD_TIMEOUT_MS } = {}) {
  const buildDir = join(resolve(projectDir), 'build');
  if (!existsSync(join(buildDir, 'index.html'))) {
    throw new Error(`${buildDir} has no index.html: run build.mjs first`);
  }
  const server = await serveFolder(buildDir);
  let browser = null;
  let timer = null;
  const close = async () => {
    clearTimeout(timer);
    await browser?.close().catch(() => {});
    await server.close();
  };
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    // The handler goes on before anything can reject, so no failure is missed or left unhandled.
    const failed = new Promise((_, reject) => {
      page.on('pageerror', (err) => reject(new Error(messageOf(err))));
      page.on('crash', () => reject(new Error('the page crashed')));
    });
    failed.catch(() => {}); // a failure after the race is over is not an unhandled rejection
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`the page did not become ready within ${timeout / 1000} s`)), timeout);
    });
    expired.catch(() => {});
    const loaded = (async () => {
      await page.goto(server.url, { waitUntil: 'load', timeout });
      // The page's own message for a rejected `ready`, as a string (null when it is ready).
      const problem = await page.evaluate(() => window.__paim.ready.then(() => null, (e) => String(e?.message ?? e)));
      if (problem !== null) throw new Error(problem);
    })();
    loaded.catch(() => {});
    await Promise.race([loaded, failed, expired]);
    clearTimeout(timer);
    return { page, close };
  } catch (err) {
    await close();
    throw err instanceof Error ? err : new Error(messageOf(err));
  }
}
