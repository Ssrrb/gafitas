// Coupling: connect system A to system B. Two housings on a bench, joined by a shaft through two pillow-block
// bearings and a bolted flange coupling. A's parts are cartridges in A's lid, the a_port is A's bearing, the
// key locks shaft to hub, the adapter is the coupling, b_port is B's bearing and B's parts sit in B's lid.
// What moves: each step turns the drivetrain one revolution, the key slides home once the flow reaches it,
// the lit cartridge lifts, and a puck on the front track runs under whichever part is lit.
import * as React from "react";
import * as k from "../vendor/anatomy/iso-kit";
import { Dots, Line, Solid } from "../vendor/anatomy/react/draw";
import { drum, drumArc, faceRing, facesViewer, onDrum, prismAlong, viewOf, type Across } from "../figure/geom";
import { FigureContext, LiveSolid, SlotG, follow, settle, useFrameLoop, type LiveSolidApi } from "../figure/runtime";
import { benchArt, benchPoints, fitTight } from "./bench";
import { MACHINES, type SlotKey } from "./slots";

export const WIDTH = 600;
const AZIMUTH = 55;
const H = 24;
const SHAFT_R = 3.2;
const CART = 16;
const CART_GAP = 6;
const LIFT = 3.2;
const KEY_LEN = 9;
const KEY_TRAVEL = 7;
const NUTS = 6;

type Plan = k.Plan;

export interface CouplingModel {
  id: string;
  P: k.Projection;
  height: number;
  slotX: Map<SlotKey, number>;
  flow: SlotKey[];
  xC: number;
  xPa: number;
  xPb: number;
  hubIn: number;
  trackY: number;
  art: {
    bench: React.ReactNode;
    housingA: React.ReactNode;
    cartsA: { slot: SlotKey; art: React.ReactNode }[];
    driveA: React.ReactNode;
    seg2: React.ReactNode;
    couplingBack: React.ReactNode;
    couplingFront: React.ReactNode;
    seg3: React.ReactNode;
    driveB: React.ReactNode;
    housingB: React.ReactNode;
    cartsB: { slot: SlotKey; art: React.ReactNode }[];
    housingBFront: React.ReactNode;
    track: React.ReactNode;
    puck: React.ReactNode;
  };
  label: string;
}

const cache = new Map<string, CouplingModel>();

const lengthFor = (n: number) => Math.max(1, n) * CART + Math.max(0, Math.max(1, n) - 1) * CART_GAP + 26;

export function couplingModel(nA: number, nB: number): CouplingModel {
  const id = `${nA}-${nB}`;
  let model = cache.get(id);
  if (!model) cache.set(id, (model = buildCoupling(nA, nB)));
  return model;
}

