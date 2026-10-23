#!/bin/bash
# Builds Gafitas and opens it (your real settings and index). For a scratch copy against the testbed: scripts/dev-run.sh
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
for pid in $(pgrep -x Gafitas); do
  [[ "$(ps -o comm= -p "$pid")" == "$PWD/build.noindex/Gafitas.app/Contents/MacOS/Gafitas" ]] && kill "$pid" && sleep 0.5
done
open build.noindex/Gafitas.app
