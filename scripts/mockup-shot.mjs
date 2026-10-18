// Screenshot the iOS mockup with the locally installed Chrome/Edge via puppeteer-core.
//
//   node scripts/mockup-shot.mjs --app groov --route today --theme dark --out shot.png
//   options: --device iphone16pro --frame 0|1 --scale 2 --wait 2500 --base <url> --full 0|1
//            --click "text=Continue without an account" (repeatable, run before the shot)
//            --html out.html (dump the app iframe's visible text for text-level review)
//            --debug 1 (print console errors, page errors, failed requests and each
//                       anonymous sign-in to stderr, plus a sign-in count at the end)
//            --demo 0|1 --guest 0|1 --lang de (forwarded to the app; default: apps.json params)
//            --nudge 1 --streak 12|frozen --challenges 2 --hint longPress (review states, forwarded)
//            --fresh (throwaway Chrome profile: first-run, onboarding, welcome shots)
//            --reset-demo (delete .mockup-profile/ first; alone, without --out, it only resets)
// Without --base, serves ./mockup-dist on port 8786 (run scripts/build-mockup.sh first).
// The Chrome profile .mockup-profile/ keeps the guest session and demo data between runs,
// so only the first run signs in anonymously and seeds the demo.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs, openMockup, hostUrl, attachDebug, loadHost, resetProfile, waitForDemo, sleep } from './mockup-lib.mjs';

const { args, clicks } = parseArgs(process.argv.slice(2));
if (args['reset-demo']) {
  resetProfile();
  if (!args.out) process.exit(0);
}
const app = args.app || 'groov';
const device = args.device || 'iphone16pro';
const theme = args.theme || 'light';
const route = args.route || '';
const frame = args.frame === '1';
const scale = Number(args.scale || 2);
const wait = Number(args.wait || 2500);
const out = path.resolve(args.out || `mockup-${app}-${route || 'home'}-${theme}.png`);

const session = await openMockup({ base: args.base, fresh: args.fresh === '1' });
const extra = { nudge: args.nudge, streak: args.streak, challenges: args.challenges, hint: args.hint };
const url = hostUrl(session.base, { app, device, theme, route, frame, demo: args.demo, guest: args.guest, lang: args.lang, extra });
try {
  const page = await session.browser.newPage();
  const counter = attachDebug(page, args.debug);
  await page.setViewport({ width: 1100, height: 1300, deviceScaleFactor: scale });
  const appFrame = await loadHost(page, url);
  // An unseeded profile signs in and seeds the demo on this load; wait until it lands.
  if (args.demo !== '0' && args.guest !== '0') await waitForDemo(appFrame, session);
  await sleep(wait);
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
      await sleep(900);
    } catch (e) { console.warn('click failed', sel, e.message); }
  }
  if (args.html) {
    const html = await appFrame.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.resolve(args.html), html);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (args.full === '1') await page.screenshot({ path: out, fullPage: true });
  else { const phone = await page.$('#phone'); await phone.screenshot({ path: out, omitBackground: !frame }); }
  if (args.debug) console.error(`[auth] anonymous sign-ins this run: ${counter.anonSignIns}`);
  console.log(out);
} finally {
  await session.close();
}
