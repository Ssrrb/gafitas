import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildConveyor, conveyorModel } from "../src/machines/Conveyor";
import { buildCoupling, couplingModel } from "../src/machines/Coupling";

const markup = (art: Record<string, unknown>) =>
  renderToStaticMarkup(
    <svg>
      {Object.entries(art).map(([key, node]) => (
        <g key={key}>{Array.isArray(node) ? node.map((n: { art?: React.ReactNode; tool?: React.ReactNode }, i) => <g key={i}>{n.art ?? n.tool}</g>) : (node as React.ReactNode)}</g>
      ))}
    </svg>,
  );

describe("geometry", () => {
  it("is deterministic per slot count", () => {
    for (const [a, b] of [
      [0, 0],
      [1, 1],
      [3, 3],
      [2, 0],
    ]) {
      const one = buildCoupling(a!, b!);
      const two = buildCoupling(a!, b!);
      expect(one.P).toEqual(two.P);
      expect(one.height).toBe(two.height);
      expect([...one.slotX]).toEqual([...two.slotX]);
      expect(markup(one.art)).toBe(markup(two.art));
    }
    for (const n of [1, 3, 6]) {
      const one = buildConveyor(n);
      const two = buildConveyor(n);
      expect(one.P).toEqual(two.P);
      expect([...one.stops]).toEqual([...two.stops]);
      expect(markup({ ...one.art, fronts: one.stationFronts })).toBe(markup({ ...two.art, fronts: two.stationFronts }));
    }
  });

  it("is memoized: one model per slot count", () => {
    expect(couplingModel(2, 1)).toBe(couplingModel(2, 1));
    expect(conveyorModel(4)).toBe(conveyorModel(4));
    expect(couplingModel(2, 1)).not.toBe(couplingModel(1, 2));
  });

  it("has a slot for every part the counts allow, in flow order", () => {
    const max = buildCoupling(3, 3);
    expect(max.flow).toEqual(["a_part:0", "a_part:1", "a_part:2", "a_port", "key", "adapter", "b_port", "b_part:0", "b_part:1", "b_part:2"]);
    const xs = max.flow.map((slot) => max.slotX.get(slot)!);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
    const line = buildConveyor(6);
    expect([...line.stops.keys()]).toEqual(["intake", "station:0", "station:1", "station:2", "station:3", "station:4", "station:5", "reject", "output"]);
  });

  it("fits the drawing inside its viewBox", () => {
    for (const model of [buildCoupling(3, 3), buildCoupling(0, 0), buildConveyor(1), buildConveyor(6)]) {
      expect(model.height).toBeGreaterThanOrEqual(230);
      expect(model.height).toBeLessThanOrEqual(380);
      expect(model.P.scale).toBeGreaterThan(0.5);
    }
  });
});
