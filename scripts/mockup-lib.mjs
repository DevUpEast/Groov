// Shared helpers for the mockup screenshot tools (mockup-shot, shot-matrix) and the
// pixel tools (sample-contrast, luma). Everything runs the locally installed Chrome
// or Edge through puppeteer-core.
//
// Session reuse: the shot tools launch Chrome with a persistent profile in
// .mockup-profile/ and serve mockup-dist/ on a fixed port, so the Supabase guest
// session and the demo data (both in the app's localStorage, which is per origin)
// survive between runs. A run then signs in anonymously once, not once per shot.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './mockup-serve.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILE_DIR = path.join(ROOT, '.mockup-profile');
// Fixed so the localStorage origin (and with it the guest session) stays the same.
export const SHOT_PORT = 8786;
// Written into the profile once the demo seed has landed in the app's localStorage, so a
// profile left half-seeded (a crash, or a --guest 0 / --demo 0 run) is seeded again.
export const SEEDED_MARKER = '.groov-demo-seeded';

const PROFILE_REMEDY = 'The profile is in use: another shot run, or an orphaned headless Chrome from a crashed run. '
  + `Kill it (PowerShell): Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ? CommandLine -like '*mockup-profile*' | % { Stop-Process $_.ProcessId -ErrorAction SilentlyContinue }`
  + '  - or use --fresh for a throwaway profile.';

// Minimal flag parser: `--key value`, `--flag` (= '1'); `--click` is repeatable.
export function parseArgs(argv) {
  const args = {}; const clicks = []; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2); const v = argv[i + 1];
      if (k === 'click') { clicks.push(v); i++; continue; }
      args[k] = v !== undefined && !v.startsWith('--') ? (i++, v) : '1';
    } else positional.push(a);
  }
  return { args, clicks, positional };
}

export function findChrome() {
  const chrome = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(p => p && fs.existsSync(p));
  if (!chrome) { console.error('No Chrome/Edge found; set CHROME_PATH'); process.exit(1); }
  return chrome;
}

export function resetProfile() {
  try {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 2, retryDelay: 300 });
  } catch (e) {
    console.error(`reset-demo: cannot delete ${PROFILE_DIR} (${e.code || e.message}). ${PROFILE_REMEDY}`);
    process.exit(1);
  }
  console.error(`reset-demo: removed ${PROFILE_DIR}`);
}

// Serve mockup-dist/ (unless `base` is given) and launch Chrome.
//   fresh: throwaway temp profile (first-run, onboarding, welcome shots)
// Returns { browser, base, profile, fresh, seeded, close }. `seeded` is true when the
// profile carries the marker of a landed demo seed; otherwise call waitForDemo().
export async function openMockup({ base, fresh = false, port } = {}) {
  let server = null;
  if (!base) {
    const p = Number(port || (fresh ? 8790 + Math.floor(Math.random() * 100) : SHOT_PORT));
    try { server = await startServer({ port: p }); }
    catch (e) { console.error(`Cannot serve mockup-dist on port ${p} (${e.code || e.message}): another shot run, or another process on ${p} (netstat -ano | findstr ${p}).`); process.exit(1); }
    base = `http://localhost:${p}/Groov`;
  }
  const profile = fresh ? fs.mkdtempSync(path.join(os.tmpdir(), 'groov-mockup-')) : PROFILE_DIR;
  const seeded = !fresh && fs.existsSync(path.join(profile, SEEDED_MARKER));
  fs.mkdirSync(profile, { recursive: true });
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: findChrome(), headless: true, userDataDir: profile,
      args: ['--no-sandbox', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check'],
    });
  } catch (e) {
    if (server) server.close();
    const msg = String(e && e.message || e).split(/\r?\n/)[0];
    console.error(/already running|lock|in use/i.test(msg) ? `Cannot start Chrome on ${profile}. ${PROFILE_REMEDY}` : `Cannot start Chrome: ${msg}`);
    process.exit(1);
  }
  const close = async () => {
    await browser.close().catch(() => {});
    if (server) server.close();
    if (fresh) fs.rmSync(profile, { recursive: true, force: true });
  };
  return { browser, base, profile, fresh, seeded, close };
}

