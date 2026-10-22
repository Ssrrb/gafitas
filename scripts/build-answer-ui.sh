#!/bin/bash
# Builds the answer page (answer-ui/: Vite + React + OpenUI Lang) into Resources/answer-ui/: index.html with relative
# asset paths, its assets, and system-prompt.txt, the model-facing prompt generated from the same component library.
# Needs Node 20+ and npm. Installs answer-ui's packages first when they are missing or older than the lockfile, with
# install scripts off (one dependency runs an opt-out telemetry postinstall) and telemetry disabled for the build.
set -euo pipefail
cd "$(dirname "$0")/../answer-ui"
export OPENUI_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
npx vite build --logLevel warn
npx vite-node scripts/write-prompt.ts
OUT=../Resources/answer-ui
# The page is served from gafitas://app/ under a strict CSP: relative paths only, no inline scripts.
if grep -Eq '(src|href)="/' "$OUT/index.html"; then echo "error: absolute asset path in $OUT/index.html" >&2; exit 1; fi
if grep -Eq '<script(>| [^>]*>[^<])' "$OUT/index.html" || grep -E '<script' "$OUT/index.html" | grep -vq 'src='; then
  echo "error: inline script in $OUT/index.html" >&2
  exit 1
fi
echo "answer-ui → $OUT: $(find "$OUT" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)"
