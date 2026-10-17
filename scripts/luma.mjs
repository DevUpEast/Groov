// Luminance statistics of a rectangle in a PNG (plan §7.5, C-04 header measurement).
//
//   node scripts/luma.mjs <png> x,y,w,h [--profile rows|cols]
//
// Prints the mean, min and max WCAG relative luminance (0-1) and the mean colour of the
// rect. `--profile rows` adds the mean luminance of every row (cols: every column) and
// lists the rows where it jumps by more than 0.1, which finds an edge such as the bottom
// of a header strip.
import { withPngPixels, relLuminance, toHex } from './mockup-lib.mjs';

const argv = process.argv.slice(2);
const pi = argv.indexOf('--profile');
const profile = pi >= 0 ? (argv[pi + 1] || 'rows') : null;
const [file, rectArg] = argv.filter((a, i) => !(pi >= 0 && (i === pi || i === pi + 1)));
const rect = (rectArg || '').split(',').map(Number);
if (!file || rect.length !== 4 || rect.some(n => !Number.isFinite(n))) { console.error('usage: node scripts/luma.mjs <png> x,y,w,h [--profile rows|cols]'); process.exit(1); }
const [x, y, w, h] = rect;

await withPngPixels(file, async ({ width, height, rect: readRect }) => {
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height) { console.error(`rect ${rectArg} is outside the ${width}x${height} image`); process.exit(1); }
  const { data } = await readRect({ x, y, w, h });
  let sum = 0, min = 1, max = 0; const rgb = [0, 0, 0];
  const lines = new Array(profile === 'cols' ? w : h).fill(0);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const o = (j * w + i) * 4; const px = [data[o], data[o + 1], data[o + 2]];
    const l = relLuminance(px);
    sum += l; if (l < min) min = l; if (l > max) max = l;
    rgb[0] += px[0]; rgb[1] += px[1]; rgb[2] += px[2];
    if (profile) lines[profile === 'cols' ? i : j] += l;
  }
  const n = w * h;
  console.log(`${file} rect ${x},${y},${w},${h}: mean ${(sum / n).toFixed(4)}  min ${min.toFixed(4)}  max ${max.toFixed(4)}  mean colour ${toHex(rgb.map(v => Math.round(v / n)))}`);
  if (profile) {
    const per = profile === 'cols' ? h : w;
    const means = lines.map(v => v / per);
    const origin = profile === 'cols' ? x : y;
    means.forEach((m, k) => console.log(`  ${profile === 'cols' ? 'x' : 'y'}=${origin + k} ${m.toFixed(4)}`));
    const edges = means.map((m, k) => (k && Math.abs(m - means[k - 1]) > 0.1 ? origin + k : null)).filter(v => v !== null);
    console.log(`  edges (|delta| > 0.1): ${edges.length ? edges.join(', ') : 'none'}`);
  }
});
