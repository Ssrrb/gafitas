import { describe, expect, it } from "vitest";
import type { ElementNode } from "@openuidev/lang-core";
import { rejectRows } from "../src/curate";
import { failedFrom, readProof } from "../src/proof/model";
import { parseProgram, pruneBroken, validateProgram } from "../src/validate";
import { fixture, refsFor } from "./load";

const proofOf = (text: string) => (parseProgram(text).root?.props.blocks as ElementNode[]).find((b) => b.typeName === "Proof")!;

describe("the Proof", () => {
  const refs = refsFor("lean-integrate");
  const base = fixture("lean-integrate");

  it("reads the goal first, its premises after, each with the lines that check it", () => {
    const model = readProof(proofOf(base), refs);
    expect(model.problems).toEqual([]);
    expect(model.nodes.map((n) => `${n.id}@${n.depth}`)).toEqual(["g2@0", "f1@1", "f2@1", "g1@1", "f3@2"]);
    expect(model.nodes[0]!.given).toEqual([1, 2, 3]);
    expect(model.nodes[4]!.ref).toMatchObject({ from: 184, to: 185 });
  });

  it("breaking a premise fails it and every rule under it, down to the goal, and nothing else", () => {
    const { nodes } = readProof(proofOf(base), refs);
    expect([...failedFrom(nodes, 4)].sort()).toEqual([0, 3, 4]);
    expect([...failedFrom(nodes, 1)].sort()).toEqual([0, 1]);
  });

  it("reports what a small model gets wrong", () => {
    const check = (program: string) => validateProgram(program, refs).filter((e) => !e.soft);
    expect(check(base.replace('k1 = Proof("Por qué Lean no se equivoca", g2)', 'k1 = Proof("Por qué", f1)'))).toContainEqual({ id: "k1", message: expect.stringContaining("goal is one Rule") });
    expect(check(base.replace('"r2:184-185"', '"r9"'))).toContainEqual({ id: "f3", message: expect.stringContaining('"r9" is not in the ref list') });
    expect(check(base.replace("[f1, f2, g1]", "[f1, f2, g1, f3]"))).toContainEqual({ id: "g2", message: expect.stringContaining("1 to 3 given") });
    expect(check(base.replace("[f1, f2, g1]", "[f1, f3, g1]"))).toContainEqual({ id: "f3", message: expect.stringContaining("given twice") });
    const deep = base.replace('g1 = Rule("la prueba tiene el tipo del enunciado", "is_def_eq", [f3], "r1:203-205")', 'g0 = Rule("x", "a", [f3])\ng9 = Rule("y", "b", [g0])\ng1 = Rule("la prueba tiene el tipo del enunciado", "is_def_eq", [g9], "r1:203-205")');
    expect(check(deep)).toContainEqual({ id: "g0", message: expect.stringContaining("too deep") });
  });

  it("lights the line that refuses, not the check before it", () => {
    const rows = rejectRows(refs.get("r1")!, 204, 205);
    expect(rows.flatMap((r) => (r.kind === "line" && r.lit ? [r.n] : []))).toEqual([205]);
  });

  it("a concept proof needs no refs", () => {
    expect(validateProgram(fixture("modus-ponens"), new Map())).toEqual([]);
  });

  it("repair: a premise still broken is dropped, its rule and the proof stay", () => {
    const program = base.replace('"r1:202"', '"r99"');
    const errors = validateProgram(program, refs);
    const kept = pruneBroken(program, errors);
    expect(kept).not.toMatch(/^f2 =/m);
    expect(kept).toContain("[f1, g1]");
    expect(kept).toContain("k1 = Proof(");
    expect(validateProgram(kept, refs).filter((e) => !e.soft)).toEqual([]);
  });
});
