// A Puzzle node as the page draws it: its pieces resolved against the ref table, its joints and steps as
// indexes, and every problem with the statement id to fix. The component draws what's valid; validation reports
// the problems to the model (in English: only the model reads them).
import type { ElementNode } from "@openuidev/lang-core";
import { tileRows, type TileRow } from "../curate";
import { resolveRef, type RefEntry, type RefTable } from "../refs";
import { kindLabel } from "../strings";

export const PIECE_TYPES = ["Piece", "NewPiece", "Idea"] as const;
export type PieceType = (typeof PIECE_TYPES)[number];
export const PUZZLE_LIMITS = { pieces: [2, 6], projects: 3, newPieces: 2, steps: [1, 6], loose: 1 } as const;

export interface PuzzlePiece {
  id: string;
  type: PieceType;
  name: string;
  /** The project (repo) the piece belongs to; "" for an Idea. */
  band: string;
  /** Project colour 1–4, or 0 for none. */
  tint: number;
  kind: string;
  note: string;
  /** A Piece's ref, resolved: what it opens and the lines it shows. */
  ref?: { entry: RefEntry; from: number; to: number; line: number };
  /** The real lines the tile shows: where this piece hands work to the next (curate.ts), and the name it calls. */
  rows: TileRow[];
  call: string;
  /** A NewPiece: its proposed path and the ref it adapts. */
  path: string;
  adapts?: RefEntry;
}

export interface PuzzleJoint {
  id: string;
  from: number;
  to: number;
  label: string;
}

export interface PuzzleStep {
  id: string;
  lit: { piece: number } | { joint: number } | null;
  text: string;
}

export interface PuzzleModel {
  title: string;
  caption: string;
  pieces: PuzzlePiece[];
  joints: PuzzleJoint[];
  steps: PuzzleStep[];
  problems: { id: string; message: string }[];
}

const isElement = (value: unknown): value is ElementNode => Boolean(value && typeof value === "object" && (value as ElementNode).type === "element");
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
export const basename = (path: string) => path.split("/").pop() ?? path;

/** What a ref's first lines say it is, when the model didn't say. */
function kindFromCode(entry: RefEntry, name: string) {
  const head = entry.text.split("\n").find((line) => line.trim()) ?? "";
  if (/^\s*(export\s+)?(abstract\s+)?class\s/.test(head)) return "clase";
  if (/^\s*(async\s+)?(def|func|fn|function)\s/.test(head)) return name.includes(".") ? "método" : "función";
  return "";
}

/** Project colour for a repo: the tint Swift gave its refs. */
export function tintOf(repo: string, refs: RefTable) {
  for (const entry of refs.values()) if (entry.repo === repo) return ((entry.tint ?? 0) % 4) + 1;
  return 0;
}

