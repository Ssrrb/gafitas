#!/bin/bash
# Builds build.noindex/Gafitas.app, signed with the hardened runtime (as releases are, so dev builds behave the same).
#   ./build.sh                       signed with the identity named in .sign-id (one line, gitignored), so macOS keeps
#                                    folder permissions across rebuilds; ad-hoc without it (macOS then asks again
#                                    after each build)
#   SIGN_ID="<identity>" ./build.sh  this identity instead
#   RELEASE=1 SIGN_ID="Developer ID Application: …" ./build.sh   plus the secure timestamp notarization needs
#                                    (scripts/release.sh does that, then notarizes and makes the DMG)
# There's no install step: run it from build.noindex (see scripts/dev-run.sh).
# For a copy with settings of its own, these replace Info.plist values: BUNDLE_ID, VERSION, BUILD_NUMBER.
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Gafitas"
# ".noindex" keeps Spotlight (and the Apps list) from showing this staging copy.
APP="build.noindex/$APP_NAME.app"

# Use full Xcode's toolchain when it's installed, even if xcode-select points at the Command Line Tools.
if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

# llama.cpp, the embedding runtime, linked into the helper (only rebuilt when its tag or patch changes).
scripts/build-llama.sh

# Both executables: the app, and the `digup` CLI, which the app runs as its indexing helper and query encoder.
swift build -c release --product DigUpApp
swift build -c release --product digup
BIN_DIR="$(swift build -c release --show-bin-path)"

# The app icon (green sunglasses on blue watercolor; Resources/AppIcon/README.md): macOS 26 draws the layered AppIcon.icon (compiled into
# Assets.car), older macOS the .icns. Without the former, macOS 26 shows the icon shrunk inside a gray square.
ICON="Resources/AppIcon.icns"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Helpers" "$APP/Contents/Resources"
# The binary is DigUpApp in SwiftPM (it can't share a name with the `digup` CLI on a case-insensitive disk).
cp "$BIN_DIR/DigUpApp" "$APP/Contents/MacOS/$APP_NAME"
# The indexing helper lives in Helpers/: next to Gafitas in MacOS/ it would collide on a case-insensitive disk.
cp "$BIN_DIR/digup" "$APP/Contents/Helpers/digup"
cp Resources/Info.plist "$APP/Contents/Info.plist"
# actool comes with Xcode only: with just the Command Line Tools the .icns alone is the icon.
if xcrun --find actool > /dev/null 2>&1; then
  xcrun actool --compile "$APP/Contents/Resources" --platform macosx --target-device mac --minimum-deployment-target 14.0 \
    --app-icon AppIcon --output-partial-info-plist "$(mktemp -d)/AppIcon.plist" --enable-on-demand-resources NO \
    --development-region es "$PWD/Resources/AppIcon/AppIcon.icon" > /dev/null
fi
cp "$ICON" "$APP/Contents/Resources/AppIcon.icns"   # over actool's plainer fallback: ours has simplified 16 and 32 px
cp Resources/Acknowledgements.txt "$APP/Contents/Resources/Acknowledgements.txt"
# The Ask window's answer page (answer-ui/, built into Resources/answer-ui) and Pi's extension and instructions.
scripts/build-answer-ui.sh
cp -R Resources/answer-ui Resources/pi "$APP/Contents/Resources/"

PLIST="$APP/Contents/Info.plist"
[[ -n "${BUNDLE_ID:-}" ]] && /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$PLIST"
[[ -n "${VERSION:-}" ]] && /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST"
[[ -n "${BUILD_NUMBER:-}" ]] && /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$PLIST"

# Nested code first, then the bundle. Neither needs entitlements: llama.cpp compiles its Metal shaders at run time
# through Metal's own compiler service, which the hardened runtime allows (checked 2026-10-08).
IDENTITY="${SIGN_ID:-$( [[ -f .sign-id ]] && head -1 .sign-id || echo - )}"
TIMESTAMP=$([[ "${RELEASE:-}" == 1 ]] && echo --timestamp || echo --timestamp=none)
codesign --force --sign "$IDENTITY" --options runtime $TIMESTAMP "$APP/Contents/Helpers/digup"
codesign --force --sign "$IDENTITY" --options runtime $TIMESTAMP "$APP"
echo "Signed $([[ "$IDENTITY" == - ]] && echo ad-hoc || echo "with \"$IDENTITY\"") (hardened runtime)"
echo "Built $APP"
