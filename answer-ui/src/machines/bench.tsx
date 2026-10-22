// The heavy base every machine stands on: plate on four feet, groove, corner screws, a label plate and a
// ruler strip. Shared so both machines read as the same bench.
import * as React from "react";
import * as k from "../vendor/anatomy/iso-kit";
import { Dots, Line, Solid } from "../vendor/anatomy/react/draw";

export const PLATE_H = 10;
export const FOOT_H = 5;

type P = k.Projection;

export interface BenchSpec {
  plate: k.Plan;
  label: k.Plan;
  /** Label rule lines run along x ("x") or along y ("y"). */
  labelAlong: "x" | "y";
  ruler?: { x0: number; x1: number; y: number };
}

const byDepth = (points: k.Plane[], P: P) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

export function benchArt({ plate, label, labelAlong, ruler }: BenchSpec, P: P) {
  const at = (point: k.Point3) => k.iso(point, P);
  const feet = byDepth(k.corners(plate, 22), P);
  const screws = k.corners(plate, 10);
  const rule: string[] = [];
  if (labelAlong === "y") {
    [0, 1, 2].forEach((row) => {
      const x = label.x + 4 + row * 2.6;
      rule.push(k.lineOnTop([x, label.y + 6], [x, label.y + label.d - (row === 1 ? 14 : 8)], 0.8, P));
    });
  } else {
    [0, 1, 2].forEach((row) => {
      const y = label.y + 3.4 + row * 2.2;
      rule.push(k.lineOnTop([label.x + 7, y], [label.x + label.w - (row === 1 ? 16 : 9), y], 0.8, P));
    });
  }
  const labelScrews =
    labelAlong === "y"
      ? [at([label.x + label.w / 2, label.y + 2.8, 0.8]), at([label.x + label.w / 2, label.y + label.d - 2.8, 0.8])]
      : [at([label.x + 2.8, label.y + label.d / 2, 0.8]), at([label.x + label.w - 2.8, label.y + label.d / 2, 0.8])];
  let rulerArt: React.ReactNode = null;
  if (ruler) {
    const strip: k.Plan = { x: ruler.x0, y: ruler.y, w: ruler.x1 - ruler.x0, d: 6, r: 1 };
    const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 4, 5, strip.y, 0.6, [2, 3.4], P);
    rulerArt = (
      <g key="ruler">
        <Solid paths={k.slabOf(strip, 0, 0.6, P, 3)} tone="lo" crease="none" />
        <Line d={ticks.minor} tone="lo" />
        <Line d={ticks.major} tone="mid" />
        <Dots points={[at([strip.x + 1.6, strip.y + 4.4, 0.6]), at([strip.x + strip.w - 1.6, strip.y + 4.4, 0.6])]} size={0.42} tone="mid" />
      </g>
    );
  }
  return (
    <g key="bench">
      <path className="iso-halo" d={k.haloOf(plate, -PLATE_H - FOOT_H, PLATE_H, P)} />
      {feet.map(([x, y], index) => (
        <g key={index}>
          <Solid paths={k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28)} tone="lo" />
          <Solid paths={k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28)} tone="mid" />
        </g>
      ))}
      <Solid paths={k.slabOf(plate, -PLATE_H, PLATE_H, P, 8, 1.6)} tone="mid" />
      <Line d={k.planOutline(k.insetPlan(plate, 5), 0, P)} tone="lo" />
      <Line d={screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join("")} tone="lo" />
      <Dots points={screws.map(([x, y]) => at([x, y, 0]))} size={0.5} tone="mid" />
      <Solid paths={k.slabOf(label, 0, 0.8, P, 4)} tone="lo" crease="none" />
      <Line d={k.planOutline(k.insetPlan(label, 1.6), 0.8, P)} tone="faint" />
      <Line d={rule.join("")} tone="lo" free />
      <Dots points={labelScrews} size={0.45} tone="mid" />
      {rulerArt}
    </g>
  );
}

export const benchPoints = (plate: k.Plan): k.Point3[] => k.boxCorners(plate, -PLATE_H - FOOT_H, 0);

/** Fit to a fixed width and let the height follow the machine, so a long machine gets no dead band. */
export function fitTight(points: k.Point3[], width: number, azimuth: number, pad = 22, limits: [number, number] = [230, 380]) {
  const unit: k.Projection = { origin: [0, 0], scale: 1, azimuth };
  const flat = points.map((point) => k.iso(point, unit));
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const scale = (width - pad * 2) / (Math.max(...xs) - Math.min(...xs));
  const height = Math.round(Math.min(limits[1], Math.max(limits[0], (Math.max(...ys) - Math.min(...ys)) * scale + pad * 2)));
  return { P: k.fitProjection(points, width, height, { pad, azimuth }), height };
}
