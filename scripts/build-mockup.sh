#!/usr/bin/env bash
# Build the iOS mockup site into mockup-dist/ (gitignored):
#   mockup-dist/            host page (mockup/*)
#   mockup-dist/apps/groov/ web export of the app, built with the right baseUrl
#
# Usage: bash scripts/build-mockup.sh [base-path]   (default "/Groov" for GitHub Pages;
#        pass "" for a root deployment such as a Cloudflare Pages project)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1-/Groov}"
OUT="$ROOT/mockup-dist"
APP_OUT="$OUT/apps/groov"

cd "$ROOT"
# Git Bash on Isaac's machine does not see the winget Node; scripts/node.sh fixes PATH.
[ -f scripts/node.sh ] && source scripts/node.sh

rm -rf "$OUT"
mkdir -p "$APP_OUT"
cp -r mockup/. "$OUT/"

# Export the app with experiments.baseUrl so asset URLs work under a sub-path.
# app.json is edited in place and restored afterwards (CI never commits it).
cp app.json "$OUT/.app.json.bak"
# MSYS_NO_PATHCONV: Git Bash would otherwise rewrite "/Groov" into a Windows path.
MSYS_NO_PATHCONV=1 node -e '
  const fs = require("fs"); const base = process.argv[1];
  const j = JSON.parse(fs.readFileSync("app.json", "utf8"));
  j.expo.experiments = Object.assign({}, j.expo.experiments, { baseUrl: base + "/apps/groov" });
  fs.writeFileSync("app.json", JSON.stringify(j, null, 2) + "\n");
' "$BASE"
trap 'cp "$OUT/.app.json.bak" app.json; rm -f "$OUT/.app.json.bak"' EXIT
# MOCKUP_DEV=1 keeps the bundle unminified (readable stack traces when debugging a crash).
npx expo export --platform web --output-dir "$APP_OUT" ${MOCKUP_DEV:+--dev}
echo "Mockup built in $OUT (base path: '$BASE')"
