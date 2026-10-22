// Solids the kit's `extrude` can't make: prisms along x or y (shafts, drums, hubs, keys) and any convex
// polyhedron (a flap turned on its hinge). They return the kit's SolidPaths, so <Solid> paints them the same
// way: paper fill, four side tones by facing, a lighter top, crease, outline.
import { cameraOf, iso, pathOf, type Flat, type Point3, type Projection, type SolidPaths, SHADES } from "../vendor/anatomy/iso-kit";

export type V3 = Point3;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** World direction toward the viewer (larger depth = nearer). */
export function viewOf(P: Projection): V3 {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  return [cosA * cosE, sinA * cosE, sinE];
}

function hull(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const turn = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Flat[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Flat[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!;
    while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Tone of a visible face: the kit lights sides from (−sin a, cos a); faces that look up are tops. */
function toneOf(normal: V3, P: Projection): number | "top" {
  if (normal[2] > 0.62) return "top";
  const { sinA, cosA } = cameraOf(P);
  const horizontal = Math.hypot(normal[0], normal[1]);
  const side = horizontal > 1e-6 ? (normal[0] * -sinA + normal[1] * cosA) / horizontal : 0;
  const lit = (side + 1) / 2 + normal[2] * 0.32;
  return Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
}

export interface PolyOptions {
  /** Draw creases between visible faces that meet at more than this angle (degrees). */
  creaseAngle?: number;
  /** Faces whose shared edges never crease (a round surface made of facets). */
  smoothGroup?: (face: number) => number | null;
}

/** Any convex polyhedron: vertices plus faces as vertex loops (any winding). */
export function polySolid(vertices: V3[], faces: number[][], P: Projection, options: PolyOptions = {}): SolidPaths {
  const view = viewOf(P);
  const centre: V3 = vertices.reduce<V3>((sum, v) => [sum[0] + v[0] / vertices.length, sum[1] + v[1] / vertices.length, sum[2] + v[2] / vertices.length], [0, 0, 0]);
  const flat = vertices.map((v) => iso(v, P));
  const normals = faces.map((face) => {
    const a = vertices[face[0]!]!;
    let normal: V3 = [0, 0, 0];
    for (let index = 1; index + 1 < face.length; index++) {
      const n = cross(sub(vertices[face[index]!]!, a), sub(vertices[face[index + 1]!]!, a));
      normal = [normal[0] + n[0], normal[1] + n[1], normal[2] + n[2]];
    }
    normal = unit(normal);
    const middle: V3 = face.reduce<V3>((sum, i) => [sum[0] + vertices[i]![0] / face.length, sum[1] + vertices[i]![1] / face.length, sum[2] + vertices[i]![2] / face.length], [0, 0, 0]);
    return dot(normal, sub(middle, centre)) < 0 ? ([-normal[0], -normal[1], -normal[2]] as V3) : normal;
  });
  const visible = normals.map((normal) => dot(normal, view) > 1e-6);
  const buckets: string[][] = Array.from({ length: SHADES }, () => []);
  const tops: string[] = [];
  faces.forEach((face, index) => {
    if (!visible[index]) return;
    const d = pathOf(face.map((i) => flat[i]!), true);
    const tone = toneOf(normals[index]!, P);
    if (tone === "top") tops.push(d);
    else buckets[tone]!.push(d);
  });
  const limit = Math.cos(((options.creaseAngle ?? 20) * Math.PI) / 180);
  const edges = new Map<string, number[]>();
  faces.forEach((face, index) => {
    face.forEach((a, k) => {
      const b = face[(k + 1) % face.length]!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, [...(edges.get(key) ?? []), index]);
    });
  });
  const crease: string[] = [];
  for (const [key, owners] of edges) {
    if (owners.length !== 2) continue;
    const [f, g] = owners as [number, number];
    if (!visible[f] || !visible[g]) continue;
    const group = options.smoothGroup;
    if (group && group(f) !== null && group(f) === group(g)) continue;
    if (dot(normals[f]!, normals[g]!) > limit) continue;
    const [a, b] = key.split("-").map(Number) as [number, number];
    crease.push(pathOf([flat[a]!, flat[b]!]));
  }
  const outline = pathOf(hull(flat), true);
  return { fill: outline, outline, crease: crease.join(""), top: tops.join(""), shades: buckets.map((list) => list.join("")), seamless: true };
}

export type Axis = "x" | "y";
/** A 2D profile point across the axis: for "x" it is (y, z), for "y" it is (x, z). */
export type Across = [number, number];

const place = (axis: Axis, along: number, [u, v]: Across): V3 => (axis === "x" ? [along, u, v] : [u, along, v]);

/** A prism along x or y: a convex profile across the axis, from `a` to `b`. */
export function prismAlong(axis: Axis, profile: Across[], a: number, b: number, P: Projection, round = false): SolidPaths {
  const count = profile.length;
  const vertices = [...profile.map((p) => place(axis, a, p)), ...profile.map((p) => place(axis, b, p))];
  const sides = profile.map((_, i) => [i, (i + 1) % count, count + ((i + 1) % count), count + i]);
  const caps = [profile.map((_, i) => i), profile.map((_, i) => count + i)];
  const faces = [...sides, ...caps];
  return polySolid(vertices, faces, P, { creaseAngle: round ? 89 : 20, smoothGroup: round ? (face) => (face < count ? 0 : null) : undefined });
}

export const circleAcross = (cu: number, cv: number, r: number, steps = 28, phase = 0): Across[] =>
  Array.from({ length: steps }, (_, i) => {
    const angle = phase + (i / steps) * Math.PI * 2;
    return [cu + r * Math.cos(angle), cv + r * Math.sin(angle)] as Across;
  });

/** A round drum along x or y: the shafts, hubs, rollers and bearing housings. */
export const drum = (axis: Axis, cu: number, cv: number, r: number, a: number, b: number, P: Projection, steps = 28) =>
  prismAlong(axis, circleAcross(cu, cv, r, steps), a, b, P, true);

/** A ring on a face across the axis (a bore, a bolt circle, a seal line). */
export function faceRing(axis: Axis, at: number, cu: number, cv: number, r: number, P: Projection, steps = 32) {
  return pathOf(
    circleAcross(cu, cv, r, steps).map((p) => iso(place(axis, at, p), P)),
    true,
  );
}

/** The near half of a ring round a drum (a seam or band on its side), ending on the drum's silhouette. */
export function drumArc(axis: Axis, at: number, cu: number, cv: number, r: number, P: Projection, steps = 24) {
  const view = viewOf(P);
  const facing = Math.atan2(view[2], axis === "x" ? view[1] : view[0]);
  const points: Flat[] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
    points.push(iso(place(axis, at, [cu + r * Math.cos(angle), cv + r * Math.sin(angle)]), P));
  }
  return pathOf(points);
}

/** A point on a drum's surface at angle θ (0 = toward +y for an x drum, toward +x for a y drum; π/2 = up). */
export const onDrum = (axis: Axis, along: number, cu: number, cv: number, r: number, angle: number): V3 =>
  place(axis, along, [cu + r * Math.cos(angle), cv + r * Math.sin(angle)]);

/** Is a point on a drum at angle θ on the side that faces the viewer? */
export function facesViewer(axis: Axis, angle: number, P: Projection, margin = 0) {
  const view = viewOf(P);
  const normal: V3 = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
  return dot(normal, view) > margin;
}

/** A box given by its eight corners (any orientation, e.g. a flap turned on its hinge). */
export function boxOf(corners: V3[], P: Projection) {
  // corners: bottom ring a b c d, then top ring e f g h, in the same order.
  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  return polySolid(corners, faces, P, { creaseAngle: 20 });
}

/** Convex polygon clip (Sutherland–Hodgman), in screen space. */
export function clipConvex(subject: Flat[], clip: Flat[]): Flat[] {
  let output = subject;
  const inside = (p: Flat, a: Flat, b: Flat) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
  const orient = (poly: Flat[]) => {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      area += a[0] * b[1] - b[0] * a[1];
    }
    return area < 0 ? [...poly].reverse() : poly;
  };
  const edgeList = orient(clip);
  for (let i = 0; i < edgeList.length && output.length; i++) {
    const a = edgeList[i]!;
    const b = edgeList[(i + 1) % edgeList.length]!;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const pIn = inside(p, a, b);
      const qIn = inside(q, a, b);
      if (pIn) output.push(p);
      if (pIn !== qIn) {
        const d = (b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]);
        const t = d === 0 ? 0 : ((b[0] - a[0]) * (a[1] - p[1]) - (b[1] - a[1]) * (a[0] - p[0])) / d;
        output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return output;
}
