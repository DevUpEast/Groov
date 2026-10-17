// Render a hand-written HTML design frame to PNG with the local Chrome (puppeteer-core),
// and optionally measure the phone frames in it.
//
//   node scripts/render-frame.mjs <frame.html> --out shot.png            whole page
//   node scripts/render-frame.mjs <frame.html> --each "[data-shot]" --out-dir shots/D-00
//                                                one PNG per matching element, named by its data-shot
//   options: --scale 2 (device pixel ratio) --width 1900 --height 1000 (viewport) --wait 300
//            --measure  print a JSON report per phone (and write measure.json next to --out-dir)
//
// The frame is loaded from file://, so fonts can sit next to it (url('fonts/X.ttf')).
// A page that sets window.__frameReady = false while it loads is rendered once it flips to true.
//
// --measure contract (data attributes in the frame):
//   [data-phone="<name>"]  one phone screen; its height is the screen height
//   [data-strip]           the progress strip; stripBottom = its bottom edge from the phone top
//   [data-greet]           the greeting line; data-wrapped="1" when the name moved to its own line
//   [data-card]            a habit card; "above the fold" = fully between the strip bottom and the tab bar
//   [data-tabbar] [data-tab]  the tab bar and its tabs; each tab must hold exactly one icon glyph
//                          (one .ion element, no border/outline box around it)
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { parseArgs, findChrome } from './mockup-lib.mjs';

const { args, positional } = parseArgs(process.argv.slice(2));
const html = positional[0];
if (!html) {
  console.error('usage: node scripts/render-frame.mjs <frame.html> [--out x.png | --each <selector> --out-dir <dir>] [--measure] [--scale 2]');
  process.exit(2);
}
const scale = Number(args.scale || 2);
const width = Number(args.width || 1900);
const height = Number(args.height || 1000);
const wait = Number(args.wait || 300);

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(path.resolve(html)).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__frameReady !== false, { timeout: 15000 });
  await new Promise(r => setTimeout(r, wait));

  let report = null;
  if (args.measure) {
    report = await page.evaluate(() => [...document.querySelectorAll('[data-phone]')].map(ph => {
      const top = ph.getBoundingClientRect().top;
      const h = ph.getBoundingClientRect().height;
      const strip = ph.querySelector('[data-strip]');
      const tabbar = ph.querySelector('[data-tabbar]');
      const greet = ph.querySelector('[data-greet]');
      const sb = strip ? strip.getBoundingClientRect().bottom - top : null;
      const fold = tabbar ? tabbar.getBoundingClientRect().top - top : h;
      const cards = [...ph.querySelectorAll('[data-card]')].map(c => c.getBoundingClientRect());
      const above = cards.filter(r => r.top - top >= (sb ?? 0) - 0.5 && r.bottom - top <= fold + 0.5);
      const lastBottom = above.length ? Math.max(...above.map(r => r.bottom - top)) : null;
      const tabs = [...ph.querySelectorAll('[data-tab]')].map(t => {
        const icons = [...t.querySelectorAll('.ion')];
        const boxed = icons.some(i => { const cs = getComputedStyle(i); return parseFloat(cs.borderTopWidth) > 0 || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0); });
        return { glyphs: icons.length, size: icons[0] ? parseFloat(getComputedStyle(icons[0]).fontSize) : null, boxed };
      });
      return {
        phone: ph.dataset.phone,
        screen: [Math.round(ph.getBoundingClientRect().width), Math.round(h)],
        stripBottom: sb === null ? null : Math.round(sb),
        headerPct: sb === null ? null : +((sb / h) * 100).toFixed(1),
        greetingLines: greet ? Math.round(greet.getBoundingClientRect().height / parseFloat(getComputedStyle(greet).lineHeight)) : null,
        greetingWrapped: greet ? greet.dataset.wrapped === '1' : null,
        fold: Math.round(fold),
        cardsTotal: cards.length,
        cardsAboveFold: above.length,
        marginBelowLastCard: lastBottom === null ? null : Math.round(fold - lastBottom),
        tabs: tabs.length,
        oneGlyphPerTab: tabs.length > 0 && tabs.every(t => t.glyphs === 1 && !t.boxed),
        tabIconPx: tabs[0]?.size ?? null,
        iconFontLoaded: document.fonts.check('24px Ion'),
      };
    }));
    console.log(JSON.stringify(report, null, 1));
  }

  if (args.each) {
    const dir = path.resolve(args['out-dir'] || '.');
    fs.mkdirSync(dir, { recursive: true });
    const els = await page.$$(args.each);
    for (const [i, el] of els.entries()) {
      const name = (await el.evaluate(e => e.dataset.shot || e.dataset.phone || '')) || `frame-${i + 1}`;
      const out = path.join(dir, `${name}.png`);
      await el.screenshot({ path: out });
      console.log(out);
    }
    if (report) fs.writeFileSync(path.join(dir, 'measure.json'), JSON.stringify(report, null, 1) + '\n');
  } else {
    const out = path.resolve(args.out || html.replace(/\.html?$/i, '') + '.png');
    await page.screenshot({ path: out, fullPage: true });
    console.log(out);
  }
} finally {
  await browser.close();
}
