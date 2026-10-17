# iOS Mockup

An interactive iPhone frame around a **web build** of a mobile app. Use it to review designs in a browser, share a link to a specific screen, or let an agent take screenshots.

Live: https://devupeast.github.io/Groov/ (deployed by `.github/workflows/mockup-pages.yml` on every push to `master`).

## URL parameters

| Param | Values | Meaning |
|---|---|---|
| `app` | id from `apps.json` | which app to load |
| `device` | `iphone16pro` (default), `iphone16promax`, `iphone16`, `iphone13mini`, `iphonese`, `ipadmini` | frame geometry and safe-area insets |
| `theme` | `system`, `light`, `dark` | appearance passed to the app |
| `route` | e.g. `today`, `habit/123` | initial screen / deep link |
| `scale` | `fit`, `1`, `0.75`, `0.5` | zoom |
| `chrome` | `0` | hide the control bar |
| `frame` | `0` | hide the bezel (screen only) |
| `clock` | `real` | real clock instead of 9:41 |

Any other query param on the host URL is forwarded to the app (Groov understands `guest=1`, `demo=1` and `lang=<code>`, e.g. `lang=de` for one page load in German without saving the choice; pass `demo=0` to see onboarding).

Example: `?app=groov&device=iphone16pro&theme=dark&route=progress&chrome=0`

## Adding another app

1. Export the app for web and put it under `mockup-dist/apps/<id>/` at deploy time (see `scripts/build-mockup.sh`). The export must be built with `experiments.baseUrl` set to `/<repo>/apps/<id>` (or wherever it is hosted) so its asset URLs resolve.
2. Add an entry to `mockup/apps.json`: `{ "id", "name", "url", "defaultRoute", "routes", "params" }`. `params` are extra query params appended to the app URL (Groov uses `guest=1` for an anonymous session and `demo=1` for seeded sample data).
3. Optional: implement the **mockup-v1 contract** in the app so theme and route switch live:
   - read `?theme=`, `?route=` and `?insets=top,right,bottom,left` from the page URL on first load (Groov does this in `App.js` / `AppContext`; it also reads `?lang=` in `src/i18n/index.js`);
   - listen for `window` `message` events `{ type: 'mockup:theme', theme }` and `{ type: 'mockup:navigate', route }`;
   - post `{ type: 'mockup:statusbar', style: 'light' | 'dark' }` to `window.parent` whenever the status-bar text colour should change, and `{ type: 'mockup:ready' }` after first paint.

## Screenshots for agents

`node scripts/mockup-shot.mjs --app groov --route today --theme dark --device iphone16pro --out shot.png`

Uses the locally installed Chrome (or Edge) through `puppeteer-core`, serves `mockup-dist/` on a local port when `--base` is not given, and writes a PNG of the phone screen at 2× device pixel ratio. `--frame 1` keeps the bezel; `--wait 3000` changes the settle time (the demo seed needs ~8 s on first load); `--full 1` screenshots the whole page; `--html out.txt` dumps the visible text of all screens; `--click "text=Label"` taps before the shot; `--debug 1` prints console/page errors, each anonymous sign-in (`POST /auth/v1/signup`) and the run's sign-in count.

`--demo 0|1`, `--guest 0|1` and `--lang <code>` are forwarded to the app (without them the `apps.json` params apply).

**One reusable guest session.** The shot tools launch Chrome with the persistent profile `.mockup-profile/` (gitignored) and serve `mockup-dist/` on the fixed port 8786, so the Supabase guest session and the demo data in localStorage survive between runs: only the first run calls `signInAnonymously()` and seeds the demo. The tools wait until the seed has landed in localStorage and then write the marker `.mockup-profile/.groov-demo-seeded`; a profile without it (a crash mid-seed, or a `--guest 0` / `--demo 0` run) is waited on again. This keeps shot runs far below Supabase's anonymous sign-in rate limit.
- `--fresh` uses a throwaway temp profile (and a random port): first-run, onboarding and welcome shots, or anything that clicks and mutates data.
- `--reset-demo` deletes `.mockup-profile/` first (on its own, without `--out`, it only resets). Run it before a ticket's "before" shots so before and after start from the same freshly seeded demo.
- Only one shot run at a time can use the shared profile and port. A profile still held by an orphaned headless Chrome makes the tools exit with the PowerShell command that kills it.

### Shot matrix

`node scripts/shot-matrix.mjs --label <ticket>/<before|after> [--reset-demo] [--debug 1] [--lang ja] [--out-dir .shots] [--wait 1400] [--base <url>]`

Writes 28 PNGs to `.shots/<label>/` through one browser, one page and one guest session: iPhone 16 Pro and iPhone SE, light and dark, for `today`, `progress`, `challenges`, `habits`, `settings` and `habits/new` (24), plus iPhone 16 Pro light in German for `today`, `progress`, `settings` and `habits/new` (4; `--lang` swaps the language). Each device/language group loads the page once; routes and themes switch with `mockup:navigate` / `mockup:theme` messages. Names are `<route>_<theme>_<device>[_<lang>].png`. `--wait` is the settle time in ms after each navigation (default 1400); `--base` shoots an already-served host (e.g. the live Pages URL) instead of serving `mockup-dist/`.

### Pixel and motion tools

- `node scripts/sample-contrast.mjs <png> x1,y1 x2,y2 [...]`: WCAG ratio of each pair of sampled pixels (image pixels; mockup shots are 2x points).
- `node scripts/luma.mjs <png> x,y,w,h [--profile rows|cols]`: mean/min/max relative luminance of a rect; `--profile` prints per-row (or column) means and the edges where they jump, e.g. the bottom of the Today header.
- `node scripts/frames.mjs <in.mp4> <out.png> [--every 50] [--span 1500] [--start 0] [--width 360] [--cols 10]`: contact sheet of a screen recording (default 30 frames, 10x3) via ffmpeg (`scoop install ffmpeg`). Record with `adb shell screenrecord --time-limit 3 /sdcard/rec.mp4` then `adb pull` (in Git Bash set `MSYS_NO_PATHCONV=1` so `/sdcard/...` is not rewritten).

## Local preview

`bash scripts/build-mockup.sh` then `node scripts/mockup-serve.mjs` and open http://localhost:8787/Groov/ (the server mirrors the GitHub Pages sub-path).