export function readPuzzle(node: ElementNode, refs: RefTable): PuzzleModel {
  const owner = node.statementId ?? "root";
  const problems: PuzzleModel["problems"] = [];
  const add = (id: string | undefined, message: string) => problems.push({ id: id ?? owner, message });
  const props = node.props;
  const rawPieces = (Array.isArray(props.pieces) ? props.pieces : []).filter(isElement);
  const rawJoints = (Array.isArray(props.joints) ? props.joints : []).filter(isElement);
  const rawSteps = (Array.isArray(props.steps) ? props.steps : []).filter(isElement);
  const repos = [...new Set([...refs.values()].map((r) => r.repo).filter(Boolean))];

  const pieces: PuzzlePiece[] = [];
  const indexOf = new Map<string, number>();
  for (const raw of rawPieces) {
    const id = raw.statementId ?? owner;
    const p = raw.props;
    const type = raw.typeName as PieceType;
    if (!(PIECE_TYPES as readonly string[]).includes(type)) {
      add(id, `A Puzzle's pieces are Piece(...), NewPiece(...) or Idea(...), not ${raw.typeName}(...).`);
      continue;
    }
    if (indexOf.has(id)) {
      add(owner, `${id} is listed twice in the pieces.`);
      continue;
    }
    const name = str(p.name);
    // Lengths are the prompt's guidance, not errors: the page clamps long words, and dropping a piece for its length
    // would break the picture more than a long name does.
    if (!name) add(id, `${type} needs a name.`);
    const piece: PuzzlePiece = { id, type, name, band: "", tint: 0, kind: "", note: str(p.note), rows: [], call: "", path: "" };
    if (type === "Piece" || type === "NewPiece") {
      if (!refs.size) add(id, `There are no refs, so every piece is an Idea(name, note), not a ${type}.`);
    }
    if (type === "Piece") {
      const resolved = resolveRef(str(p.ref), refs);
      if (!str(p.ref)) add(id, `Piece "${name}" needs a ref from the list.`);
      else if (!resolved.ok) add(id, `Piece "${name}": ref ${resolved.reason}. Cite only refs from the list.`);
      else {
        const { entry, from, to, line } = resolved.ref;
        const twin = pieces.find((other) => other.ref && other.ref.entry.id === entry.id && other.ref.from === from && other.ref.to === to);
        if (twin) add(id, `${id} cites the same lines as ${twin.id}; each piece is a different unit of code.`);
        piece.ref = { entry, from, to, line };
        piece.band = entry.repo;
        piece.tint = ((entry.tint ?? 0) % 4) + 1;
        piece.kind = kindLabel(p.kind) || kindFromCode(entry, name);
      }
    } else if (type === "NewPiece") {
      const project = str(p.project);
      if (refs.size && !repos.includes(project)) add(id, `NewPiece "${name}": project must be one of: ${repos.join(", ")}.`);
      if (!str(p.path)) add(id, `NewPiece "${name}" needs a proposed path.`);
      const from = str(p.from);
      if (from) {
        const resolved = resolveRef(from, refs);
        if (!resolved.ok) add(id, `NewPiece "${name}": from ${resolved.reason}. Use a ref from the list, or "".`);
        else piece.adapts = resolved.ref.entry;
      }
      piece.band = project;
      piece.tint = tintOf(project, refs);
      piece.path = str(p.path);
    }
    indexOf.set(id, pieces.length);
    pieces.push(piece);
  }

  const [least, most] = PUZZLE_LIMITS.pieces;
  if (pieces.length < least || pieces.length > most) add(owner, `A Puzzle needs ${least} to ${most} pieces, not ${pieces.length}.`);
  const projects = new Set(pieces.map((p) => p.band).filter(Boolean));
  if (projects.size > PUZZLE_LIMITS.projects) add(owner, `At most ${PUZZLE_LIMITS.projects} projects in one Puzzle, not ${projects.size}.`);
  if (pieces.filter((p) => p.type === "NewPiece").length > PUZZLE_LIMITS.newPieces) add(owner, `At most ${PUZZLE_LIMITS.newPieces} NewPieces in one Puzzle.`);

  const pieceIndex = (value: unknown) => (isElement(value) && value.statementId !== undefined ? indexOf.get(value.statementId) : undefined);
  const joints: PuzzleJoint[] = [];
  const pairs = new Set<string>();
  for (const raw of rawJoints) {
    const id = raw.statementId ?? owner;
    if (raw.typeName !== "Joint") {
      add(id, `A Puzzle's joints are Joint(...), not ${raw.typeName}(...).`);
      continue;
    }
    const from = pieceIndex(raw.props.from);
    const to = pieceIndex(raw.props.to);
    const label = str(raw.props.label);
    if (from === undefined || to === undefined) {
      add(id, `${id} must join two pieces of this Puzzle by their ids (like p1, p2).`);
      continue;
    }
    if (from === to) {
      add(id, `${id} joins ${pieces[from]!.id} to itself.`);
      continue;
    }
    const pair = [from, to].sort().join("-");
    if (pairs.has(pair)) {
      add(id, `${pieces[from]!.id} and ${pieces[to]!.id} already have a Joint; say both in one label.`);
      continue;
    }
    pairs.add(pair);
    if (!label) add(id, `${id} needs a label: what crosses the joint.`);
    joints.push({ id, from, to, label });
  }
  if (joints.length > pieces.length) add(owner, `A Puzzle has at most one Joint per piece (${pieces.length}), not ${joints.length}.`);
  pieces.forEach((piece, i) => {
    if (joints.length && !joints.some((j) => j.from === i || j.to === i)) add(piece.id, `${piece.id} is in no Joint: join it to the piece it hands work to or gets work from.`);
  });
  if (!joints.length && pieces.length >= 2) add(owner, "A Puzzle needs Joints: one for each real call or hand-off between its pieces.");
  const loose = joints.filter((j) => Math.abs(j.from - j.to) !== 1);
  if (loose.length > PUZZLE_LIMITS.loose) add(loose[1]!.id, "List the pieces in the order the work flows, so each Joint joins neighbours in the list.");

  const jointIndex = new Map(joints.map((j, i) => [j.id, i]));
  const steps: PuzzleStep[] = [];
  for (const raw of rawSteps) {
    const id = raw.statementId ?? owner;
    if (raw.typeName !== "Step") {
      add(id, `A Puzzle's steps are Step(...), not ${raw.typeName}(...).`);
      continue;
    }
    const value = raw.props.lit;
    let lit: PuzzleStep["lit"] = null;
    if (isElement(value) && value.statementId !== undefined) {
      if (indexOf.has(value.statementId)) lit = { piece: indexOf.get(value.statementId)! };
      else if (jointIndex.has(value.statementId)) lit = { joint: jointIndex.get(value.statementId)! };
    }
    if (!lit) add(id, `${id} must light a piece or a joint of this Puzzle: write its id, like p2 or j1.`);
    steps.push({ id, lit, text: str(raw.props.text) });
  }
  const [fewest, mostSteps] = PUZZLE_LIMITS.steps;
  if (steps.length < fewest || steps.length > mostSteps) add(owner, `A Puzzle needs ${fewest} to ${mostSteps} Steps, not ${steps.length}.`);

  // Each tile's lines, now that we know who it hands work to.
  pieces.forEach((piece, i) => {
    if (!piece.ref) return;
    const joint = joints.find((j) => j.from === i);
    const next = joint ? pieces[joint.to] : undefined;
    Object.assign(piece, tileRows(piece.ref.entry, piece.ref, next && joint ? { name: next.name, label: joint.label } : undefined, piece.name));
  });

  return { title: str(props.title), caption: str(props.caption), pieces, joints, steps, problems };
}

