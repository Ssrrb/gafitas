// Conveyor: steps in order. A belt on two drums carries a tote from a magazine (intake) under a row of press
// stations to a hinged flap; past the flap is a roller table (output), under it a reject bin. What moves: the
// tote travels to the lit part and the belt and drums move with it, the lit station's press comes down onto
// the tote's work piece, and the flap opens while the lit step fails, so the tote drops into the bin.
import * as React from "react";
import * as k from "../vendor/anatomy/iso-kit";
import { Dots, Line, Solid } from "../vendor/anatomy/react/draw";
import { boxOf, drum, faceRing, prismAlong, type Across, type V3 } from "../figure/geom";
import { LiveSolid, SlotG, follow, useFrameLoop, type LiveSolidApi } from "../figure/runtime";
import { benchArt, benchPoints, fitTight } from "./bench";
import type { SlotKey } from "./slots";
import type { MachineViewProps } from "./Coupling";

export const WIDTH = 600;
const AZIMUTH = 55;
const Z = 30;
const BW = 12;
const RAIL = { y0: 12.5, y1: 15.5, z0: Z - 10, z1: Z + 2.5 };
const DRUM_Z = Z - 6;
const DRUM_R = 5;
const SPACING = 46;
const CLEAT = 12;
const TOTE = { w: 18, d: 20, h: 9.5, wall: 1.2 };
const PIECE_H = 12;
const HEAD_REST = Z + 21;
const STROKE = 7.4;
const FLAP_OPEN = (34 * Math.PI) / 180;
const FLAP_W = 24;

type Plan = k.Plan;

export interface ConveyorModel {
  id: string;
  P: k.Projection;
  height: number;
  stations: number[];
  xm: number;
  xb0: number;
  xb1: number;
  xf0: number;
  xt0: number;
  railEnd: number;
  stops: Map<SlotKey, { x: number; z: number; branch: "belt" | "reject" | "table" }>;
  art: Record<string, React.ReactNode>;
  stationFronts: { slot: SlotKey; before: React.ReactNode; tool: React.ReactNode; body: React.ReactNode; after: React.ReactNode }[];
  label: string;
}

const cache = new Map<string, ConveyorModel>();

export function conveyorModel(n: number): ConveyorModel {
  const id = `${n}`;
  let model = cache.get(id);
  if (!model) cache.set(id, (model = buildConveyor(n)));
  return model;
}

