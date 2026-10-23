// Jigsaw tile outlines. A joint's knob is one curve in world space: the giver's edge and the receiver's edge
// trace the same points in opposite directions, so the tab fills the blank exactly.

export const KNOB = { a: 8, r: 12, f: 3, centre: 17 } as const;
/** How far a tab reaches past its seam: centre offset plus head radius. */
export const KNOB_DEPTH = KNOB.centre + KNOB.r;
/** Half the knob's footprint along the seam, fillets included. */
export const KNOB_HALF = KNOB.a + KNOB.f;
export const CORNER = 5;

/** A knob on a horizontal edge: centred at x, bulging down (s = 1) or up (s = -1) past the seam. */
export interface Knob {
  x: number;
  s: 1 | -1;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const n = (v: number) => Math.round(v * 100) / 100;

/** The knob's commands along a seam at height y, running left→right (dir 1) or right→left (dir -1). */
export function knobSegment(x: number, y: number, s: 1 | -1, dir: 1 | -1) {
  const { a, r, f, centre } = KNOB;
  const ym = centre - Math.sqrt(r * r - a * a);
  const sweep = s * dir > 0 ? 0 : 1;
  return [
    `L ${n(x - dir * (a + f))} ${n(y)}`,
    `Q ${n(x - dir * a)} ${n(y)} ${n(x - dir * a)} ${n(y + s * f)}`,
    `L ${n(x - dir * a)} ${n(y + s * ym)}`,
    `A ${r} ${r} 0 1 ${sweep} ${n(x + dir * a)} ${n(y + s * ym)}`,
    `L ${n(x + dir * a)} ${n(y + s * f)}`,
    `Q ${n(x + dir * a)} ${n(y)} ${n(x + dir * (a + f))} ${n(y)}`,
  ].join(" ");
}

/** A tile, clockwise from its top-left corner, with at most one knob on its top edge and one on its bottom. */
export function tilePath({ x, y, w, h }: Rect, top?: Knob, bottom?: Knob) {
  const R = CORNER;
  return [
    `M ${n(x + R)} ${n(y)}`,
    top ? knobSegment(top.x, y, top.s, 1) : "",
    `L ${n(x + w - R)} ${n(y)}`,
    `A ${R} ${R} 0 0 1 ${n(x + w)} ${n(y + R)}`,
    `L ${n(x + w)} ${n(y + h - R)}`,
    `A ${R} ${R} 0 0 1 ${n(x + w - R)} ${n(y + h)}`,
    bottom ? knobSegment(bottom.x, y + h, bottom.s, -1) : "",
    `L ${n(x + R)} ${n(y + h)}`,
    `A ${R} ${R} 0 0 1 ${n(x)} ${n(y + h - R)}`,
    `L ${n(x)} ${n(y + R)}`,
    `A ${R} ${R} 0 0 1 ${n(x + R)} ${n(y)}`,
    "Z",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The tab itself, closed along its seam: what lights when a step lights the joint. */
export function knobPath(x: number, y: number, s: 1 | -1) {
  return `M ${n(x - KNOB_HALF)} ${n(y)} ${knobSegment(x, y, s, 1)} Z`;
}
