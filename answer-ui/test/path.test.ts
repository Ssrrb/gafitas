import { describe, expect, it } from "vitest";
import { KNOB_DEPTH, knobSegment, tilePath } from "../src/puzzle/path";

const points = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
/** The end point of each command: the last two numbers of it. */
const ends = (d: string) =>
  d
    .split(/(?=[LQA])/)
    .map((command) => points(command).slice(-2))
    .filter((p) => p.length === 2);

describe("tile paths", () => {
  it("the giver's knob is the receiver's, traced the other way", () => {
    for (const s of [1, -1] as const) {
      const forth = ends(knobSegment(100, 50, s, 1));
      const back = ends(knobSegment(100, 50, s, -1));
      expect([...forth].reverse()).toEqual(back);
      // The arc goes round the far side both ways: opposite sweep flags.
      const sweep = (d: string) => /A 12 12 0 1 (\d)/.exec(d)![1];
      expect(sweep(knobSegment(100, 50, s, 1))).not.toBe(sweep(knobSegment(100, 50, s, -1)));
    }
  });

  it("a tab bulges to the side it points to, 29 deep", () => {
    const ys = (s: 1 | -1) => ends(knobSegment(100, 50, s, 1)).map((p) => p[1]!);
    expect(Math.min(...ys(1))).toBe(50);
    expect(Math.max(...ys(-1))).toBe(50);
    expect(KNOB_DEPTH).toBe(29);
  });

  it("with no knobs, a tile is a rounded rectangle", () => {
    const d = tilePath({ x: 0, y: 0, w: 100, h: 60 });
    expect(d).not.toContain("Q");
    expect((d.match(/A 5 5/g) ?? []).length).toBe(4);
  });
});