/** Uncached: every path for this slot count. Pure, so the same counts always give the same drawing. */
export function buildConveyor(n: number): ConveyorModel {
  const id = `${n}`;
  const xm = 0;
  const xb0 = xm - 18;
  const first = xm + 44;
  const stations = Array.from({ length: n }, (_, i) => first + i * SPACING);
  const xb1 = stations[n - 1]! + 34;
  const railEnd = xb1 + 7;
  const xf0 = xb1 + 6.5;
  const xf1 = xf0 + FLAP_W;
  const xt0 = xf1 + 2;
  const xt1 = xt0 + 36;
  const PLATE: Plan = { x: xb0 - 32, y: -50, w: xt1 + 12 - (xb0 - 32), d: 100, r: 8 };
  const tallest: k.Point3[] = [
    [stations[0]! - 4, -25, Z + 45],
    [stations[n - 1]! + 4, 25, Z + 45],
    [xm - 12, -19, Z + 38],
  ];
  const { P, height } = fitTight([...benchPoints(PLATE), ...tallest], WIDTH, AZIMUTH);
  const at = (point: k.Point3) => k.iso(point, P);
  const S = (paths: k.SolidPaths, tone: k.Tone = "mid", crease: k.Tone | "none" = "faint", inner?: React.ReactNode, key?: React.Key) => <Solid key={key} paths={paths} tone={tone} crease={crease} inner={inner} />;
  const slab = (plan: Plan, z: number, h: number, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);

  const bench = benchArt(
    {
      plate: PLATE,
      label: { x: PLATE.x + 8, y: -20, w: 15, d: 40, r: 2 },
      labelAlong: "y",
      ruler: { x0: xb0 - 6, x1: xt1 - 2, y: 36 },
    },
    P,
  );

  // Legs under the rails, every ~70 units, with foot pads and a stretcher along the front.
  const legXs: number[] = [];
  const span = railEnd - 6 - (xb0 + 2);
  const legCount = Math.max(2, Math.ceil(span / 72) + 1);
  for (let i = 0; i < legCount; i++) legXs.push(xb0 + 2 + (span * i) / (legCount - 1));
  const leg = (x: number, y0: number) => (
    <g key={`${x}-${y0}`}>
      {S(slab({ x: x - 4, y: y0 - 2, w: 8, d: 7, r: 1.2 }, 0, 1.2, 3), "lo")}
      <Dots points={[at([x - 2.6, y0 + 1.5, 1.2]), at([x + 2.6, y0 + 1.5, 1.2])]} size={0.4} tone="mid" />
      {S(slab({ x: x - 2, y: y0, w: 4, d: 3, r: 0.6 }, 1.2, RAIL.z0 - 1.2, 2), "mid")}
    </g>
  );
  const rail = (y0: number) => {
    const plan: Plan = { x: xb0 - 7, y: y0, w: railEnd - (xb0 - 7), d: 3, r: 1.5 };
    return S(slab(plan, RAIL.z0, RAIL.z1 - RAIL.z0, 3, 0.4), "mid", "faint", <Line d={k.sideSeam(plan, Z - 3, P, 3)} tone="faint" />);
  };

  // The magazine: four angle posts, guide bars, two empty totes waiting.
  const magPost = (x: number, y: number) => S(slab({ x: x - 1.5, y: y - 1.5, w: 3, d: 3, r: 0.4 }, 0, Z + 36, 2), "mid", "faint");
  const magBar = (plan: Plan, z: number) => S(slab(plan, z, 2, 2), "mid", "faint");
  const MX0 = xm - 11;
  const MX1 = xm + 11;
  const MY = 17.5;
  const barX = (y: number, z: number) => magBar({ x: MX0, y: y - 0.75, w: MX1 - MX0, d: 1.5, r: 0.4 }, z);
  const barY = (x: number, z: number) => magBar({ x: x - 0.75, y: -MY, w: 1.5, d: MY * 2, r: 0.4 }, z);
  const magazineBack = (
    <g>
      {[MX0, MX1].map((x) => (
        <g key={x}>{S(slab({ x: x - 4, y: -MY - 3, w: 8, d: 6, r: 1 }, 0, 1.2, 3), "lo")}</g>
      ))}
      {magPost(MX0, -MY)}
      {magPost(MX1, -MY)}
      {magPost(MX0, MY)}
      {barX(-MY, Z + 16)}
      {barX(-MY, Z + 33)}
      {barY(MX0, Z + 16)}
      {barY(MX0, Z + 33)}
    </g>
  );

  function tote(full: boolean) {
    const { w, d, h, wall } = TOTE;
    const x0 = -w / 2;
    const y0 = -d / 2;
    const floor: Plan = { x: x0, y: y0, w, d, r: 1.2 };
    const back: Plan = { x: x0, y: y0, w, d: wall, r: 0.5 };
    const left: Plan = { x: x0, y: y0, w: wall, d, r: 0.5 };
    const right: Plan = { x: x0 + w - wall, y: y0, w: wall, d, r: 0.5 };
    const front: Plan = { x: x0, y: y0 + d - wall, w, d: wall, r: 0.5 };
    const piece: Plan = { x: -5, y: -5, w: 10, d: 10, r: 1.4 };
    const cardY = y0 + d;
    const card = k.pathOf(
      [
        [-5, cardY, 3],
        [5, cardY, 3],
        [5, cardY, 7],
        [-5, cardY, 7],
      ].map((p) => at(p as k.Point3)),
      true,
    );
    const grip = k.pathOf(
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return at([w / 2, 3.2 * Math.cos(a), 6.6 + 1 * Math.sin(a)]);
      }),
      true,
    );
    return (
      <g>
        {S(slab(floor, 0, wall, 3), "mid")}
        {S(slab(back, wall, h - wall, 2), "mid")}
        {S(slab(left, wall, h - wall, 2), "mid")}
        {full ? (
          <g>
            {S(slab(piece, wall, PIECE_H, 4, 0.5), "hi", "lo")}
            <Line d={k.planOutline(k.insetPlan(piece, 2), wall + PIECE_H, P, 4)} tone="faint" />
            <Dots points={[at([0, 0, wall + PIECE_H])]} size={0.55} tone="mid" />
          </g>
        ) : null}
        {S(slab(right, wall, h - wall, 2), "mid", "faint", <Line d={grip} tone="lo" />)}
        {S(slab(front, wall, h - wall, 2), "mid", "faint", <Line d={card} tone="lo" />)}
      </g>
    );
  }

  const stack = (
    <g>
      <g transform={k.translateAlong(P, [xm, 0, Z + 15])}>{tote(false)}</g>
      <g transform={k.translateAlong(P, [xm, 0, Z + 26])}>{tote(false)}</g>
    </g>
  );
  const pins = [-1, 1].flatMap((side) => [MX0 + 4, MX1 - 4].map((x) => [x, side] as const));
  const magazineFront = (
    <g>
      {[MX0, MX1].map((x) => (
        <g key={x}>{S(slab({ x: x - 4, y: MY - 3, w: 8, d: 6, r: 1 }, 0, 1.2, 3), "lo")}</g>
      ))}
      {pins
        .filter(([, side]) => side > 0)
        .map(([x]) => (
          <g key={x}>{S(drum("y", x, Z + 13.6, 0.9, MY - 1, MY + 1.6, P, 12), "mid")}</g>
        ))}
      {magPost(MX1, MY)}
      {barY(MX1, Z + 16)}
      {barY(MX1, Z + 33)}
      {barX(MY, Z + 16)}
      {barX(MY, Z + 33)}
      <Dots points={[at([MX1, MY + 1.5, Z + 17]), at([MX1, MY + 1.5, Z + 34]), at([MX0 + 2, MY + 0.75, Z + 17]), at([MX0 + 2, MY + 0.75, Z + 34])]} size={0.4} tone="mid" />
    </g>
  );

  // Belt: two drum wraps, the carrying run, bearing housings on the front rail.
  const halfDrum = (cx: number, side: 1 | -1, r: number) => {
    const arc: Across[] = Array.from({ length: 15 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 14) * Math.PI;
      return [cx + side * r * Math.cos(a), DRUM_Z + r * Math.sin(a)];
    });
    return prismAlong("y", side > 0 ? arc : arc.reverse(), -BW, BW, P, true);
  };
  const belt = (
    <g>
      {S(halfDrum(xb0, -1, 6), "mid", "faint")}
      {S(slab({ x: xb0, y: -BW, w: xb1 - xb0, d: BW * 2, r: 0 }, DRUM_Z - 6, 1, 2), "lo", "none")}
      {S(slab({ x: xb0, y: -BW, w: xb1 - xb0, d: BW * 2, r: 0 }, Z - 1, 1, 2), "mid", "faint")}
      {S(halfDrum(xb1, 1, 6), "mid", "faint")}
    </g>
  );
  const bearings = (
    <g>
      {[xb0, xb1].map((x) => (
        <g key={x}>
          {S(slab({ x: x - 5, y: RAIL.y1, w: 10, d: 0.8, r: 0.4 }, DRUM_Z - 5, 10, 2), "mid", "faint")}
          {S(drum("y", x, DRUM_Z, 3.4, RAIL.y1 + 0.8, RAIL.y1 + 2.8, P, 28), "mid")}
          <Line d={faceRing("y", RAIL.y1 + 2.8, x, DRUM_Z, 1.4, P, 16)} tone="lo" />
          <Dots points={[at([x - 3.6, RAIL.y1 + 0.8, DRUM_Z + 3.6]), at([x + 3.6, RAIL.y1 + 0.8, DRUM_Z - 3.6])]} size={0.4} tone="mid" />
        </g>
      ))}
      {S(drum("y", xf0, Z - 1, 1.5, RAIL.y1, RAIL.y1 + 1.2, P, 16), "mid")}
    </g>
  );

  // Stations: back post (behind the belt), then front post, the press (rod and head move), beam, valve block.
  const stationBacks = (
    <g>
      {stations.map((x) => (
        <g key={x}>
          {S(slab({ x: x - 5, y: -27, w: 10, d: 8, r: 1 }, 0, 1.4, 3), "lo")}
          <Dots points={[at([x - 3, -23, 1.4]), at([x + 3, -23, 1.4])]} size={0.4} tone="mid" />
          {S(slab({ x: x - 3, y: -24, w: 6, d: 4, r: 0.6 }, 1.4, Z + 35 - 1.4, 2), "mid", "faint")}
        </g>
      ))}
    </g>
  );
  const stationFronts = stations.map((x, i) => {
    const before = (
      <g>
        {S(slab({ x: x - 5, y: 18, w: 10, d: 8, r: 1 }, 0, 1.4, 3), "lo")}
        <Dots points={[at([x - 3, 22, 1.4]), at([x + 3, 22, 1.4])]} size={0.4} tone="mid" />
        {S(slab({ x: x - 3, y: 19, w: 6, d: 4, r: 0.6 }, 1.4, Z + 35 - 1.4, 2), "mid", "faint", <Line d={k.segment([x, 23, 1.4], [x, 23, Z + 35], P)} tone="faint" />)}
      </g>
    );
    const tagRows = [0, 1, 2].map((row) => k.segment([x - 1.9, 23.4, Z + 15 - row * 1.6], [x + (row === 1 ? 0.4 : 1.9), 23.4, Z + 15 - row * 1.6], P)).join("");
    const tag = (
      <g>
        {S(slab({ x: x - 2.6, y: 23, w: 5.2, d: 0.4, r: 0.2 }, Z + 10, 7, 2), "lo", "none")}
        <Line d={tagRows} tone="lo" free />
        <Dots points={[at([x, 23.4, Z + 16.2]), at([x, 23.4, Z + 10.8])]} size={0.32} tone="mid" />
      </g>
    );
    const round = i % 2 === 0;
    const headZ = HEAD_REST;
    const tool = (
      <g>
        {S(k.cylinder(x, 0, 1.4, headZ + 3, 10, P, 16), "mid", "none")}
        {round ? S(k.cylinder(x, 0, 6, headZ, 3, P, 36, 0.4), "hi", "lo") : S(slab({ x: x - 5.5, y: -5.5, w: 11, d: 11, r: 1.2 }, headZ, 3, 3, 0.4), "hi", "lo")}
        {round ? <Line d={k.ring(x, 0, 3.6, headZ + 3, P, 28)} tone="faint" /> : <Line d={k.planOutline({ x: x - 3.5, y: -3.5, w: 7, d: 7, r: 0.6 }, headZ + 3, P, 3)} tone="faint" />}
        {S(k.cylinder(x, 0, 2.4, headZ + 3, 1.2, P, 18), "mid")}
      </g>
    );
    const body = (
      <g>
        {S(k.cylinder(x, 0, 2.7, Z + 25, 2, P, 20), "mid")}
        {S(k.cylinder(x, 0, 5.2, Z + 27, 8, P, 36, 0.4), "hi", "lo", <Line d={k.sideArc(x, 0, 5.2, Z + 31, P, 24)} tone="faint" />)}
        {S(k.cylinder(x + 3.6, 3.6, 1.1, Z + 30.2, 0.1, P, 12), "mid", "none")}
      </g>
    );
    const after = (
      <g>
        {S(slab({ x: x - 4, y: -25, w: 8, d: 50, r: 1.5 }, Z + 35, 6, 3, 0.6), "mid")}
        <Dots points={[at([x, -21.5, Z + 41]), at([x, 21.5, Z + 41])]} size={0.45} tone="mid" />
        {S(slab({ x: x - 3, y: 4, w: 6, d: 10, r: 1 }, Z + 41, 3.4, 3, 0.4), "mid")}
        <Dots points={[at([x - 1.6, 6.2, Z + 44.4]), at([x - 1.6, 11.8, Z + 44.4])]} size={0.4} tone="mid" />
        {S(k.cylinder(x + 1.2, 9, 1.3, Z + 44.4, 1.6, P, 12), "mid")}
      </g>
    );
    return { slot: `station:${i}`, before: <g>{before}{tag}</g>, tool, body, after };
  });

  // Right end: the flap's bin and the roller table.
  const BIN: Plan = { x: xf0 + 1, y: -14, w: FLAP_W - 2, d: 28, r: 1.5 };
  const binWall = (plan: Plan) => S(slab(plan, 1.4, 13.6, 2), "mid");
  const binBack = (
    <g>
      {S(slab(BIN, 0, 1.4, 3), "lo")}
      {binWall({ x: BIN.x, y: BIN.y, w: BIN.w, d: 1.2, r: 0.5 })}
      {binWall({ x: BIN.x, y: BIN.y, w: 1.2, d: BIN.d, r: 0.5 })}
    </g>
  );
  const binFront = (
    <g>
      {binWall({ x: BIN.x + BIN.w - 1.2, y: BIN.y, w: 1.2, d: BIN.d, r: 0.5 })}
      {S(slab({ x: BIN.x, y: BIN.y + BIN.d - 1.2, w: BIN.w, d: 1.2, r: 0.5 }, 1.4, 13.6, 2), "mid", "faint", (
        <Line
          d={k.pathOf(
            [
              [BIN.x + 6, BIN.y + BIN.d, 5],
              [BIN.x + BIN.w - 6, BIN.y + BIN.d, 5],
              [BIN.x + BIN.w - 6, BIN.y + BIN.d, 10],
              [BIN.x + 6, BIN.y + BIN.d, 10],
            ].map((p) => at(p as k.Point3)),
            true,
          )}
          tone="lo"
        />
      ))}
    </g>
  );

  const rollers: number[] = [];
  for (let x = xt0 + 4.5; x <= xt1 - 4; x += 6.2) rollers.push(x);
  const tableBack = (
    <g>
      {[xt0 + 3, xt1 - 3].map((x) => (
        <g key={x}>{S(slab({ x: x - 1.5, y: -14, w: 3, d: 2.5, r: 0.5 }, 0, Z - 6, 2), "mid")}</g>
      ))}
      {S(slab({ x: xt0, y: -14, w: xt1 - xt0, d: 2, r: 0.6 }, Z - 6, 4.4, 2, 0.3), "mid")}
    </g>
  );
  const tableFront = (
    <g>
      {rollers.map((x) => (
        <g key={x}>{S(drum("y", x, Z - 2.4, 2.4, -12, 12, P, 20), "hi", "lo")}</g>
      ))}
      {[xt0 + 3, xt1 - 3].map((x) => (
        <g key={x}>{S(slab({ x: x - 1.5, y: 11.5, w: 3, d: 2.5, r: 0.5 }, 0, Z - 6, 2), "mid")}</g>
      ))}
      {S(slab({ x: xt0, y: 12, w: xt1 - xt0, d: 2, r: 0.6 }, Z - 6, 4.4, 2, 0.3), "mid")}
      <Dots points={rollers.map((x) => at([x, 14, Z - 2.4]))} size={0.45} tone="mid" />
    </g>
  );
  const tableStop = (
    <g>
      {S(slab({ x: xt1 - 2.4, y: -13, w: 2.4, d: 26, r: 0.8 }, Z - 3, 8, 2, 0.4), "mid")}
      <Dots points={[at([xt1 - 1.2, -9, Z + 5]), at([xt1 - 1.2, 9, Z + 5])]} size={0.4} tone="mid" />
    </g>
  );

  const stops = new Map<SlotKey, { x: number; z: number; branch: "belt" | "reject" | "table" }>();
  stops.set("intake", { x: xm, z: Z, branch: "belt" });
  stations.forEach((x, i) => stops.set(`station:${i}`, { x, z: Z, branch: "belt" }));
  stops.set("reject", { x: xf0 + FLAP_W / 2 + 1, z: 1.4, branch: "reject" });
  stops.set("output", { x: xt0 + 16, z: Z, branch: "table" });

  const model: ConveyorModel = {
    id,
    P,
    height,
    stations,
    xm,
    xb0,
    xb1,
    xf0,
    xt0,
    railEnd,
    stops,
    art: {
      bench,
      stationBacks,
      magazineBack,
      backLegs: <g>{legXs.map((x) => leg(x, -RAIL.y1))}</g>,
      backRail: rail(-RAIL.y1),
      belt,
      binBack,
      stack,
      frontRail: (
        <g>
          {rail(RAIL.y0)}
          {legXs.map((x) => leg(x, RAIL.y0))}
          <Dots points={legXs.flatMap((x) => [at([x - 1.2, RAIL.y1, RAIL.z0 + 2.4]), at([x + 1.2, RAIL.y1, RAIL.z0 + 2.4])])} size={0.4} tone="mid" />
          {S(slab({ x: legXs[0]! + 2, y: RAIL.y0 + 0.5, w: legXs[legXs.length - 1]! - legXs[0]! - 4, d: 2, r: 0.5 }, 6, 2.4, 2), "mid")}
        </g>
      ),
      bearings,
      magazineFront,
      binFront,
      tableBack,
      tableFront,
      tableStop,
      tote: tote(true),
    },
    stationFronts,
    label: `A conveyor on a bench: a magazine of totes, a belt on two drums under ${n} press station${n > 1 ? "s" : ""}, a hinged flap over a reject bin, and a roller table at the end. A tote carries a work piece to the lit part.`,
  };
  return model;
}

