import { describe, expect, it } from "vitest";
import { K, layout, wrapCount, type LayoutJoint, type LayoutPiece } from "../src/puzzle/layout";
import { KNOB_DEPTH, KNOB_HALF } from "../src/puzzle/path";

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

/** Every way of giving n pieces to up to 3 projects, as band names. */
function* assignments(n: number): Generator<string[]> {
  const total = 3 ** n;
  for (let code = 0; code < total; code++) {
    const bands: string[] = [];
    let c = code;
    for (let i = 0; i < n; i++) {
      bands.push(["a", "b", "c"][c % 3]!);
      c = Math.floor(c / 3);
    }
    yield bands;
  }
}

const chain = (n: number, upAt = -1): LayoutJoint[] => Array.from({ length: n - 1 }, (_, i) => (i === upAt ? { from: i + 1, to: i } : { from: i, to: i + 1 }));

describe("puzzle layout", () => {
  it("every seam is a shared edge with the knob inside the overlap; nothing collides; every joint is placed once", () => {
    for (const width of [336, 420, 518, 600, 738]) {
      for (let n = 2; n <= 6; n++) {
        for (const bands of assignments(n)) {
          const pieces: LayoutPiece[] = bands.map((band, i) => ({ band, name: i % 2 ? "HTTPConnectionPool._make_request" : "Session.send" }));
          const joints = chain(n, n > 2 ? 1 : -1);
          const L = layout(pieces, joints, width);
          const where = `${width} ${bands.join("")}`;
          expect(L.width, where).toBeLessThanOrEqual(width);
          for (const seam of L.seams) {
            const upper = L.tiles[seam.upper]!;
            const lower = L.tiles[seam.lower]!;
            expect(upper.y + upper.h, where).toBe(lower.y);
            const left = Math.max(upper.x, lower.x);
            const right = Math.min(upper.x + upper.w, lower.x + lower.w);
            expect(right - left, where).toBeGreaterThanOrEqual(Math.min(K.OV, upper.w));
            expect(seam.x - KNOB_HALF, where).toBeGreaterThanOrEqual(left + 12);
            expect(seam.x + KNOB_HALF, where).toBeLessThanOrEqual(right - 12);
            // The tab stays inside the receiving tile's padding: it never reaches the words.
            expect(KNOB_DEPTH, where).toBeLessThanOrEqual(seam.s === 1 ? K.SOCKET - 4 : K.PAD + K.UP - 4);
          }
          expect(new Set([...L.seams.map((s) => s.joint), ...L.loose]).size, where).toBe(joints.length);
          expect(L.seams.length + L.loose.length, where).toBe(joints.length);
          const boxes: Box[] = [...L.tiles, ...L.seams.map((s) => s.label)];
          for (const box of boxes) {
            expect(box.x, where).toBeGreaterThanOrEqual(0);
            expect(box.x + box.w, where).toBeLessThanOrEqual(L.width + 0.5);
            expect(box.y, where).toBeGreaterThanOrEqual(0);
            expect(box.y + box.h, where).toBeLessThanOrEqual(L.height + 0.5);
          }
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${where} boxes ${i} ${j}`).toBe(false);
          for (const seam of L.seams) expect(seam.label.w, where).toBeGreaterThanOrEqual(K.LANE_MIN - K.GAP);
        }
      }
    }
  });

  it("a chain across two projects becomes a staircase of shared edges", () => {
    const L = layout(
      [
        { band: "requests", name: "Session.send" },
        { band: "requests", name: "HTTPAdapter.send" },
        { band: "urllib3", name: "HTTPConnectionPool.urlopen" },
        { band: "urllib3", name: "HTTPConnectionPool._make_request" },
      ],
      chain(4),
    );
    expect(L.bands).toEqual(["requests", "urllib3"]);
    expect(L.seams.map((s) => [s.upper, s.lower])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(L.loose).toEqual([]);
    expect(L.tiles[2]!.x).toBeGreaterThan(L.tiles[1]!.x);
  });

  it("a joint between pieces that aren't neighbours is loose; tiles without a joint stand apart", () => {
    const L = layout(
      [
        { band: "a", name: "one" },
        { band: "a", name: "two" },
        { band: "a", name: "three" },
      ],
      [
        { from: 0, to: 2 },
        { from: 1, to: 2 },
      ],
    );
    expect(L.loose).toEqual([0]);
    expect(L.tiles[1]!.y).toBe(L.tiles[0]!.y + L.tiles[0]!.h + K.GAP);
  });

  it("is the same every time for the same input", () => {
    const pieces = [
      { band: "x", name: "a" },
      { band: "y", name: "b" },
      { band: "z", name: "c" },
    ];
    expect(layout(pieces, chain(3), 600)).toEqual(layout(pieces, chain(3), 600));
  });

  it("wraps code names before dots and after underscores", () => {
    expect(wrapCount("Session.send", 21)).toBe(1);
    expect(wrapCount("HTTPConnectionPool._make_request", 21)).toBe(2);
  });
});
