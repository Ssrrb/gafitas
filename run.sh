#!/bin/bash
# Builds Gafitas and opens it (your real settings and index). For a scratch copy against the testbed: scripts/dev-run.sh
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
# Any Gafitas on the real settings (an earlier run, or the installed one) is stopped: a second copy quits at launch.
# Scratch copies from scripts/dev-run.sh (-defaultsSuite) keep running.
for pid in $(pgrep -x Gafitas); do
  [[ "$(ps -o args= -p "$pid")" == *-defaultsSuite* ]] || { kill "$pid" && sleep 0.5; }
done
open build.noindex/Gafitas.app
