// Which real lines to show, so the model only has to cite: the cited lines and one line of context, the rest folded
// into "⋯ N líneas"; a puzzle tile gets the 2–3 lines where its piece hands work to the next one. Pure, so tests and
// the page agree on every row.
import { linesOf, type RefEntry } from "./refs";

export type CodeRow =
  | { kind: "line"; n: number; text: string; lit: boolean; comment: boolean }
  | { kind: "gap"; from: number; to: number };

/** A lit range over this many lines shows its first LONG_HEAD lines, a gap, and its last LONG_TAIL. */
export const LONG = 8;
const LONG_HEAD = 5;
const LONG_TAIL = 2;
/** Fewer hidden lines than this are shown rather than folded. */
const MIN_GAP = 3;
export const TILE_ROWS = 3;

const DEF = /^\s*(?:(?:export|default|public|private|protected|internal|fileprivate|open|static|final|override|abstract|async|pub(?:\([^)]*\))?)\s+)*(?:def|class|func|fn|function|struct|impl|interface|protocol|enum|extension)\b/;
const COMMENT = /^\s*(#|\/\/|\/\*|\*)/;
const TRIVIAL = /^[\s)\]}>,;:]*$|^\s*("""|''')\s*$/;

export const indentOf = (text: string) => /^\s*/.exec(text)![0].length;
export const isDef = (text: string) => DEF.test(text);

/** Brackets opened minus closed, strings and trailing comments left out. */
function depthChange(text: string) {
  const bare = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""').replace(/\s(#|\/\/).*$/, "");
  let depth = 0;
  for (const c of bare) {
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
  }
  return depth;
}

type Line = { n: number; text: string };

/** Lines inside a docstring or a comment: what reads as prose, not code. A docstring that opened before the ref
 * started is caught by its closing quotes coming first. */
function noiseOf(lines: Line[]) {
  const noise = new Set<number>();
  let open = -1;
  let lastCode = "";
  lines.forEach((line, i) => {
    const quotes = (line.text.match(/"""|'''/g) ?? []).length;
    if (open >= 0) {
      noise.add(line.n);
      if (quotes % 2 === 1) open = -1;
      return;
    }
    if (quotes) {
      const starts = /^\s*[rbuRBU]?("""|''')/.test(line.text);
      if (starts && (lastCode === "" || lastCode.trimEnd().endsWith(":"))) {
        noise.add(line.n);
        if (quotes % 2 === 1) open = i;
        return;
      }
      if (quotes % 2 === 1 && /^[^=(]*("""|''')\s*$/.test(line.text)) {
        // Closing quotes with no opening: the ref began inside a docstring.
        for (let j = 0; j <= i; j++) noise.add(lines[j]!.n);
        lastCode = "";
        return;
      }
    }
    if (COMMENT.test(line.text)) noise.add(line.n);
    else if (line.text.trim()) lastCode = line.text;
  });
  return noise;
}

/** The last line of the statement that starts at `n`: brackets followed across lines. */
export function statementEnd(lines: Line[], n: number) {
  let i = lines.findIndex((line) => line.n === n);
  if (i < 0) return n;
  let depth = 0;
  for (; i < lines.length; i++) {
    depth += depthChange(lines[i]!.text);
    if (depth <= 0 && !lines[i]!.text.trimEnd().endsWith("\\")) return lines[i]!.n;
  }
  return lines[lines.length - 1]!.n;
}

/** What a citation lights: its range, or for a whole ref, the statement at its focus line. */
export function litOf(entry: RefEntry, from: number, to: number, line: number) {
  if (from !== entry.first || to !== entry.last) return [from, to] as const;
  return [line, statementEnd(linesOf(entry), line)] as const;
}

/**
 * The rows to draw: `show` and the lit lines, hidden runs of 1–2 lines shown anyway, longer ones folded into one gap
 * row, docstring and comment runs folded too, and the shared indent taken off.
 */
export function rowsOf(entry: RefEntry, show: Set<number>, lit: (n: number) => boolean): CodeRow[] {
  const lines = linesOf(entry);
  const noise = noiseOf(lines);
  // A run of 3+ docstring or comment lines folds, even inside what was asked for.
  const runs = new Set<number>();
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && noise.has(lines[j]!.n)) j++;
    if (j - i >= MIN_GAP) for (let k = i; k < j; k++) runs.add(lines[k]!.n);
    i = Math.max(j, i + 1);
  }
  const visible = lines.filter((line) => show.has(line.n) && !runs.has(line.n)).map((line) => line.n);
  if (!visible.length) return [];
  const first = visible[0]!;
  const last = visible[visible.length - 1]!;
  const shown = new Set(visible);
  for (let k = 1; k < visible.length; k++) {
    const hidden = visible[k]! - visible[k - 1]! - 1;
    if (hidden > 0 && hidden < MIN_GAP) for (let n = visible[k - 1]! + 1; n < visible[k]!; n++) shown.add(n);
  }
  const kept = lines.filter((line) => line.n >= first && line.n <= last);
  const cut = Math.min(...kept.filter((line) => shown.has(line.n) && line.text.trim()).map((line) => indentOf(line.text)));
  const rows: CodeRow[] = [];
  for (const line of kept) {
    if (shown.has(line.n)) {
      rows.push({ kind: "line", n: line.n, text: line.text.slice(Number.isFinite(cut) ? cut : 0), lit: lit(line.n), comment: noise.has(line.n) });
      continue;
    }
    const prev = rows[rows.length - 1];
    if (prev?.kind === "gap") prev.to = line.n;
    else rows.push({ kind: "gap", from: line.n, to: line.n });
  }
  return rows;
}

/** The lit range, cut to its head and tail when it runs long. */
export function litLines(from: number, to: number) {
  const lines = new Set<number>();
  if (to - from + 1 > LONG) {
    for (let n = from; n < from + LONG_HEAD; n++) lines.add(n);
    for (let n = to - LONG_TAIL + 1; n <= to; n++) lines.add(n);
  } else for (let n = from; n <= to; n++) lines.add(n);
  return lines;
}

const meaningful = (line: Line, noise: Set<number>) => !noise.has(line.n) && !TRIVIAL.test(line.text);

/** The `def` (or class, func…) the lines at `n` sit in, when the ref holds it. */
export function enclosingDef(lines: Line[], n: number) {
  const at = lines.find((line) => line.n === n);
  if (!at) return null;
  const indent = indentOf(at.text);
  for (let i = lines.findIndex((line) => line.n === n) - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line.text.trim() && isDef(line.text) && indentOf(line.text) < indent) return line.n;
  }
  return null;
}

/** A Snippet or a Side: the lit lines, one meaningful line of context each side, and the def they sit in on top. */
export function codeRows(entry: RefEntry, from: number, to: number, line: number, context = 1, anchor = true): CodeRow[] {
  const lines = linesOf(entry);
  const noise = noiseOf(lines);
  const [a, b] = litOf(entry, from, to, line);
  const show = litLines(a, b);
  const indent = Math.min(...lines.filter((l) => l.n >= a && l.n <= b && l.text.trim()).map((l) => indentOf(l.text)));
  // Context is a line of the same block or the one around it, never the inside of a neighbouring statement.
  const around = (start: number, step: 1 | -1) => {
    let found = 0;
    const from = lines.findIndex((l) => l.n === start);
    for (let i = from + step, seen = 0; i >= 0 && i < lines.length && found < context && seen < 6; i += step, seen++) {
      const l = lines[i]!;
      if (!meaningful(l, noise) || indentOf(l.text) > indent) continue;
      show.add(l.n);
      found += 1;
    }
  };
  around(a, -1);
  around(b, 1);
  const def = anchor ? enclosingDef(lines, a) : null;
  if (def !== null) show.add(def);
  return rowsOf(entry, show, (n) => n >= a && n <= b);
}

/** Where code refuses: a throw, a raise, an error handed back. */
const REJECTS = /\b(throw|raise|panic!?|abort|reject)\b|createErrorToolResult|return\s+\.inr|\bErr\(/;

/** A Proof's rejecting lines: the cited range with no context, lit only where it refuses (or all of it, when no line
 * does). */
export function rejectRows(entry: RefEntry, from: number, to: number): CodeRow[] {
  const rows = codeRows(entry, from, to, from, 0, false);
  const refusing = rows.some((row) => row.kind === "line" && row.lit && REJECTS.test(row.text));
  return refusing ? rows.map((row) => (row.kind === "line" ? { ...row, lit: row.lit && REJECTS.test(row.text) } : row)) : rows;
}

export interface TileRow {
  text: string;
  /** The hand-off line (or the def of the last piece): full ink; the rest are muted. */
  main: boolean;
  /** "⋯": lines left out between two rows. */
  gap?: boolean;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const shortName = (name: string) => name.split(".").pop()!.replace(/\(.*$/, "").trim();
const CALLED = /([A-Za-z_$][\w$]*)\s*\(/g;

/**
 * A puzzle tile's lines. The hand-off line is the one in the piece's ref that calls the next piece (by its short
 * name): in the cited lines first, then the whole ref, nearest the focus. Failing that, a name the joint's label
 * calls. With no hand-off (the last piece, or one whose ref doesn't show the call), the piece's own def, found by
 * its name, else the def the cited line sits in, else the cited line. Up to 3 rows of that statement, or the line
 * that makes the object it calls, then the call.
 */
export function tileRows(
  entry: RefEntry,
  ref: { from: number; to: number; line: number },
  next?: { name: string; label: string },
  own = "",
): { rows: TileRow[]; call: string } {
  const lines = linesOf(entry);
  const near = (list: Line[]) => [...list].sort((x, y) => Math.abs(x.n - ref.line) - Math.abs(y.n - ref.line))[0];
  const calling = (name: string) => {
    if (!name) return undefined;
    const pattern = new RegExp(`(?<![\\w$])${escape(name)}\\s*\\(`);
    const hits = lines.filter((line) => pattern.test(line.text) && !isDef(line.text));
    return near(hits.filter((line) => line.n >= ref.from && line.n <= ref.to)) ?? near(hits);
  };
  let call = "";
  let h: Line | undefined;
  if (next) {
    call = shortName(next.name);
    h = calling(call);
    if (!h) {
      for (const match of next.label.matchAll(CALLED)) {
        h = calling(match[1]!);
        if (h) {
          call = match[1]!;
          break;
        }
      }
    }
    if (!h) call = "";
  }
  if (!h) {
    const name = own ? shortName(own) : "";
    const defines = name ? new RegExp(`\\b${escape(name)}\\b`) : null;
    const mine = defines ? near(lines.filter((line) => isDef(line.text) && defines.test(line.text))) : undefined;
    const def = mine?.n ?? (isDef(lines.find((line) => line.n === ref.line)?.text ?? "") ? ref.line : enclosingDef(lines, ref.line));
    h = lines.find((line) => line.n === (def ?? ref.line));
  }
  h ??= lines.find((line) => line.n === ref.line) ?? lines[0];
  if (!h) return { rows: [], call: "" };
  const end = statementEnd(lines, h.n);
  const statement = lines.filter((line) => line.n >= h!.n && line.n <= end && line.text.trim() && !/^\s*(self|cls|this)\s*,?\s*$/.test(line.text));
  let picked: { line: Line; main: boolean; gap?: boolean }[];
  if (statement.length > 1) {
    picked = statement.slice(0, TILE_ROWS).map((line, i) => ({ line, main: i === 0 }));
    if (statement.length > TILE_ROWS) picked[TILE_ROWS - 1]!.line = { ...picked[TILE_ROWS - 1]!.line, text: `${picked[TILE_ROWS - 1]!.line.text.trimEnd()} ⋯` };
  } else {
    picked = [{ line: h, main: true }];
    // One line: show where the object it calls comes from, when the ref has it.
    const object = call ? new RegExp(`([A-Za-z_$][\\w$]*)\\s*\\.\\s*${escape(call)}\\s*\\(`).exec(h.text)?.[1] : undefined;
    if (object && !/^(self|cls|this)$/.test(object)) {
      const made = new RegExp(`^\\s*${escape(object)}\\s*(:[^=]+)?=(?!=)`);
      const source = [...lines].reverse().find((line) => line.n < h!.n && made.test(line.text));
      if (source) {
        const gap = h.n - source.n > 1;
        picked = [{ line: source, main: false }, ...(gap ? [{ line: { n: 0, text: "⋯" }, main: false, gap: true }] : []), { line: h, main: true }];
      }
    }
  }
  const real = picked.filter((p) => !p.gap && p.line.text.trim());
  const cut = Math.min(...real.map((p) => indentOf(p.line.text)));
  return {
    rows: picked.map((p) => ({ text: p.gap ? "⋯" : p.line.text.slice(Number.isFinite(cut) ? cut : 0), main: p.main, ...(p.gap ? { gap: true } : {}) })),
    call,
  };
}