/** Uncached: every path for this slot count. Pure, so the same counts always give the same drawing. */
export function buildCoupling(nA: number, nB: number): CouplingModel {
  const id = `${nA}-${nB}`;
  const LA = lengthFor(nA);
  const LB = lengthFor(nB);
  const xA0 = 0;
  const xA1 = xA0 + LA;
  const xPa = xA1 + 3 + 16;
  const xC = xPa + 35;
  const xPb = xC + 35;
  const xB0 = xPb + 6.5 + 15;
  const xB1 = xB0 + LB;
  const PLATE: Plan = { x: xA0 - 32, y: -52, w: xB1 + 16 - (xA0 - 32), d: 104, r: 8 };
  const cartX = (x0: number, L: number, n: number, i: number) => x0 + (L - (n * CART + (n - 1) * CART_GAP)) / 2 + i * (CART + CART_GAP) + CART / 2;
  const slotX = new Map<SlotKey, number>();
  for (let i = 0; i < nA; i++) slotX.set(`a_part:${i}`, cartX(xA0, LA, nA, i));
  slotX.set("a_port", xPa);
  slotX.set("key", xC - 20);
  slotX.set("adapter", xC);
  slotX.set("b_port", xPb);
  for (let i = 0; i < nB; i++) slotX.set(`b_part:${i}`, cartX(xB0, LB, nB, i));
  const flow: SlotKey[] = [...Array.from({ length: nA }, (_, i) => `a_part:${i}`), "a_port", "key", "adapter", "b_port", ...Array.from({ length: nB }, (_, i) => `b_part:${i}`)];
  const xs = [...slotX.values()];
  const track = { x0: Math.min(...xs) - 15, x1: Math.max(...xs) + 15 };
  const TRACK_Y = 30;
  const tallest: k.Point3[] = [
    [xA0, -22, 66],
    [xA1, 22, 66],
    [xB0, -24, 70],
    [xB1, 24, 70],
  ];
  const { P, height } = fitTight([...benchPoints(PLATE), ...tallest], WIDTH, AZIMUTH);
  const at = (point: k.Point3) => k.iso(point, P);

  const S = (paths: k.SolidPaths, tone: k.Tone = "mid", crease: k.Tone | "none" = "faint", inner?: React.ReactNode, key?: React.Key) => <Solid key={key} paths={paths} tone={tone} crease={crease} inner={inner} />;

  const bench = benchArt(
    {
      plate: PLATE,
      label: { x: PLATE.x + 8, y: -20, w: 15, d: 40, r: 2 },
      labelAlong: "y",
      ruler: { x0: track.x0, x1: track.x1, y: TRACK_Y + 9 },
    },
    P,
  );

  // A housing: foot flange, cast body with a seam and a finned panel on its front, a lid, a bay for cartridges.
  // A rating plate riveted to a housing's end face, with rule lines standing for its printed text.
  function facePlate(x: number, y0: number, y1: number, z0: number, z1: number) {
    const rect: Across[] = [
      [y0, z0],
      [y1, z0],
      [y1, z1],
      [y0, z1],
    ];
    const rows = [0, 1, 2].map((row) => k.segment([x + 0.6, y0 + 2.4, z1 - 2 - row * 1.9], [x + 0.6, y1 - (row === 1 ? 6 : 2.6), z1 - 2 - row * 1.9], P)).join("");
    return (
      <g>
        {S(prismAlong("x", rect, x, x + 0.6, P), "lo", "none")}
        <Line d={rows} tone="lo" free />
        <Dots points={[at([x + 0.6, y0 + 1.2, z0 + 1.2]), at([x + 0.6, y1 - 1.2, z0 + 1.2])]} size={0.38} tone="mid" />
      </g>
    );
  }

  // A blank lid: an inspection cover and a breather, so a housing with no cartridges isn't a bare top.
  function blankLid(x0: number, L: number, top: number) {
    const cover: Plan = { x: x0 + L / 2 - 13, y: -11, w: 26, d: 22, r: 2.5 };
    const screws = k.corners(cover, 2.4);
    const bx = x0 + 7;
    const by = -14;
    return (
      <g>
        {S(k.slabOf(cover, top, 1.4, P, 4, 0.5), "mid")}
        <Dots points={screws.map(([x, y]) => at([x, y, top + 1.4]))} size={0.45} tone="mid" />
        <Line d={k.planOutline(k.insetPlan(cover, 4), top + 1.4, P, 4)} tone="faint" />
        {S(k.cylinder(bx, by, 1.6, top, 2.2, P, 14), "mid", "none")}
        {S(k.cylinder(bx, by, 2.6, top + 2.2, 2.6, P, 22), "mid")}
        <Line d={k.knurl(bx, by, 2.6, top + 2.2, top + 4.8, 16, P)} tone="lo" />
      </g>
    );
  }

  function housing(x0: number, L: number, half: number, top: number, extra: React.ReactNode) {
    const flange: Plan = { x: x0 - 4, y: -half - 4, w: L + 8, d: half * 2 + 8, r: 3 };
    const body: Plan = { x: x0, y: -half, w: L, d: half * 2, r: 5 };
    const lid: Plan = k.insetPlan(body, 1);
    const flangeBolts = k.corners(flange, 3.6);
    const panel = { x0: x0 + 7, x1: x0 + L - 7, z0: 13, z1: top - 9 };
    const fins: string[] = [];
    for (let x = panel.x0 + 4; x <= panel.x1 - 3.9; x += 4) fins.push(k.segment([x, half, panel.z0], [x, half, panel.z1], P));
    const panelLine = k.pathOf(
      [
        [panel.x0, half, panel.z0],
        [panel.x1, half, panel.z0],
        [panel.x1, half, panel.z1],
        [panel.x0, half, panel.z1],
      ].map((point) => at(point as k.Point3)),
      true,
    );
    const lidScrews: k.Plane[] = [...k.corners(lid, 3.4), [x0 + L / 2, -half + 2.4], [x0 + L / 2, half - 2.4]];
    const faceScrews = [at([x0 + L, -half + 4, 8]), at([x0 + L, half - 4, 8]), at([x0 + L, -half + 4, top - 5]), at([x0 + L, half - 4, top - 5])];
    return (
      <g>
        {S(k.slabOf(flange, 0, 3, P, 4, 0.5), "lo")}
        <Line d={flangeBolts.map(([x, y]) => k.ring(x, y, 1.7, 3, P, 14)).join("")} tone="lo" />
        <Dots points={flangeBolts.map(([x, y]) => at([x, y, 3]))} size={0.5} tone="mid" />
        {S(k.slabOf(body, 3, top - 3, P, 6, 0.8), "mid", "faint", <Line d={k.sideSeam(body, 12, P, 6)} tone="faint" />)}
        <Line d={panelLine} tone="lo" />
        <Line d={fins.join("")} tone="faint" />
        <Dots points={faceScrews} size={0.45} tone="mid" />
        {S(k.slabOf(lid, top, 3, P, 6, 0.6), "mid")}
        <Line d={lidScrews.map(([x, y]) => k.ring(x, y, 1.5, top + 3, P, 14)).join("")} tone="lo" />
        <Dots points={lidScrews.map(([x, y]) => at([x, y, top + 3]))} size={0.45} tone="mid" />
        <Line d={k.planOutline({ x: x0 + 6, y: -half + 6, w: L - 12, d: half * 2 - 12, r: 2 }, top + 3, P)} tone="faint" />
        {extra}
      </g>
    );
  }

  // A cartridge: one of a system's parts, seated in its housing's lid.
  function cartridge(cx: number, z: number) {
    const body: Plan = { x: cx - CART / 2, y: -15, w: CART, d: 30, r: 2 };
    const zTop = z + 11;
    const window: Plan = { x: cx - 5.5, y: -12.5, w: 11, d: 10, r: 1 };
    const rule = [0, 1, 2].map((row) => k.lineOnTop([cx - 3.6 + row * 2.4, window.y + 2], [cx - 3.6 + row * 2.4, window.y + window.d - (row === 1 ? 4 : 2.2)], zTop + 0.5, P)).join("");
    return (
      <g>
        {S(k.slabOf(body, z, 11, P, 4, 0.6), "hi", "lo", <Line d={k.sideSeam(body, z + 3, P, 4)} tone="faint" />)}
        <Line d={k.planOutline(k.insetPlan(body, 1.8), zTop, P, 4)} tone="faint" />
        {S(k.slabOf(window, zTop, 0.5, P, 3), "lo", "none")}
        <Line d={rule} tone="lo" free />
        <Dots points={[at([cx - 5, 11.6, zTop]), at([cx + 5, 11.6, zTop])]} size={0.42} tone="mid" />
        <Dots points={[at([cx + 4.6, -1.2, zTop])]} size={0.7} tone="hi" />
        {S(k.cylinder(cx, 5.5, 3.2, zTop, 3.6, P, 24), "mid")}
        <Line d={k.knurl(cx, 5.5, 3.2, zTop, zTop + 3.6, 22, P)} tone="lo" />
        <Line d={k.ring(cx, 5.5, 1.5, zTop + 3.6, P, 14)} tone="lo" />
      </g>
    );
  }

  // A pillow-block bearing: base, hold-down bolts, pedestal, bearing housing, grease nipple.
  function pillow(xp: number) {
    const base: Plan = { x: xp - 8, y: -20, w: 16, d: 40, r: 2.5 };
    const pedestal: Plan = { x: xp - 6, y: -11, w: 12, d: 22, r: 1.5 };
    const bolts = ([-15, 15] as const).map((y) => [xp, y] as k.Plane);
    const balls: k.Flat[] = Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2;
      return at([xp + 6.5, 6.1 * Math.cos(angle), H + 6.1 * Math.sin(angle)]);
    });
    return (
      <g>
        {S(k.slabOf(base, 0, 4, P, 4, 0.5), "mid")}
        {bolts.map(([x, y], i) => (
          <g key={i}>
            {S(k.cylinder(x, y, 3, 4, 0.6, P, 20), "lo")}
            {S(k.cylinder(x, y, 2.2, 4.6, 1.8, P, 6), "mid")}
          </g>
        ))}
        <Dots points={bolts.map(([x, y]) => at([x, y, 6.4]))} size={0.45} tone="mid" />
        {S(k.slabOf(pedestal, 4, H - 8, P, 3, 0.5), "hi", "lo", <Line d={k.sideSeam(pedestal, 8, P, 3)} tone="faint" />)}
        {S(drum("x", 0, H, 10.5, xp - 6.5, xp + 6.5, P, 40), "hi", "lo", <Line d={drumArc("x", xp, 0, H, 10.5, P)} tone="faint" />)}
        <Line d={faceRing("x", xp + 6.5, 0, H, 7.6, P, 36)} tone="lo" />
        <Line d={faceRing("x", xp + 6.5, 0, H, 4.8, P, 28)} tone="faint" />
        <Dots points={balls} size={0.55} tone="lo" />
        {S(k.cylinder(xp, 0, 1.6, H + 10.3, 1.4, P, 6), "mid")}
        {S(k.cylinder(xp, 0, 1.1, H + 11.7, 1.8, P, 14), "mid", "none")}
        {S(k.cylinder(xp, 0, 1.5, H + 13.5, 1, P, 14), "mid")}
      </g>
    );
  }

  const shaft = (x0: number, x1: number) => S(drum("x", 0, H, SHAFT_R, x0, x1, P, 24), "mid", "none");
  const collar = (x0: number) => S(drum("x", 0, H, 4.8, x0, x0 + 3, P, 28), "mid", "lo");

  const housingA = housing(xA0, LA, 22, 42, (
    <g>
      {facePlate(xA1, -18, -6, 31, 38)}
      {nA === 0 ? blankLid(xA0, LA, 45) : null}
      {S(drum("x", 0, H, 6.5, xA1, xA1 + 3, P, 32), "mid")}
      <Line d={faceRing("x", xA1 + 3, 0, H, 4.4, P, 28)} tone="lo" />
    </g>
  ));

  const cartsA = Array.from({ length: nA }, (_, i) => ({ slot: `a_part:${i}`, art: cartridge(cartX(xA0, LA, nA, i), 45) }));

  const driveA = (
    <g>
      {shaft(xA1 + 3, xPa - 6.5)}
      <SlotG slot="a_port">{pillow(xPa)}</SlotG>
    </g>
  );
  const seg2 = (
    <g>
      {shaft(xPa + 6.5, xC - 13)}
      {collar(xPa + 6.5)}
    </g>
  );

  const couplingBack = (
    <g>
      {S(drum("x", 0, H, 7.5, xC - 13, xC - 4, P, 32), "hi", "lo", <Line d={drumArc("x", xC - 8.5, 0, H, 7.5, P)} tone="faint" />)}
      {S(drum("x", 0, H, 12.5, xC - 4, xC - 1, P, 48), "hi", "lo")}
      {S(drum("x", 0, H, 11.4, xC - 1, xC + 1, P, 44), "lo", "none")}
      {S(drum("x", 0, H, 12.5, xC + 1, xC + 4, P, 48), "hi", "lo")}
      <Line d={faceRing("x", xC + 4, 0, H, 10, P, 44)} tone="faint" />
    </g>
  );
  const couplingFront = (
    <g>
      {S(drum("x", 0, H, 7.5, xC + 4, xC + 13, P, 32), "hi", "lo", <Line d={drumArc("x", xC + 8.5, 0, H, 7.5, P)} tone="faint" />)}
      <Line d={faceRing("x", xC + 13, 0, H, SHAFT_R + 0.35, P, 24)} tone="lo" />
    </g>
  );

  const seg3 = shaft(xC + 13, xPb - 6.5);

  const driveB = (
    <g>
      <SlotG slot="b_port">{pillow(xPb)}</SlotG>
      {shaft(xPb + 6.5, xB0 - 3)}
      {S(drum("x", 0, H, 6.5, xB0 - 3, xB0, P, 32), "mid")}
    </g>
  );

  // B's sight glass on its front, and the cover on its far end.
  const glassX = xB0 + LB * 0.3;
  const housingB = housing(xB0, LB, 24, 46, (
    <g>
      {facePlate(xB1, -11, 11, 37, 43)}
      {nB === 0 ? blankLid(xB0, LB, 49) : null}
      {S(drum("y", glassX, 22, 5.2, 24, 25.4, P, 32), "mid")}
      <Line d={faceRing("y", 25.4, glassX, 22, 3.6, P, 28)} tone="lo" />
      <Line d={k.segment([glassX - Math.sqrt(3.6 ** 2 - 0.8 ** 2), 25.4, 21.2], [glassX + Math.sqrt(3.6 ** 2 - 0.8 ** 2), 25.4, 21.2], P)} tone="faint" />
    </g>
  ));
  const coverBolts: k.Flat[] = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    return at([xB1 + 2.2, 7 * Math.cos(angle), H + 7 * Math.sin(angle)]);
  });
  const housingBFront = (
    <g>
      {S(drum("x", 0, H, 9.5, xB1, xB1 + 2.2, P, 40), "mid")}
      <Line d={faceRing("x", xB1 + 2.2, 0, H, 3, P, 24)} tone="lo" />
      <Dots points={coverBolts} size={0.5} tone="mid" />
    </g>
  );
  const cartsB = Array.from({ length: nB }, (_, i) => ({ slot: `b_part:${i}`, art: cartridge(cartX(xB0, LB, nB, i), 49) }));

  // The front track: a rail with end stops; the puck's carriage rides it.
  const rail: Plan = { x: track.x0, y: TRACK_Y - 2.5, w: track.x1 - track.x0, d: 5, r: 1 };
  const trackArt = (
    <g>
      {S(k.slabOf(rail, 0, 2, P, 3, 0.4), "mid")}
      <Line d={k.planOutline({ x: rail.x + 3, y: TRACK_Y - 0.7, w: rail.w - 6, d: 1.4, r: 0.7 }, 2, P, 3)} tone="faint" />
      {[track.x0 - 3, track.x1].map((x, i) => (
        <g key={i}>
          {S(k.slabOf({ x, y: TRACK_Y - 4.5, w: 3, d: 9, r: 0.8 }, 0, 5, P, 3, 0.4), "mid")}
          <Dots points={[at([x + 1.5, TRACK_Y - 2.4, 5]), at([x + 1.5, TRACK_Y + 2.4, 5])]} size={0.42} tone="mid" />
        </g>
      ))}
    </g>
  );
  const carriage: Plan = { x: -6.5, y: TRACK_Y - 4.5, w: 13, d: 9, r: 2 };
  const puck = (
    <g>
      {S(k.slabOf(carriage, 2, 2.4, P, 4, 0.4), "mid")}
      <Dots points={[at([-4.4, TRACK_Y - 2.6, 4.4]), at([4.4, TRACK_Y - 2.6, 4.4])]} size={0.4} tone="mid" />
      {S(k.slabOf({ x: -0.9, y: TRACK_Y + 4.5, w: 1.8, d: 4.2, r: 0.4 }, 2, 0.9, P, 2), "mid", "none")}
      {S(k.cylinder(0, TRACK_Y, 4.2, 4.4, 3.4, P, 32, 0.5), "hi", "lo")}
      <Line d={k.ring(0, TRACK_Y, 2.6, 7.8, P, 24)} tone="lo" />
      <Dots points={[at([0, TRACK_Y, 7.8])]} size={0.6} tone="hi" />
    </g>
  );

  const model: CouplingModel = {
    id,
    P,
    height,
    slotX,
    flow,
    xC,
    xPa,
    xPb,
    hubIn: xC - 13,
    trackY: TRACK_Y,
    art: { bench, housingA, cartsA, driveA, seg2, couplingBack, couplingFront, seg3, driveB, housingB, cartsB, housingBFront, track: trackArt, puck },
    label: `A drivetrain on a bench: system A's housing${nA ? ` with ${nA} cartridge${nA > 1 ? "s" : ""}` : ""}, its bearing, a keyed flange coupling, system B's bearing and B's housing${nB ? ` with ${nB} cartridge${nB > 1 ? "s" : ""}` : ""}. A puck on the front track marks the lit part.`,
  };
  return model;
}