const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

function pressAt(age: number) {
  if (age < 0) return 0;
  if (age < 0.4) return smooth(age / 0.4);
  if (age < 0.7) return 1;
  if (age < 1.2) return 1 - smooth((age - 0.7) / 0.5);
  return 0;
}

export function ConveyorView({ model, stepIndex, lit, fails, visible }: MachineViewProps & { model: ConveyorModel }) {
  const { P, xb0, xb1, xf0 } = model;
  const flap = React.useRef<LiveSolidApi | null>(null);
  const totes = { C: React.useRef<SVGGElement | null>(null), A: React.useRef<SVGGElement | null>(null), B: React.useRef<SVGGElement | null>(null) };
  const tools = React.useRef(new Map<number, SVGGElement | null>());
  const cleats = React.useRef<(SVGPathElement | null)[]>([]);
  const marks = React.useRef<SVGPathElement | null>(null);
  const home = model.stops.get("intake")!;
  const dest = (lit && model.stops.get(lit)) || null;
  const s = React.useRef({ x: home.x, z: home.z, alpha: 1, fading: false, inBin: false, belt: 0, flap: 0, clock: 0, pressAt: -10, pressFor: "", calm: false, litStation: "", target: home });
  const want = React.useRef({ dest: dest ?? home, fails, lit });
  want.current = { dest: dest ?? want.current.dest, fails, lit };

  const draw = React.useCallback(() => {
    const st = s.current;
    // Tote: drawn in the slot that matches where it is (on the belt, dropping into the bin, or on the table).
    const where = st.z < Z - 0.3 ? "A" : st.x - TOTE.w / 2 > model.railEnd ? "B" : "C";
    for (const name of ["A", "B", "C"] as const) {
      const node = totes[name].current;
      if (!node) continue;
      if (name === where) {
        node.removeAttribute("display");
        node.setAttribute("transform", k.translateAlong(P, [st.x, 0, st.z]));
        node.style.opacity = st.alpha >= 0.999 ? "" : st.alpha.toFixed(3);
      } else node.setAttribute("display", "none");
    }
    // Belt cleats move with the belt and fade at the drums.
    const length = xb1 - xb0;
    const groups: string[][] = [[], [], [], []];
    const count = Math.floor(length / CLEAT);
    for (let i = 0; i <= count; i++) {
      const along = (((i * CLEAT + st.belt) % length) + length) % length;
      const edge = Math.min(along, length - along);
      const level = Math.min(3, Math.floor(edge / 2.2));
      if (level <= 0) continue;
      const x = xb0 + along;
      groups[level]!.push(k.lineOnTop([x, -BW + 0.6], [x, BW - 0.6], Z, P));
    }
    groups.forEach((list, level) => {
      const node = cleats.current[level];
      if (node) node.setAttribute("d", list.join(""));
    });
    // Drum axle marks turn with the belt.
    if (marks.current) {
      const angle = st.belt / DRUM_R;
      const y = RAIL.y1 + 2.8;
      marks.current.setAttribute(
        "d",
        [xb0, xb1].map((x) => k.pathOf([k.iso([x - 1.3 * Math.cos(angle), y, DRUM_Z + 1.3 * Math.sin(angle)], P), k.iso([x + 1.3 * Math.cos(angle), y, DRUM_Z - 1.3 * Math.sin(angle)], P)])).join(""),
      );
    }
    // The flap turns down about its hinge.
    const phi = st.flap;
    const hinge: [number, number] = [xf0, Z - 0.8];
    const turn = ([x, y, z]: V3): V3 => {
      const dx = x - hinge[0];
      const dz = z - hinge[1];
      return [hinge[0] + dx * Math.cos(phi) + dz * Math.sin(phi), y, hinge[1] - dx * Math.sin(phi) + dz * Math.cos(phi)];
    };
    const corners: V3[] = [
      [xf0 + 0.6, -BW, Z - 1.6],
      [xf0 + FLAP_W - 0.6, -BW, Z - 1.6],
      [xf0 + FLAP_W - 0.6, BW, Z - 1.6],
      [xf0 + 0.6, BW, Z - 1.6],
      [xf0 + 0.6, -BW, Z],
      [xf0 + FLAP_W - 0.6, -BW, Z],
      [xf0 + FLAP_W - 0.6, BW, Z],
      [xf0 + 0.6, BW, Z],
    ].map((p) => turn(p as V3));
    flap.current?.set(boxOf(corners, P));
    // Press heads.
    const age = st.clock - st.pressAt;
    for (const [index, node] of tools.current) {
      const key = `station:${index}`;
      const pressing = st.pressFor === key ? (st.calm ? (key === st.litStation ? 0.6 : 0) : pressAt(age)) : 0;
      node?.setAttribute("transform", pressing ? k.translateAlong(P, [0, 0, -STROKE * pressing]) : "");
    }
  }, [P, model, xb0, xb1, xf0]);

  const kick = useFrameLoop((dt, calm) => {
    const st = s.current;
    const w = want.current;
    st.clock += dt;
    const target = w.dest;
    // Going back (a new answer cycle) or leaving the bin: fade out, jump, fade in.
    if (target !== st.target) {
      const backwards = target.x < st.x - 0.5 || st.inBin;
      st.target = target;
      if (backwards && !calm) st.fading = true;
      else if (backwards) {
        st.x = target.x;
        st.z = target.z;
        st.inBin = target.branch === "reject";
      }
    }
    let moving = false;
    if (st.fading) {
      st.alpha = follow(st.alpha, 0, dt, 0.09, calm);
      if (st.alpha < 0.03) {
        st.x = target.x;
        st.z = target.branch === "reject" ? target.z : Z;
        st.inBin = target.branch === "reject";
        st.fading = false;
      }
      moving = true;
    } else {
      st.alpha = follow(st.alpha, 1, dt, 0.12, calm);
      const before = st.x;
      st.x = follow(st.x, target.x, dt, 0.3, calm);
      if (st.x - TOTE.w / 2 < xb1) st.belt += st.x - before;
      if (target.branch === "reject" && Math.abs(st.x - target.x) < 2.5) {
        st.z = follow(st.z, target.z, dt, 0.2, calm);
        if (st.z < Z - 0.3) st.inBin = true;
      } else if (target.branch !== "reject") st.z = follow(st.z, Z, dt, 0.2, calm);
      moving = st.x !== target.x || st.z !== (target.branch === "reject" ? target.z : Z) || st.alpha !== 1;
    }
    // Press once the tote has arrived under the lit station; each arrival presses once.
    const arrived = !st.fading && Math.abs(st.x - target.x) < 0.8;
    const litStation = w.lit && w.lit.startsWith("station:") ? w.lit : "";
    if (litStation && arrived && st.pressFor !== litStation) {
      st.pressFor = litStation;
      st.pressAt = st.clock;
    }
    if (st.pressFor && st.pressFor !== litStation && st.clock - st.pressAt > 1.25) st.pressFor = "";
    st.calm = calm;
    st.litStation = litStation;
    const pressing = !calm && st.pressFor !== "" && st.clock - st.pressAt < 1.25;
    // The flap is open while the lit step fails, and while the reject itself is lit (the tote went through it).
    const goal = w.fails || w.lit === "reject" ? FLAP_OPEN : 0;
    st.flap = follow(st.flap, goal, dt, 0.22, calm);
    draw();
    return moving || pressing || st.flap !== goal;
  }, visible);

  React.useLayoutEffect(() => {
    draw();
  }, [draw]);
  React.useEffect(() => {
    kick();
  }, [stepIndex, lit, fails, kick]);

  const { art } = model;
  const toteArt = art.tote;
  return (
    <svg className="iso-svg g-machine" viewBox={`0 0 ${WIDTH} ${model.height}`} role="img" aria-label={model.label} focusable="false">
      {art.bench}
      {art.stationBacks}
      <SlotG slot="intake" decor>
        {art.magazineBack}
      </SlotG>
      {art.backLegs}
      {art.backRail}
      {art.belt}
      {[0, 1, 2, 3].map((level) => (
        <path
          key={level}
          ref={(node) => {
            cleats.current[level] = node;
          }}
          className="iso-line"
          data-tone="faint"
          style={{ opacity: [0, 0.35, 0.7, 1][level] }}
          d=""
        />
      ))}
      <g ref={totes.C}>{toteArt}</g>
      {art.stack}
      {art.frontRail}
      {art.bearings}
      <path ref={marks} className="iso-line" data-tone="mid" d="" />
      <SlotG slot="intake">{art.magazineFront}</SlotG>
      {model.stationFronts.map(({ slot, before, tool, body, after }, i) => (
        <g key={slot}>
          {before}
          <SlotG slot={slot}>
            <g
              ref={(node) => {
                if (node) tools.current.set(i, node);
                else tools.current.delete(i);
              }}
            >
              {tool}
            </g>
            {body}
          </SlotG>
          {after}
        </g>
      ))}
      <SlotG slot="reject" decor>
        {art.binBack}
      </SlotG>
      <SlotG slot="reject">
        <LiveSolid api={flap} tone="hi" crease="lo" />
      </SlotG>
      <g ref={totes.A}>{toteArt}</g>
      <SlotG slot="reject" decor>
        {art.binFront}
      </SlotG>
      <SlotG slot="output">
        {art.tableBack}
        {art.tableFront}
      </SlotG>
      <g ref={totes.B}>{toteArt}</g>
      {art.tableStop}
    </svg>
  );
}
