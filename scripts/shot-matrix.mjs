// The UI/UX shot matrix: 28 PNGs through one browser, one page and one guest session.
//
//   node scripts/shot-matrix.mjs --label <ticket>/<before|after>
//   options: --out-dir .shots (PNGs land in <out-dir>/<label>/)  --wait 1400 (settle per shot)
//            --reset-demo (delete .mockup-profile/ first: every ticket does this before its
//                          "before" shots, so before and after start from the same fresh demo)
//            --lang <code> (replace the German group's language, e.g. ja)  --base <url>
//            --debug 1 (log errors and each anonymous sign-in; prints the count at the end)
//
// Matrix (all with demo=1 guest=1):
//   iphone16pro x light,dark x today,progress,challenges,habits,settings,habits/new   12
//   iphonese    x light,dark x the same 6 routes                                       12
//   iphone16pro x light x de x today,progress,habits/new,settings                       4
// Each (device, lang) group loads the host page once; routes and themes then switch with
// mockup:navigate / mockup:theme messages, without a reload. The habit form (habits/new)
// is a sheet, so it is shot last in each group. Nothing here clicks or mutates data.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs, openMockup, hostUrl, attachDebug, loadHost, postToApp, resetProfile, waitForDemo, sleep, ROOT } from './mockup-lib.mjs';

const { args } = parseArgs(process.argv.slice(2));
if (!args.label) { console.error('usage: node scripts/shot-matrix.mjs --label <ticket>/<before|after> [--reset-demo]'); process.exit(1); }
if (args['reset-demo']) resetProfile();

const ROUTES = ['today', 'progress', 'challenges', 'habits', 'settings'];
const FORM = 'habits/new';
const lang2 = args.lang || 'de';
const GROUPS = [
  { device: 'iphone16pro', lang: null, themes: ['light', 'dark'], routes: ROUTES },
  { device: 'iphonese', lang: null, themes: ['light', 'dark'], routes: ROUTES },
  { device: 'iphone16pro', lang: lang2, themes: ['light'], routes: ['today', 'progress', 'settings'] },
];
const wait = Number(args.wait || 1400);
const outDir = path.resolve(args['out-dir'] || path.join(ROOT, '.shots'), args.label);
fs.mkdirSync(outDir, { recursive: true });

const name = (g, theme, route) => `${route.replace(/\//g, '-')}_${theme}_${g.device}${g.lang ? '_' + g.lang : ''}.png`;

const session = await openMockup({ base: args.base });
const started = Date.now();
const written = [];
try {
  const page = await session.browser.newPage();
  const counter = attachDebug(page, args.debug);
  await page.setViewport({ width: 1100, height: 1300, deviceScaleFactor: 2 });
  let first = true;
  for (const g of GROUPS) {
    const startRoute = g.routes[0];
    const appFrame = await loadHost(page, hostUrl(session.base, { device: g.device, theme: g.themes[0], route: startRoute, demo: 1, guest: 1, lang: g.lang }));
    // An unseeded profile signs in and seeds 30 days of demo history on the first load.
    if (first) await waitForDemo(appFrame, session);
    first = false;
    await sleep(2500);
    const shoot = async (theme, route) => {
      const file = path.join(outDir, name(g, theme, route));
      const phone = await page.$('#phone');
      await phone.screenshot({ path: file, omitBackground: true });
      written.push(file);
      console.log(file);
    };
    let theme = g.themes[0];
    const setTheme = async (t) => {
      if (t === theme) return;
      await postToApp(appFrame, { type: 'mockup:theme', theme: t });
      theme = t; await sleep(600);
    };
    const go = async (route) => { await postToApp(appFrame, { type: 'mockup:navigate', route }); await sleep(wait); };
    for (const t of g.themes) {
      await setTheme(t);
      for (const r of g.routes) { await go(r); await shoot(t, r); }
    }
    // The habit form opens as a sheet over Habits; shoot it in every theme, last. A theme
    // switch closes the sheet, so it is reopened after each one.
    for (const t of [...g.themes].reverse()) { await setTheme(t); await go(FORM); await shoot(t, FORM); }
  }
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.error(`shot-matrix: ${written.length} PNGs in ${outDir} (${secs}s)`);
  if (args.debug) console.error(`[auth] anonymous sign-ins this run: ${counter.anonSignIns}`);
} finally {
  await session.close();
}
