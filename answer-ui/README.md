# answer-ui

The page that shows a chat in Gafitas. A model writes each answer in [OpenUI Lang](https://openui.com/docs/openui-lang);
this page renders it with React and `@openuidev/react-lang`, inside a `WKWebView`. The model picks the pieces of real
code and says how they fit; the page draws them as a jigsaw: each function, class or module a tile in its project's
colour, each hand-off the edge two tiles share, labelled with what crosses it. Instead of paragraphs, the other blocks
are things to read or pick from: a walk through real lines, two places side by side, what matches across two repos,
ways to choose between, a question with icon tiles, a plan board. A pick is the next question, sent by the page. The
page is in Spanish, and so are the answers (the prompt asks for it).

```sh
../scripts/build-answer-ui.sh   # → ../Resources/answer-ui/{index.html, assets/, system-prompt.txt}
npm run dev                     # dev page: http://localhost:5173/?f=requests-urllib3&theme=dark
npm test                        # vitest: layout, paths, validation, prompt, bridge
```

Dev page parameters: `f` (a fixture in `fixtures/`), `thread=requests` (a saved three-turn chat), `live=1` (stop with
Pi still at work), `theme=dark|light`, `still=1` (no motion: for screenshots), `instant=1` (no simulated streaming),
`chunk=18` (characters per streamed chunk), `repair=1` (after `done()`, send `fixtures/<f>.repair.openui` through
`replace()`), `select=r2`, `busy=1` (Pi answering elsewhere: picks are off). `node scripts/shots.mjs` captures the fixtures in both themes at 1440 and 390;
`node scripts/drive-built.mjs` drives the built page through the bridge, exactly as Swift does, and reports CSP
violations and off-origin requests.

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
| `theme(vars)` | Sets theme tokens on `<html>`. Keys are `ground sheet edge text muted fill active accent lit lit-ink lit-fill negative p1…p4 p1-pale…p4-pale font mono`, with or without the `--g-` prefix, plus `theme: "dark" \| "light"` (sets `data-theme`). Values not given keep their defaults. |
| `reset()` | A new chat: clears every turn, the ref table and the selection. |
| `refs(list)` | Adds or replaces refs by id: `[{ id: "r1", repo, path, first, last, focus, summary, text, tint }]`. `text` is the real source of lines `first…last`; `tint` 0–3 picks the project colour `p1…p4`. One table per chat; call it again to add `d1…` refs. |
| `turn(id, question, via?)` | Starts a turn: the question as its heading (h1 for the first, h2 for follow-ups). What follows streams into it. `via` `{turn, block, choices}` says the question was a pick, so that block shows what was picked. |
| `busy(on)` | Pi is answering: picks and "Sigue con" are off until `busy(false)`. |
| `trail(id, {lines, summary?, thinking?})` | What Pi is doing for that turn: `lines` are `{text, running?, places?}` in Spanish (a `places` line shows the found places as loose pieces); `summary` folds them into one line once the answer is drawn, with "Ver el proceso" to open them and the thinking again. |
| `append(delta)` | Appends streamed OpenUI Lang text to the current turn. Rendering is progressive and at most once per frame. |
| `done()` | The stream ended: validates and posts `errors`. |
| `replace(text)` | The repair turn: corrected statements with the same ids are merged by statement id. It validates once more; whatever is still broken is dropped with what leans on it (a broken piece takes its joints and their steps; the Puzzle stays while it has 2 pieces and a joint), the notice "Parte de esta respuesta no se pudo dibujar. Se muestra el resto." shows, and `errors` is posted with `final: true`. |
| `load(turns)` | Draws a saved chat at once: `[{id, question, program, trail, via}]`, every turn final, no entrance, nothing posted. |
| `select(ref \| null)` | Lights the piece citing that ref (`"r3"` or `"r3:18"`) and marks its chips. `null` clears it. |

Order for a live turn: `reset()` (new chat), `theme()` (any time), `refs()`, `turn()`, `trail()`…, `append()`…, `done()`,
then possibly `replace()`. A follow-up is another `turn()` in the same chat.

### JS → Swift: `window.webkit.messageHandlers.gafitas.postMessage(msg)`

Standalone (no handler) the page logs instead, and keeps a copy in `window.__gafitasPosted`.

| Message | When |
|---|---|
| `{type: "ready"}` | Once, after the first render. |
| `{type: "open", ref: "r2", line: 44}` | A piece, chip, found place or snippet line was clicked. `line` is the citation's line, else the ref's `focus`, else its first line. |
| `{type: "hover", ref: "r2" \| null}` | Pointer or focus on something that cites a ref; `null` when it leaves. Repeats are dropped. |
| `{type: "adapt", ref: "r2" \| null, path: "src/x.py"}` | The "Adaptar…" button of a `NewPiece`. |
| `{type: "pick", turn: "t1", message, context: {kind, block, choices, note?}}` | The reader picked: a Way, Pick options, a Board item, a Match, a "Sigue con" question, a puzzle piece's "Ver por dentro" or a Check's "Explícamelo". `message` is the Spanish question to ask next; `context.note` tells Pi what was picked from which block. Swift asks it as the next turn and passes `{turn, block, choices}` back as `via`. |
| `{type: "draft", message}` | "Escribir otra cosa…" or "Preguntar por estas líneas…": put `message` in the composer and focus it. |
| `{type: "errors", turn: "t2", errors: [{id, message}], final?: true, program}` | After `done()` (an empty list when clean), again if `refs()` changes the result, and after `replace()` with `final: true`. `id` is the statement to fix (`p3`, `j1`), `root`, or `line 9` for a line that isn't a statement. Messages are English: only the model reads them. |

## The language

Root is `Answer`. Positional arguments, in this order (`?` optional):

```
Answer(lede, blocks: (Ways | Pick | Board | Puzzle | Matches | Walkthrough | SideBySide | Snippet | Callout | Check | Text | Next)[])
Puzzle(title, pieces: (Piece | NewPiece | Idea)[], joints: Joint[], steps: Step[], caption?)
Piece(name, ref, kind?)                       // code that exists
NewPiece(name, project, path, from?, note?)   // code still to write: a dashed tile in the gap
Idea(name, note?)                             // a concept, when there are no refs
Joint(from, to, label)                        // by piece id; label: what crosses
Step(lit, text)                               // lit: a piece or joint id
Ways(question, ways: Way[])                   // 2–3 fair ways to do it
Way(title, icon, what, effort, tradeoff, uses?: ref[])
Pick(question, options: Option[], multiple?)  // 3–6 icon tiles, when the question is too open to answer yet
Option(label, icon, note?)
Board(title, items: Item[])                   // 3–9 items in tienes / falta / decidir
Item(column, title, icon, ref?, note?)        // an item under "tienes" needs its ref
Walkthrough(title, stops: Lines[])            // 2–6 stops through real lines, at most 2 files
Lines(ref, text)
SideBySide(title, left: Side, right: Side, note?)   Side(title, ref, points?)
Matches(title, pairs: Match[])                // 2–8 pairs, a's in one repo and b's in another
Match(a: ref, b: ref | "", sure: "segura" | "probable" | "dudosa", note?)
Snippet(ref, note?)   Callout(kind: "note" | "watch", text)   Check(question, options[3], answer: 1–3, why)
Text(md)   Next(questions[2–3])
```

`icon` is one of the short names in `src/icons.tsx` (lucide glyphs; anything else draws a small circle). The model never
writes buttons or actions: every control is the page's. `Compare(left, right)` still parses, so older chats reopen, and
draws as a SideBySide; it is left out of the prompt.

A ref is `"r3"`, `"r3:18"` or `"r3:41-52"`, always inside the ref's lines. `src/prompt.ts` builds the system prompt from
the library (`library.prompt`) with the rules and four examples (a puzzle with a walkthrough, a concept, ways,
matches across requests and urllib3, all on real refs); the build writes it to `system-prompt.txt`.

Validation (`src/validate.ts`, with the Puzzle's own rules in `src/puzzle/model.ts`) reports, each with its statement
id: the parser's errors, lines that aren't statements or are cut off, names never defined, unknown or out-of-range
refs, 2–6 pieces in at most 3 projects with at most 2 NewPieces, a Piece without a ref, two pieces on the same lines, a
NewPiece in a project that isn't in the refs, joints that don't join two of the puzzle's pieces (or join one to
itself, or twice), a piece in no joint, more than one joint between pieces that aren't neighbours in the list, steps
that don't light a piece or joint by id, long names and labels, the counts and refs of the blocks above, and the block
limits: each big block once, at most 2 of them, one of Ways, Pick and Board, 2 Snippets, 2 Texts. Some messages are
soft (a missing effort, an unknown `sure`): they go to the repair turn but are never dropped. The page also orders the
blocks (choices first, Next last) and keeps the first choice block if the model wrote two.

## The puzzle

- `src/puzzle/layout.ts` (pure): one tile per row, in the order the model listed them. Each project is a band, offset
  right of the one before; neighbouring bands overlap by 72 px. A joint between neighbouring rows is the edge they
  share, its knob in the overlap (tab on the giver, blank on the receiver); any other joint is "loose" and listed under
  the drawing. Below a minimum width it falls back to one column. `test/layout.test.ts` checks every way of giving
  2–6 pieces to up to 3 projects at five widths: shared edges, the knob inside the overlap, nothing overlapping.
- `src/puzzle/path.ts`: tile outlines; each knob is one curve that the giver and the receiver trace in opposite
  directions, so they fit exactly.
- `src/components/Puzzle.tsx`: the card (title, legend, the stage, hint, readout), the steps and the loose joints.
  Lit is lime, the one colour of attention; tiles take their project's pale tint.
- `src/components/Choices.tsx` Ways, Pick, Board and Next; `src/components/Learn.tsx` Walkthrough, SideBySide and
  Matches (confidence drawn as the line: solid, dashed, dotted); `src/styles/choices.css` their styles, which follow
  the answer column's width (container queries).
- `src/components/Trail.tsx` the trail; `src/components/Others.tsx` "Otros lugares encontrados"; `src/strings.ts` every
  fixed Spanish string.

Packages are installed with `--ignore-scripts` and the build sets `OPENUI_TELEMETRY_DISABLED=1`:
`@openuidev/lang-core` has an opt-out telemetry postinstall and opt-in Node telemetry (inert in a page, and blocked by
the CSP). The dev-only devtools widget, which loads from a CDN, is aliased to a stub, and Zod runs `jitless` so it
never probes for `eval`.