// Wait until the demo seed has landed in the app's localStorage (habits plus at least 5
// days of completions), then mark the persistent profile as seeded. Returns at once when
// the marker is already there. Polls instead of sleeping; gives up after `timeout` ms.
export async function waitForDemo(appFrame, session, { timeout = 30000 } = {}) {
  if (session.seeded) return true;
  const landed = () => {
    try {
      const habits = JSON.parse(localStorage.getItem('habits') || '[]');
      const completions = JSON.parse(localStorage.getItem('completions') || '{}');
      return Array.isArray(habits) && habits.length > 0 && Object.keys(completions || {}).length >= 5;
    } catch { return false; }
  };
  const ok = await appFrame.waitForFunction(landed, { timeout, polling: 250 }).then(() => true, () => false);
  if (!ok) { console.error(`demo: the seed did not land within ${timeout / 1000}s; shots may show an unseeded app`); return false; }
  await sleep(1500); // the seed re-applies the requested route and syncs; let it settle
  if (!session.fresh) {
    fs.writeFileSync(path.join(session.profile, SEEDED_MARKER), `${new Date().toISOString()}\n`);
    session.seeded = true;
  }
  return true;
}

// Host page URL. demo/guest/lang are forwarded to the app by the host (mockup/mockup.js).
export function hostUrl(base, { app = 'groov', device = 'iphone16pro', theme = 'light', route = '', frame = false, demo, guest, lang } = {}) {
  let url = `${base}/index.html?app=${app}&device=${device}&theme=${theme}&route=${encodeURIComponent(route)}&chrome=0&frame=${frame ? 1 : 0}&scale=1`;
  if (demo !== undefined) url += `&demo=${encodeURIComponent(demo)}`;
  if (guest !== undefined) url += `&guest=${encodeURIComponent(guest)}`;
  if (lang) url += `&lang=${encodeURIComponent(lang)}`;
  return url;
}

// Anonymous sign-in = POST /auth/v1/signup without an email (supabase-js signInAnonymously).
export function isAnonSignIn(req) {
  return req.method() === 'POST' && /\/auth\/v1\/signup(\?|$)/.test(req.url());
}

// --debug 1: console errors, page errors, failed requests, and each anonymous sign-in.
// Returns a counter object whose `anonSignIns` grows as sign-ins happen.
export function attachDebug(page, debug) {
  const counter = { anonSignIns: 0 };
  page.on('request', r => {
    if (!isAnonSignIn(r)) return;
    counter.anonSignIns++;
    if (debug) console.error(`[auth] signInAnonymously #${counter.anonSignIns} POST ${r.url()}`);
  });
  if (debug) {
    const log = (tag, text) => console.error(`[${tag}] ${String(text).slice(0, 800)}`);
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log('console.' + m.type(), m.text()); });
    page.on('pageerror', e => log('pageerror', e.message));
    page.on('requestfailed', r => log('requestfailed', r.url()));
    page.on('response', r => { if (r.status() >= 400) log('http ' + r.status(), r.url()); });
  }
  return counter;
}

// Load the host page and return the app iframe once it rendered.
export async function loadHost(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  const frameEl = await page.waitForSelector('#screenFrame', { timeout: 30000 });
  const appFrame = await frameEl.contentFrame();
  await appFrame.waitForSelector('body', { timeout: 30000 });
  // The app posts mockup:ready after its first load; the host marks <body data-ready>.
  await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 30000 }).catch(() => {});
  return appFrame;
}

// Send a mockup-v1 message to the app (it listens on its own window, no origin check).
export function postToApp(appFrame, msg) {
  return appFrame.evaluate((m) => window.postMessage(m, '*'), msg);
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Read a PNG's pixels through a canvas in headless Chrome. Calls fn(api) where
// api.width/height are the image size and api.pixels(points) returns [[r,g,b,a]...],
// api.rect({x,y,w,h}) returns { w, h, data: number[] } (RGBA, row-major).
export async function withPngPixels(file, fn) {
  const b64 = fs.readFileSync(path.resolve(file)).toString('base64');
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const size = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      window.__ctx = ctx;
      return { width: c.width, height: c.height };
    }, `data:image/png;base64,${b64}`);
    const api = {
      ...size,
      pixels: (points) => page.evaluate((pts) => pts.map(([x, y]) => [...window.__ctx.getImageData(x, y, 1, 1).data]), points),
      rect: ({ x, y, w, h }) => page.evaluate((r) => ({ w: r.w, h: r.h, data: [...window.__ctx.getImageData(r.x, r.y, r.w, r.h).data] }), { x, y, w, h }),
    };
    return await fn(api);
  } finally {
    await browser.close();
  }
}

// WCAG 2.x relative luminance and contrast ratio.
export function relLuminance([r, g, b]) {
  const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
export function contrastRatio(a, b) {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
export const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
