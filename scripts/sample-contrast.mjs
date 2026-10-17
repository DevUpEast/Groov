// WCAG contrast of two sampled pixels in a PNG (plan §7.5): spot-check rendered pairs.
//
//   node scripts/sample-contrast.mjs <png> x1,y1 x2,y2 [x3,y3 x4,y4 ...]
//
// Coordinates are image pixels (a mockup shot is 2x the device points). Each pair of
// points prints both colours and their contrast ratio, plus whether it clears 4.5 (text)
// and 3 (large text, non-text).
import { withPngPixels, contrastRatio, toHex } from './mockup-lib.mjs';

const [file, ...pts] = process.argv.slice(2);
if (!file || pts.length < 2 || pts.length % 2) { console.error('usage: node scripts/sample-contrast.mjs <png> x1,y1 x2,y2 [more pairs]'); process.exit(1); }
const points = pts.map(p => { const [x, y] = p.split(',').map(Number); if (!Number.isFinite(x) || !Number.isFinite(y)) { console.error(`bad point ${p}`); process.exit(1); } return [x, y]; });

await withPngPixels(file, async ({ width, height, pixels }) => {
  for (const [x, y] of points) if (x < 0 || y < 0 || x >= width || y >= height) { console.error(`point ${x},${y} is outside the ${width}x${height} image`); process.exit(1); }
  const px = await pixels(points);
  for (let i = 0; i < px.length; i += 2) {
    const a = px[i], b = px[i + 1];
    const ratio = contrastRatio(a, b);
    console.log(`${points[i].join(',')} ${toHex(a)}  vs  ${points[i + 1].join(',')} ${toHex(b)}  ->  ${ratio.toFixed(2)}:1  (text 4.5 ${ratio >= 4.5 ? 'pass' : 'FAIL'}, large/non-text 3 ${ratio >= 3 ? 'pass' : 'FAIL'})`);
  }
});
