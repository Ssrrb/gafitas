# answer-ui

The page that shows an answer in Gafitas. A model writes the answer in [OpenUI Lang](https://openui.com/docs/openui-lang);
this page renders it with React and `@openuidev/react-lang`, inside a `WKWebView`. The model does the thinking (which
machine, which parts, which steps); the page ships the drawings: two parameterized isometric machines built with the
[anatomy](src/vendor/anatomy/README.md) kit, so a small model gets a crafted, animated figure.

```sh
../scripts/build-answer-ui.sh   # → ../Resources/answer-ui/{index.html, assets/, system-prompt.txt}
npm run dev                     # dev page: http://localhost:5173/?f=hermes-coupling&theme=dark
npm test                        # vitest: prompt examples, validation, geometry, bridge
```

Dev page parameters: `f` (a fixture in `fixtures/`), `theme=dark|light`, `still=1` (no motion, no tour: for
screenshots), `instant=1` (no simulated streaming), `chunk=18` (characters per streamed chunk), `repair=1` (after
`done()`, send `fixtures/<f>.repair.openui` through `replace()`), `select=r2`. `node scripts/shots.mjs` captures every
fixture in both themes at 1440 and 390; `node scripts/drive-built.mjs` drives the built page through the bridge,
exactly as Swift does, and reports CSP violations and off-origin requests.

## Serving

Swift serves `Resources/answer-ui/` from its `gafitas://` scheme handler at `gafitas://app/index.html`. Asset paths are
relative (`./assets/…`), the script is an ES module, so `.js` must be served as `text/javascript` and `.css` as
`text/css`. `index.html` carries its own CSP:
`default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`. The page makes no
network requests and draws no background (the native sheet shows through).

## Bridge

### Swift → JS: `window.gafitas`

| Call | What it does |
|---|---|
| `theme(vars)` | Sets theme tokens on `<html>`. Keys are `ground sheet text muted faint fill accent amber moss p1 p2 p3 p4 font mono`, with or without the `--g-` prefix, plus `theme: "dark" \| "light"` (sets `data-theme`). Call any time; values not given keep their defaults. |
| `reset()` | A new answer: clears the program, the ref table, the selection and every figure's state. |
| `refs(list)` | Adds or replaces refs by id: `[{ id: "r1", repo, path, first, last, focus, summary, text, tint }]`. `text` is the real source of lines `first…last`; `tint` 0–3 picks the project colour `p1…p4`. Call it after `reset()` and before the answer streams; call it again later to add `d1…` refs. |
| `append(delta)` | Appends streamed OpenUI Lang text. Rendering is progressive and at most once per frame. |
| `done()` | The stream ended: validates and posts `errors`. |
| `replace(text)` | The repair turn: corrected statements with the same ids are merged into the program by statement id. It validates once more; whatever is still broken is dropped (a broken statement takes down the top-level block that reaches it, so step numbers never shift), the quiet notice "Part of this answer couldn't be drawn. Showing the rest." shows, and `errors` is posted with `final: true`. Don't repair again after a final report. |
| `select(ref \| null)` | The native card selection (`"r3"`, or `"r3:18"`): lights the figure part citing that ref, marks its legend row and chips, and pauses the tour. `null` clears it. |

Order: `reset()`, `theme()` (any time), `refs()`, `append()`…, `done()`, then possibly `replace()`.

### JS → Swift: `window.webkit.messageHandlers.gafitas.postMessage(msg)`

Standalone (no handler) the page logs instead, and keeps a copy in `window.__gafitasPosted`.

| Message | When |
|---|---|
| `{type: "ready"}` | Once, after the first render. |
| `{type: "open", ref: "r2", line: 44}` | A part, chip or snippet line was clicked (or Enter/Space on a part). `line` is the `:line` of the citation, else the ref's `focus`, else its first line; a snippet line sends its own number. |
| `{type: "hover", ref: "r2" \| null}` | Pointer or focus on a part, legend row or chip that cites a ref; `null` when it leaves. Repeats are dropped. |
| `{type: "adapt", ref: "r2", path: "app/x.py"}` | The "Adapt…" button of a `NewItem`. |
| `{type: "errors", errors: [{id, message}], final?: true}` | After `done()` (an empty list when clean), again if `refs()` changes the result, and after `replace()` with `final: true`. `id` is the statement to fix (`p3`, `m1`), `root`, or `line 9` for a line that isn't a statement. |

## The language

Root is `Answer`. Positional arguments, in this order (`?` optional):

```
Answer(lede, blocks: (Fig | Snippet | CodeRef | Callout | Compare | NewCode | Check | Text)[])
Fig(title, machine: Coupling | Conveyor, caption)
Coupling(parts: Part[], steps: Step[], readout?)
Conveyor(parts: Part[], steps: Step[], readout?)
Part(label, role, ref, note?, status?: "exists" | "new" | "concept")
Step(lit, text, value?, fails?)
CodeRef(ref, label?)
Snippet(ref, note?)
Callout(kind: "note" | "watch", text)
Compare(left: Side, right: Side)
Side(title, ref, points[])
NewCode(items: NewItem[])
NewItem(path, what, adapts)
Check(question, options[3], answer: 1–3, why)
Text(md)
```

`role` is an enum: Coupling takes `a_part` (≤3), `a_port` (required), `key` (≤1), `adapter` (required), `b_port`
(required), `b_part` (≤3); Conveyor takes `intake` (≤1), `station` (1–6), `reject` (≤1), `output` (≤1). A ref is
`"r3"`, `"r3:18"` or `"r3:41-52"`, always inside the ref's lines. `src/prompt.ts` builds the system prompt from the
library (`library.prompt`) with the rules and two examples; the build writes it to `system-prompt.txt`.

Validation (`src/validate.ts`) reports, each with its statement id: the parser's own errors, lines that aren't
statements or are cut off, names used but never defined, unknown or out-of-range refs, an "exists" part without a
ref, a role with no slot or a slot over its maximum, a required slot missing, a step lighting a part that doesn't
exist, wrong child types, more than 2 Figs, 2 Snippets or 3 Texts, and a Check without 3 options or a valid answer.

## Inside

- `src/library.tsx` the components and schemas; `src/prompt.ts` the model-facing prompt.
- `src/components/Fig.tsx` the figure card: Fig n, title, hint, live readout, caption, steps, legend; owns the lit
  step, keyboard, idle tour (after 1.4 s; pauses on hover or focus; resumes 3.6 s after the last interaction; stops
  offscreen; off under reduced motion).
- `src/machines/Coupling.tsx`, `src/machines/Conveyor.tsx` geometry (memoized per slot count), art and motion;
  `src/machines/bench.tsx` the shared base; `src/machines/slots.ts` the slot rules.
- `src/figure/` solids along x and y and convex solids for the kit, slot groups, live solids, the frame loop.
- `src/bridge.ts`, `src/post.ts`, `src/store.ts` the bridge and state; `src/refs.ts` the ref table.
- `src/styles/theme.css` tokens for both themes, mapped onto the kit (the lit part is amber, the one colour).

Packages are installed with `--ignore-scripts` and the build sets `OPENUI_TELEMETRY_DISABLED=1`:
`@openuidev/lang-core` has an opt-out telemetry postinstall and opt-in Node telemetry (inert in a page, and blocked by
the CSP). The dev-only devtools widget, which loads from a CDN, is aliased to a stub, and Zod runs `jitless` so it
never probes for `eval`.
