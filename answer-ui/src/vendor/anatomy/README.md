# anatomy (vendored)

From [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) at commit
`1482e8469b0a9e0d8cc18ea2740a01423d29ae80`, under the MIT license in `LICENSE`.

| File | Upstream | Used for |
|---|---|---|
| `iso-kit.ts` | `kit/iso-kit.ts` | Camera, solids (`slabOf`, `cylinder`, `extrude`), lines on faces, ticks, knurls, `translateAlong` |
| `iso.css` | `kit/iso.css` | The kit's classes (`.iso-solid`, `.iso-line`, tones). Gafitas maps its tokens onto the theme in `src/styles/theme.css` |
| `react/draw.tsx` | `kit/react/draw.tsx` | `Solid`, `Line`, `Dots` |
| `react/live.tsx` | `kit/react/live.tsx` | Imported by `draw.tsx` (`Stage`) |

Local changes: a one-line header comment in each file pointing to `LICENSE`, and `react/live.tsx` drops its
`"use client"` banner (the page is client-only). Nothing else is changed; Gafitas's own additions (prisms along x
and y, convex solids, the frame loop) live in `src/figure/`.
