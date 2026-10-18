#!/usr/bin/env node
// Render the Groov sound kit (plan §2.11, F-04b) to WAV files with the same pure synth the app
// uses (src/utils/synth.js + src/utils/soundKit.js). No expo-audio, no React Native.
//
//   node scripts/render-sound-kit.mjs [--out research_notes/uiux/review/sounds] [--quiet]
//
// Writes the 12 listening WAVs plus "a day in 10 seconds" and prints each file's size and peak.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outDir = resolve(root, opt('--out', 'research_notes/uiux/review/sounds'));
const quiet = args.includes('--quiet');

// src/ has no "type": "module" package.json (Metro does not need one), so Node detects ESM syntax
// and warns once per file. The warning is noise here; drop just that one.
const emit = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  const text = typeof w === 'string' ? w : w?.message || '';
  if (/MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES module/.test(text) || rest.some(r => r === 'MODULE_TYPELESS_PACKAGE_JSON' || r?.code === 'MODULE_TYPELESS_PACKAGE_JSON')) return;
  return emit.call(process, w, ...rest);
};

const { renderKitFiles } = await import('../src/utils/soundKit.js');
const { SAMPLE_RATE, ampToDb } = await import('../src/utils/synth.js');

mkdirSync(outDir, { recursive: true });
const files = renderKitFiles(SAMPLE_RATE);
let total = 0;
for (const { name, bytes } of files) {
  writeFileSync(join(outDir, name), bytes);
  total += bytes.length;
  if (!quiet) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0;
    for (let i = 44; i + 1 < bytes.length; i += 2) p = Math.max(p, Math.abs(view.getInt16(i, true)));
    const ms = Math.round(((bytes.length - 44) / 2 / SAMPLE_RATE) * 1000);
    console.log(`${name.padEnd(30)} ${String(ms).padStart(5)} ms  ${(bytes.length / 1024).toFixed(1).padStart(6)} KB  peak ${ampToDb(p / 32767).toFixed(1)} dBFS`);
  }
}
if (!quiet) console.log(`${files.length} files, ${(total / 1024).toFixed(1)} KB, ${SAMPLE_RATE} Hz mono 16-bit → ${outDir}`);