const keyProfile = (angle: number): Across[] => {
  const d: [number, number] = [Math.cos(angle), Math.sin(angle)];
  const t: [number, number] = [-Math.sin(angle), Math.cos(angle)];
  const corner = (r: number, s: number): Across => [d[0] * r + t[0] * s, H + d[1] * r + t[1] * s];
  return [corner(SHAFT_R - 0.7, -1.7), corner(SHAFT_R - 0.7, 1.7), corner(SHAFT_R + 2.3, 1.7), corner(SHAFT_R + 2.3, -1.7)];
};

const nutProfile = (cy: number, cz: number): Across[] =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    return [cy + 1.6 * Math.cos(angle), cz + 1.6 * Math.sin(angle)] as Across;
  });

/** Where the key rests: on the shaft's upper near side, so it reads at every step. */
const KEY_REST = (62 * Math.PI) / 180;

export interface MachineViewProps {
  stepIndex: number;
  lit: SlotKey | null;
  fails: boolean;
  visible: boolean;
}

export function CouplingView({ model, stepIndex, lit, visible }: MachineViewProps & { model: CouplingModel }) {
  const { P, xC } = model;
  const keyFront = React.useRef<LiveSolidApi | null>(null);
  const keyBack = React.useRef<LiveSolidApi | null>(null);
  const nuts = React.useRef<React.RefObject<LiveSolidApi | null>[]>(Array.from({ length: NUTS }, () => ({ current: null })));
  const puck = React.useRef<SVGGElement | null>(null);
  const screw = React.useRef<SVGCircleElement | null>(null);
  const collarScrew = React.useRef<SVGCircleElement | null>(null);
  const stripe = React.useRef<SVGPathElement | null>(null);
  const lifts = React.useRef(new Map<SlotKey, SVGGElement | null>());
  const keyRank = model.flow.indexOf("key");
  const litRank = lit ? model.flow.indexOf(lit) : -1;

  const state = React.useRef({ spin: { x: 0, v: 0 }, spinTarget: 0, puck: NaN, engaged: 0, lift: new Map<SlotKey, number>(), lastStep: stepIndex, drawn: false });
  const targets = React.useRef({ puck: model.slotX.get(lit ?? "") ?? model.slotX.get(model.flow[0]!) ?? 0, engaged: litRank >= keyRank ? 1 : 0, lit });
  targets.current = {
    puck: (lit ? model.slotX.get(lit) : undefined) ?? targets.current.puck,
    engaged: litRank >= keyRank ? 1 : 0,
    lit,
  };
  if (state.current.lastStep !== stepIndex) {
    state.current.lastStep = stepIndex;
    state.current.spinTarget += Math.PI * 2;
  }
  if (Number.isNaN(state.current.puck)) state.current.puck = targets.current.puck;

  const view = viewOf(P);
  const draw = React.useCallback(() => {
    const s = state.current;
    const turn = s.spin.x;
    // The key: rebuilt at its angle, drawn in front of the shaft or behind it.
    const keyAngle = KEY_REST + turn;
    const x0 = model.hubIn - 4 - KEY_TRAVEL * (1 - s.engaged);
    const paths = prismAlong("x", keyProfile(keyAngle), x0, x0 + KEY_LEN, P);
    const front = facesViewer("x", keyAngle, P, 0);
    keyFront.current?.set(front ? paths : null);
    keyBack.current?.set(front ? null : paths);
    // Nuts on the coupling's near flange, turning with it.
    nuts.current.forEach((api, i) => {
      const angle = turn + (i / NUTS) * Math.PI * 2;
      const cy = 10 * Math.cos(angle);
      const cz = H + 10 * Math.sin(angle);
      api.current?.set(prismAlong("x", nutProfile(cy, cz), xC + 4, xC + 5.4, P));
    });
    // Set screws and the shaft's paint line fade at the limb instead of popping.
    const fade = (angle: number) => {
      const normal = [0, Math.cos(angle), Math.sin(angle)];
      const facing = normal[0]! * view[0] + normal[1]! * view[1] + normal[2]! * view[2];
      return Math.max(0, Math.min(1, facing / 0.3));
    };
    const place = (node: SVGCircleElement | null, along: number, r: number, angle: number) => {
      if (!node) return;
      const [x, y] = k.iso(onDrum("x", along, 0, H, r, angle), P);
      node.setAttribute("cx", x.toFixed(1));
      node.setAttribute("cy", y.toFixed(1));
      node.style.opacity = fade(angle).toFixed(2);
    };
    place(screw.current, xC + 8.5, 7.5, turn + 0.4);
    place(collarScrew.current, model.xPa + 8, 4.8, turn + 1.9);
    if (stripe.current) {
      const angle = turn + 2.6;
      stripe.current.setAttribute("d", k.pathOf([k.iso(onDrum("x", xC + 13, 0, H, SHAFT_R, angle), P), k.iso(onDrum("x", model.xPb - 6.5, 0, H, SHAFT_R, angle), P)]));
      stripe.current.style.opacity = fade(angle).toFixed(2);
    }
    puck.current?.setAttribute("transform", k.translateAlong(P, [s.puck, 0, 0]));
    for (const [slot, node] of lifts.current) node?.setAttribute("transform", k.translateAlong(P, [0, 0, s.lift.get(slot) ?? 0]));
  }, [P, model, xC, view]);

  const kick = useFrameLoop((dt, calm) => {
    const s = state.current;
    const t = targets.current;
    const spinning = settle(s.spin, s.spinTarget, dt, 0.32, calm);
    s.puck = follow(s.puck, t.puck, dt, 0.26, calm);
    s.engaged = follow(s.engaged, t.engaged, dt, 0.22, calm);
    let lifting = false;
    for (const slot of lifts.current.keys()) {
      const goal = slot === t.lit ? LIFT : 0;
      const now = follow(s.lift.get(slot) ?? 0, goal, dt, 0.22, calm);
      s.lift.set(slot, now);
      if (now !== goal) lifting = true;
    }
    draw();
    return spinning || lifting || s.puck !== t.puck || s.engaged !== t.engaged;
  }, visible);

  React.useLayoutEffect(() => {
    draw();
  }, [draw]);
  React.useEffect(() => {
    kick();
  }, [stepIndex, lit, kick]);

  const liftRef = (slot: SlotKey) => (node: SVGGElement | null) => {
    if (node) lifts.current.set(slot, node);
    else lifts.current.delete(slot);
  };

  const { art } = model;
  return (
    <svg className="iso-svg g-machine" viewBox={`0 0 ${WIDTH} ${model.height}`} role="img" aria-label={model.label} focusable="false">
      {art.bench}
      {art.housingA}
      {art.cartsA.map(({ slot, art: cart }) => (
        <SlotG key={slot} slot={slot}>
          <g ref={liftRef(slot)}>{cart}</g>
        </SlotG>
      ))}
      {art.driveA}
      <SlotG slot="key" decor>
        <LiveSolid api={keyBack} tone="hi" crease="lo" />
      </SlotG>
      {art.seg2}
      <circle ref={collarScrew} className="g-screw" r={0.7} cx={0} cy={0} />
      <SlotG slot="key">
        <LiveSolid api={keyFront} tone="hi" crease="lo" />
      </SlotG>
      <SlotG slot="adapter">
        {art.couplingBack}
        {nuts.current.map((api, i) => (
          <LiveSolid key={i} api={api} tone="mid" crease="faint" />
        ))}
        {art.couplingFront}
        <circle ref={screw} className="g-screw" r={0.9} cx={0} cy={0} />
      </SlotG>
      {art.seg3}
      <path ref={stripe} className="iso-line" data-tone="lo" d="" />
      {art.driveB}
      {art.housingB}
      {art.cartsB.map(({ slot, art: cart }) => (
        <SlotG key={slot} slot={slot}>
          <g ref={liftRef(slot)}>{cart}</g>
        </SlotG>
      ))}
      {art.housingBFront}
      {art.track}
      <g ref={puck}>{art.puck}</g>
    </svg>
  );
}

export const couplingSlotsFor = (counts: Partial<Record<string, number>>) => couplingModel(counts.a_part ?? 0, counts.b_part ?? 0);
export const COUPLING_ORDER = MACHINES.Coupling.order;
export { FigureContext };
