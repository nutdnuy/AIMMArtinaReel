// Browser helpers for the OpenFilm tests. Every wait has a time limit (Playwright's page.evaluate has none:
// a page whose `ready` never settles would wait for ever, and the browser and server a test opened would keep
// the Node process alive), and every handle is closed on its own, so one failing close cannot skip the rest.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveFolder } from '../skills/paim-reel/lib/serve.mjs';

const SKILL = fileURLToPath(new URL('../skills/paim-reel/', import.meta.url));
// playwright lives in the skill's own node_modules, not in the repository root
export const { chromium } = createRequire(join(SKILL, 'package.json'))('playwright');

export const LIMIT_MS = 30_000;

// `promise`, or a rejection after `ms` (the timer is cleared either way).
export function within(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not settle within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

// page.evaluate with a time limit.
export const evaluate = (page, fn, arg, ms = LIMIT_MS) => within(page.evaluate(fn, arg), ms, 'page.evaluate');

// Closes whatever is given, each on its own, and never throws.
export async function closeAll(...handles) {
  for (const handle of handles) {
    if (handle) await within(Promise.resolve().then(() => handle.close()), 10_000, 'close').catch(() => {});
  }
}

// Serves `dir`, starts Chromium and calls use({open(file), server, browser}); `open` loads a page of the folder
// at 1080x1920, waits (within `timeout`) for `window.film.ready` and returns {page, errors, duration}. The
// browser and the server are closed on every path.
export async function withExportPages(dir, use, { timeout = LIMIT_MS } = {}) {
  let server = null;
  let browser = null;
  try {
    server = await serveFolder(dir);
    browser = await within(chromium.launch(), timeout, 'launching Chromium');
    return await use({
      server,
      browser,
      async open(file) {
        const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(timeout);
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${server.url}${file}`, { waitUntil: 'load', timeout });
        const duration = await evaluate(page, async () => { await window.film.ready; return window.film.duration; }, undefined, timeout);
        return { page, errors, duration };
      },
    });
  } finally {
    await closeAll(browser, server);
  }
}
