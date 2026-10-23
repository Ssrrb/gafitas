# Gafitas's icon

Green sunglasses on blue watercolor: little glasses, for seeing how code fits together.

- `gafitas.png`: the picture, edge to edge. `scripts/make-icon.py` makes the rest from it.
- `../AppIcon.icns`: the picture in the macOS icon grid (an 824 px rounded square on 1024, with its shadow), 16 to
  1024 px, for Finder, the Dock and macOS before 26 (`CFBundleIconFile`).
- `AppIcon.icon`: the picture as the one layer of an Icon Composer document. `build.sh` compiles it into `Assets.car`
  with Xcode's `actool` (`CFBundleIconName`); macOS 26 draws a full-size icon only from that, and without Xcode it
  shows the `.icns` inside a gray square.
- The menubar mark has no file: `StatusIcon` (`Sources/DigUpApp/StatusMenu.swift`) draws the picture's sunglasses in
  code, as an 18 pt template: solid lenses with a glint when ready, lenses filling from the left while code is read,
  hollow lenses with a bar in each (a pause sign) when paused. `-debugIcon <png>` draws its states.
