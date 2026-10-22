// Where each piece goes. One tile per row, in the order the model listed them (the order the work flows);
// each project is a band, offset to the right of the one before, and neighbouring bands overlap by OV: a
// joint between two neighbouring rows becomes the edge they share, its knob inside the overlap. A joint that
// can't be an edge (rows apart, or bands that don't overlap) is "loose" and listed under the drawing.
import type { Knob, Rect } from "./path";

// SOCKET is a tile's top padding: room for the tab of the tile above (KNOB_DEPTH) before the words start. H0 holds one
// row of code; each further row (up to 3) adds ROW.
export const K = { H0: 104, ROW: 16, SOCKET: 34, LINE: 18, UP: 30, PAD: 14, GAP: 12, OV: 72, LABEL_H: 40, LANE_MIN: 120, W_MIN: 184, W_MAX: 360, W_TILE: 320, CHAR: 7.8, INSET: 48 } as const;
/** The card's inner width when there is no DOM to measure (tests, first render). */
export const DEFAULT_WIDTH = 738;

export interface LayoutPiece {
  /** The project; "" for an Idea, which takes the band of the piece before it. */
  band: string;
  name: string;
  /** Rows of code the tile shows (1–3); every tile in a puzzle takes the most any needs. */
  rows?: number;
}

export interface LayoutJoint {
  from: number;
  to: number;
}

export interface LabelBox extends Rect {
  align: "left" | "right";
}

export interface Seam {
  joint: number;
  upper: number;
  lower: number;
  /** The knob: centred at x on the seam at height y; s = 1 when the upper tile gives (its tab points down). */
  x: number;
  y: number;
  s: 1 | -1;
  label: LabelBox;
}

export interface Layout {
  width: number;
  height: number;
  /** Bands in drawing order (left to right). */
  bands: string[];
  tiles: (Rect & { band: number; top?: Knob; bottom?: Knob })[];
  seams: Seam[];
  loose: number[];
  /** Lines the longest name wraps to (1 or 2). */
  lines: number;
}

/** Lines a code name takes at `max` characters a line, breaking before "." and after "_" where it can. */
export function wrapCount(name: string, max: number) {
  if (max <= 0) return 2;
  const pieces = name.split(/(?=\.)|(?<=_)/);
  let lines = 1;
  let used = 0;
  for (const piece of pieces) {
    let rest = piece.length;
    if (used && used + rest > max) {
      lines += 1;
      used = 0;
    }
    while (rest > max) {
      lines += 1;
      rest -= max;
    }
    used += rest;
  }
  return Math.min(2, lines);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

export function layout(pieces: LayoutPiece[], joints: LayoutJoint[], available = DEFAULT_WIDTH): Layout {
  const F = Math.max(8, Math.floor(available / 8) * 8);
  // Ideas sit with the piece before them (or the first project).
  const firstBand = pieces.find((p) => p.band)?.band ?? "";
  let last = firstBand;
  const bandOf = pieces.map((p) => (last = p.band || last));
  let bands = [...new Set(bandOf)];
  if (bands.length === 3) {
    // Fewest joined neighbours two bands apart: those can't share an edge.
    const cost = (order: string[]) =>
      joints.filter((j) => Math.abs(j.from - j.to) === 1 && Math.abs(order.indexOf(bandOf[j.from]!) - order.indexOf(bandOf[j.to]!)) > 1).length;
    bands = permutations(bands).reduce((best, order) => (cost(order) < cost(best) ? order : best), bands);
  }
  let B = bands.length;
  let o = 0;
  let W = 0;
  if (B >= 2) {
    o = Math.floor((F - K.OV) / B);
    W = o + K.OV;
    if (W < K.W_MIN || o - K.GAP < K.LANE_MIN) B = 1;
    // A piece reads as a piece, not a bar: cap its width and centre the staircase.
    else if (W > K.W_TILE) {
      W = K.W_TILE;
      o = W - K.OV;
    }
  }
  if (B <= 1) {
    B = 1;
    const lane = Math.min(320, Math.max(K.LANE_MIN, Math.round(0.36 * F)));
    W = Math.min(K.W_MAX, F - lane - K.GAP);
    o = 0;
  }
  const col = (i: number) => (B === 1 ? 0 : bands.indexOf(bandOf[i]!));
  const x0 = B === 1 ? 0 : Math.floor((F - ((B - 1) * o + W)) / 2);
  const xOf = (i: number) => x0 + col(i) * o;
  const overlap = (a: number, b: number) => Math.min(xOf(a), xOf(b)) + W - Math.max(xOf(a), xOf(b));

  const claimed = new Map<number, number>();
  const loose: number[] = [];
  joints.forEach((j, index) => {
    const upper = Math.min(j.from, j.to);
    if (Math.abs(j.from - j.to) === 1 && overlap(j.from, j.to) >= K.OV && !claimed.has(upper)) claimed.set(upper, index);
    else loose.push(index);
  });

  const lines = Math.max(1, ...pieces.map((p) => wrapCount(p.name, Math.floor((W - 2 * K.PAD) / K.CHAR))));
  const upward = [...claimed].some(([upper, index]) => joints[index]!.from !== upper);
  const rows = Math.min(3, Math.max(1, ...pieces.map((p) => p.rows ?? 1)));
  const H = K.H0 + (lines - 1) * K.LINE + (rows - 1) * K.ROW + (upward ? K.UP : 0);

  const ys: number[] = [];
  pieces.forEach((_, i) => ys.push(i === 0 ? 0 : ys[i - 1]! + H + (claimed.has(i - 1) ? 0 : K.GAP)));

  const tiles: Layout["tiles"] = pieces.map((_, i) => ({ x: xOf(i), y: ys[i]!, w: W, h: H, band: col(i) }));
  const seams: Seam[] = [];
  for (const [upper, index] of [...claimed].sort((a, b) => a[0] - b[0])) {
    const lower = upper + 1;
    const joint = joints[index]!;
    const y = ys[lower]!;
    const s: 1 | -1 = joint.from === upper ? 1 : -1;
    const same = col(upper) === col(lower);
    const side = B === 1 ? "R" : same ? (col(upper) < B - 1 ? "R" : "L") : col(lower) > col(upper) ? "R" : "L";
    const x = same
      ? side === "R"
        ? xOf(upper) + W - K.INSET
        : xOf(upper) + K.INSET
      : (Math.max(xOf(upper), xOf(lower)) + Math.min(xOf(upper), xOf(lower)) + W) / 2;
    const labelY = same ? y - K.LABEL_H / 2 : y - 4 - K.LABEL_H;
    const label: LabelBox =
      side === "R"
        ? { x: xOf(upper) + W + K.GAP, y: labelY, w: F - xOf(upper) - W - K.GAP, h: K.LABEL_H, align: "left" }
        : { x: 0, y: labelY, w: xOf(upper) - K.GAP, h: K.LABEL_H, align: "right" };
    seams.push({ joint: index, upper, lower, x, y, s, label });
    tiles[upper]!.bottom = { x, s };
    tiles[lower]!.top = { x, s };
  }
  return { width: F, height: (ys[pieces.length - 1] ?? 0) + (pieces.length ? H : 0), bands, tiles, seams, loose, lines };
}

