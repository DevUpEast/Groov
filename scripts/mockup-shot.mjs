// Screenshot the iOS mockup with the locally installed Chrome/Edge via puppeteer-core.
//
//   node scripts/mockup-shot.mjs --app groov --route today --theme dark --out shot.png
//   options: --device iphone16pro --frame 0|1 --scale 2 --wait 2500 --base <url> --full 0|1
//            --click "text=Continue without an account" (repeatable, run before the shot)
//            --html out.html (dump the app iframe's visible text for text-level review)
//            --debug 1 (print console errors, page errors and failed requests to stderr)
// Without --base, serves ./mockup-dist on a free port (run scripts/build-mockup.sh first).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './mockup-serve.mjs';

const args = {};
const clicks = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2); const v = process.argv[i + 1];
    if (k === 'click') { clicks.push(v); i++; continue; }
    args[k] = v && !v.startsWith('--') ? (i++, v) : '1';
  }
}
const app = args.app || 'groov';
const device = args.device || 'iphone16pro';
const theme = args.theme || 'light';
const route = args.route || '';
const frame = args.frame === '1';
const scale = Number(args.scale || 2);
const wait = Number(args.wait || 2500);
const out = path.resolve(args.out || `mockup-${app}-${route || 'home'}-${theme}.png`);

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('No Chrome/Edge found; set CHROME_PATH'); process.exit(1); }

let server = null;
let base = args.base;
if (!base) {
  const port = 8790 + Math.floor(Math.random() * 100);
  server = await startServer({ port });
  base = `http://localhost:${port}/Groov`;
}
const url = `${base}/index.html?app=${app}&device=${device}&theme=${theme}&route=${encodeURIComponent(route)}&chrome=0&frame=${frame ? 1 : 0}&scale=1`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
try {
  const page = await browser.newPage();
  if (args.debug) {
    const log = (tag, text) => console.error(`[${tag}] ${String(text).slice(0, 800)}`);
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log('console.' + m.type(), m.text()); });
    page.on('pageerror', e => log('pageerror', e.message));
    page.on('requestfailed', r => log('requestfailed', r.url()));
    page.on('response', r => { if (r.status() >= 400) log('http ' + r.status(), r.url()); });
  }
  await page.setViewport({ width: 1100, height: 1300, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  const frameEl = await page.waitForSelector('#screenFrame', { timeout: 30000 });
  const appFrame = await frameEl.contentFrame();
  await appFrame.waitForSelector('body', { timeout: 30000 });
  await new Promise(r => setTimeout(r, wait));
  for (const sel of clicks) {
    try {
      if (sel.startsWith('text=')) {
        const text = sel.slice(5);
        const handle = await appFrame.evaluateHandle((t) => {
          const els = [...document.querySelectorAll('div,span,button,a')];
          return els.find(e => e.childElementCount === 0 && e.textContent.trim() === t) || null;
        }, text);
        if (handle && handle.asElement()) await handle.asElement().click(); else console.warn('click: no element with text', text);
      } else {
        await appFrame.click(sel);
      }
      await new Promise(r => setTimeout(r, 900));
    } catch (e) { console.warn('click failed', sel, e.message); }
  }
  if (args.html) {
    const html = await appFrame.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.resolve(args.html), html);
  }
  if (args.full === '1') await page.screenshot({ path: out, fullPage: true });
  else { const phone = await page.$('#phone'); await phone.screenshot({ path: out, omitBackground: !frame }); }
  console.log(out);
} finally {
  await browser.close();
  if (server) server.close();
}
