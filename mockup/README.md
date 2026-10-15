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

Any other query param on the host URL is forwarded to the app (Groov understands `guest=1`, `demo=1`; pass `demo=0` to see onboarding).

Example: `?app=groov&device=iphone16pro&theme=dark&route=progress&chrome=0`

## Adding another app

1. Export the app for web and put it under `mockup-dist/apps/<id>/` at deploy time (see `scripts/build-mockup.sh`). The export must be built with `experiments.baseUrl` set to `/<repo>/apps/<id>` (or wherever it is hosted) so its asset URLs resolve.
2. Add an entry to `mockup/apps.json`: `{ "id", "name", "url", "defaultRoute", "routes", "params" }`. `params` are extra query params appended to the app URL (Groov uses `guest=1` for an anonymous session and `demo=1` for seeded sample data).
3. Optional: implement the **mockup-v1 contract** in the app so theme and route switch live:
   - read `?theme=`, `?route=` and `?insets=top,right,bottom,left` from the page URL on first load (Groov does this in `App.js` / `AppContext`);
   - listen for `window` `message` events `{ type: 'mockup:theme', theme }` and `{ type: 'mockup:navigate', route }`;
   - post `{ type: 'mockup:statusbar', style: 'light' | 'dark' }` to `window.parent` whenever the status-bar text colour should change, and `{ type: 'mockup:ready' }` after first paint.

## Screenshots for agents

`node scripts/mockup-shot.mjs --app groov --route today --theme dark --device iphone16pro --out shot.png`

Uses the locally installed Chrome (or Edge) through `puppeteer-core`, serves `mockup-dist/` on a local port when `--base` is not given, and writes a PNG of the phone screen at 2× device pixel ratio. `--frame 1` keeps the bezel; `--wait 3000` changes the settle time (the demo seed needs ~8 s on first load); `--full 1` screenshots the whole page; `--html out.txt` dumps the visible text of all screens; `--click "text=Label"` taps before the shot; `--debug 1` prints console/page errors.

## Local preview

`bash scripts/build-mockup.sh` then `node scripts/mockup-serve.mjs` and open http://localhost:8787/Groov/ (the server mirrors the GitHub Pages sub-path).
