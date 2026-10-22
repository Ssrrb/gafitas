// The ref table: the only way an answer can point at code. Swift sends it before the answer streams;
// the program cites "r3", "r3:18" (one line) or "r3:41-52" (a range inside the ref). Anything else is rejected.

export interface RefEntry {
  id: string;
  repo: string;
  path: string;
  first: number;
  last: number;
  focus?: number;
  summary?: string;
  text: string;
  tint?: number;
}

export type RefTable = ReadonlyMap<string, RefEntry>;

export interface ResolvedRef {
  entry: RefEntry;
  /** First and last line shown or cited, inside entry.first..entry.last. */
  from: number;
  to: number;
  /** The line to open and to mark: the ":line" part, else the ref's focus when it is inside the range, else `from`. */
  line: number;
  /** True when the citation names one line ("r3:18"). */
  single: boolean;
}

const PATTERN = /^\s*([A-Za-z]+\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/;

export function refIdOf(text: string | undefined | null): string | null {
  const match = PATTERN.exec(text ?? "");
  return match ? match[1]!.toLowerCase() : null;
}

export type RefResult = { ok: true; ref: ResolvedRef } | { ok: false; reason: string };

export function resolveRef(text: string | undefined | null, table: RefTable): RefResult {
  const raw = (text ?? "").trim();
  if (!raw) return { ok: false, reason: "is empty" };
  const match = PATTERN.exec(raw);
  if (!match) return { ok: false, reason: `"${raw}" is not a ref (write r3, r3:18 or r3:41-52)` };
  const id = match[1]!.toLowerCase();
  const entry = table.get(id);
  if (!entry) return { ok: false, reason: `"${id}" is not in the ref list` };
  const a = match[2] ? Number(match[2]) : null;
  const b = match[3] ? Number(match[3]) : null;
  if (a === null) {
    const focus = entry.focus !== undefined && entry.focus >= entry.first && entry.focus <= entry.last ? entry.focus : entry.first;
    return { ok: true, ref: { entry, from: entry.first, to: entry.last, line: focus, single: false } };
  }
  const from = a;
  const to = b ?? a;
  if (to < from) return { ok: false, reason: `"${raw}" runs backwards` };
  if (from < entry.first || to > entry.last) return { ok: false, reason: `"${raw}" is outside ${id} (lines ${entry.first}–${entry.last})` };
  const inside = entry.focus !== undefined && entry.focus >= from && entry.focus <= to;
  return { ok: true, ref: { entry, from, to, line: b === null ? from : inside ? entry.focus! : from, single: b === null } };
}

/** The real source lines of a ref, numbered. */
export function linesOf(entry: RefEntry): { n: number; text: string }[] {
  const lines = entry.text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  return lines.map((text, index) => ({ n: entry.first + index, text }));
}

export const rangeText = (from: number, to: number) => (from === to ? `L${from}` : `L${from}–${to}`);

export function normalizeRef(input: unknown): RefEntry | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id.trim().toLowerCase() : "";
  if (!id) return null;
  const first = Number(value.first);
  const last = Number(value.last);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const focus = value.focus === undefined || value.focus === null ? undefined : Number(value.focus);
  return {
    id,
    repo: String(value.repo ?? ""),
    path: String(value.path ?? ""),
    first,
    last: Math.max(first, last),
    focus: Number.isFinite(focus) ? focus : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    text: typeof value.text === "string" ? value.text : "",
    tint: Number.isFinite(Number(value.tint)) ? Number(value.tint) : 0,
  };
}
