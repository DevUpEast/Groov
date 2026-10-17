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
import { parseArgs } from './mockup-lib.mjs';

const USAGE = 'usage: node scripts/frames.mjs <in.mp4> <out.png> [--every 50] [--span 1500] [--start 0] [--width 360] [--cols 10]';
const { args: opt, positional } = parseArgs(process.argv.slice(2));
const [input, output] = positional;
if (!input || !output) { console.error(USAGE); process.exit(1); }
if (!fs.existsSync(input)) { console.error(`frames: no such file ${input}`); process.exit(1); }

// Numeric flags: positive numbers (start may be 0); anything else is a usage error.
function num(name, def, { min = 0, integer = false, allowZero = false } = {}) {
  const raw = opt[name] ?? String(def);
  const n = Number(raw);
  const ok = Number.isFinite(n) && (allowZero ? n >= min : n > min) && (!integer || Number.isInteger(n));
  if (!ok) { console.error(`frames: --${name} must be ${integer ? 'an integer' : 'a number'} ${allowZero ? '>= 0' : '> 0'} (got "${raw}")
${USAGE}`); process.exit(1); }
  return n;
}
const every = num('every', 50);
const span = num('span', 1500);
const start = num('start', 0, { allowZero: true });
const width = num('width', 360, { integer: true });
const cols = num('cols', 10, { integer: true });
const count = Math.max(1, Math.round(span / every));
const rows = Math.ceil(count / cols);
const fps = 1000 / every;

function findTool(name, envVar) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [process.env[envVar], name, path.join(os.homedir(), 'scoop', 'shims', exe)].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['-version'], { stdio: 'ignore' });
    if (r.status === 0) return c;
  }
  return null;
}
const ffmpeg = findTool('ffmpeg', 'FFMPEG');
if (!ffmpeg) {
  console.error('frames: ffmpeg not found (scoop install ffmpeg, or set FFMPEG). Fallback: an adb screencap burst, see the header of this script.');
  process.exit(2);
}

// Clip length (ffprobe ships with ffmpeg): a start past the end is an error, a span past
// the end gives fewer real frames (the sheet is padded), which is reported honestly.
let duration = null;
const ffprobe = findTool('ffprobe', 'FFPROBE');
if (ffprobe) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input], { encoding: 'utf8' });
  const d = Number(String(r.stdout || '').trim());
  if (r.status === 0 && Number.isFinite(d)) duration = d * 1000;
}
if (duration !== null && start >= duration) {
  console.error(`frames: --start ${start} ms is past the end of the video (${(duration / 1000).toFixed(2)} s)`);
  process.exit(1);
}
const realFrames = duration === null ? count : Math.min(count, Math.max(1, Math.ceil((duration - start) / every)));

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.rmSync(output, { force: true }); // so "no file" below really means ffmpeg wrote nothing
const vf = `fps=${fps},scale=${width}:-1,tile=${cols}x${rows}`;
const ffArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', (start / 1000).toFixed(3), '-t', (span / 1000).toFixed(3), '-i', input, '-vf', vf, '-frames:v', '1', output];
try {
  execFileSync(ffmpeg, ffArgs, { stdio: 'inherit' });
} catch (e) {
  console.error(`frames: ffmpeg failed (exit ${e.status ?? '?'})`);
  process.exit(typeof e.status === 'number' && e.status > 0 ? e.status : 1);
}
if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
  console.error(`frames: ffmpeg wrote no file: no frames in range (start ${start} ms, span ${span} ms${duration !== null ? `, video ${(duration / 1000).toFixed(2)} s` : ''})`);
  process.exit(1);
}
const note = realFrames < count ? ` (only ${realFrames} real; the video ends at ${(duration / 1000).toFixed(2)} s, the rest is padding)` : '';
console.log(`${path.resolve(output)}  (${count} slots${note}, every ${every} ms from ${start} ms, ${cols}x${rows}, ${width}px wide; ffmpeg -vf "${vf}")`);
