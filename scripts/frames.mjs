// Frame strip (contact sheet) from a screen recording, for motion review (plan §7.4, §7.6).
//
//   adb shell screenrecord --time-limit 3 /sdcard/rec.mp4 && adb pull /sdcard/rec.mp4 .shots/rec.mp4
//   node scripts/frames.mjs .shots/rec.mp4 .shots/rec-strip.png [--every 50] [--span 1500]
//                           [--start 0] [--width 360] [--cols 10]
//
// Takes one frame every `--every` ms for `--span` ms starting at `--start` ms, scales each
// to `--width` px and tiles them `--cols` per row: the defaults give 30 frames, 10x3,
// i.e. ffmpeg -i in.mp4 -vf "fps=20,scale=360:-1,tile=10x3" out.png.
// Needs ffmpeg (scoop install ffmpeg). Without it, the fallback is a coarser screencap
// burst: `for i in $(seq 1 12); do adb exec-out screencap -p > f$i.png; done` (~150-250 ms
// per frame), reviewed frame by frame.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const pos = []; const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1]; i++; } else pos.push(argv[i]);
}
const [input, output] = pos;
if (!input || !output) { console.error('usage: node scripts/frames.mjs <in.mp4> <out.png> [--every 50] [--span 1500] [--start 0] [--width 360] [--cols 10]'); process.exit(1); }
if (!fs.existsSync(input)) { console.error(`frames: no such file ${input}`); process.exit(1); }

const every = Number(opt.every || 50);
const span = Number(opt.span || 1500);
const start = Number(opt.start || 0);
const width = Number(opt.width || 360);
const cols = Number(opt.cols || 10);
const count = Math.max(1, Math.round(span / every));
const rows = Math.ceil(count / cols);
const fps = 1000 / every;

function findFfmpeg() {
  const candidates = [process.env.FFMPEG, 'ffmpeg', path.join(os.homedir(), 'scoop', 'shims', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['-version'], { stdio: 'ignore' });
    if (r.status === 0) return c;
  }
  return null;
}
const ffmpeg = findFfmpeg();
if (!ffmpeg) {
  console.error('frames: ffmpeg not found (scoop install ffmpeg, or set FFMPEG). Fallback: an adb screencap burst, see the header of this script.');
  process.exit(2);
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
const vf = `fps=${fps},scale=${width}:-1,tile=${cols}x${rows}`;
const ffArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', (start / 1000).toFixed(3), '-t', (span / 1000).toFixed(3), '-i', input, '-vf', vf, '-frames:v', '1', output];
execFileSync(ffmpeg, ffArgs, { stdio: 'inherit' });
console.log(`${path.resolve(output)}  (${count} frames, every ${every} ms from ${start} ms, ${cols}x${rows}, ${width}px wide; ffmpeg -vf "${vf}")`);
