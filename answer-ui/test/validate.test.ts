import { describe, expect, it } from "vitest";
import { mergeStatements } from "@openuidev/lang-core";
import { pruneBroken, validateProgram } from "../src/validate";
import { fixture, refsFor } from "./load";

const ids = (errors: { id: string }[]) => errors.map((e) => e.id).sort();

describe("validate", () => {
  it("passes every good fixture", () => {
    for (const name of ["hermes-coupling", "middleware-conveyor", "ingest-failing", "slots-one", "slots-max"]) {
      expect(validateProgram(fixture(name), refsFor(name)), name).toEqual([]);
    }
  });

  it("catches an unknown ref, an existing part with no ref, a step out of range and a line outside its ref", () => {
    const errors = validateProgram(fixture("broken-refs"), refsFor("broken-refs"));
    expect(ids(errors)).toEqual(["p2", "p4", "s2", "t1"]);
    expect(errors.find((e) => e.id === "p2")!.message).toContain('"r9" is not in the ref list');
    expect(errors.find((e) => e.id === "t1")!.message).toContain("outside r2");
  });

  it("catches a missing required slot, a stray line and a cut-off statement", () => {
    const errors = validateProgram(fixture("broken-syntax"), refsFor("broken-syntax"));
    expect(ids(errors)).toEqual(["line 9", "m1", "x1"]);
    expect(errors.find((e) => e.id === "m1")!.message).toContain('needs an "adapter" part');
  });

  it("rejects an invented ref even when everything else is fine", () => {
    const program = fixture("hermes-coupling").replace('"r5:12"', '"r7:12"');
    expect(validateProgram(program, refsFor("hermes-coupling"))).toEqual([{ id: "p5", message: expect.stringContaining('"r7"') }]);
  });

  it("catches a slot over its maximum and more than 2 Figs", () => {
    const four = fixture("slots-max").replace('pa = Part("Reporter", "b_part"', 'pa = Part("Reporter", "b_part", "", "x", "concept")\npb = Part("Extra", "b_part"').replace("[p1, p2, p3, p4, p5, p6, p7, p8, p9, pa]", "[p1, p2, p3, p4, p5, p6, p7, p8, p9, pa, pb]");
    expect(ids(validateProgram(four, new Map()))).toContain("pb");
    const three = fixture("slots-one").replace("[f1, f2]", "[f1, f2, f3]") + '\nf3 = Fig("Again", m1, "Same machine.")';
    expect(validateProgram(three, new Map())).toEqual([{ id: "f3", message: expect.stringContaining("At most 2 Figs") }]);
  });

  it("repair: merges the corrected statements, drops what is still broken, keeps the rest", () => {
    const refs = refsFor("broken-refs");
    const merged = mergeStatements(fixture("broken-refs"), fixture("broken-refs.repair"), "root");
    const errors = validateProgram(merged, refs);
    expect(ids(errors)).toEqual(["t1"]);
    const kept = pruneBroken(merged, errors);
    expect(kept).not.toContain("t1 =");
    expect(kept).toContain("f1 = Fig(");
    expect(validateProgram(kept, refs)).toEqual([]);
  });

  it("repair: a fully corrected program validates clean", () => {
    const merged = mergeStatements(fixture("broken-syntax"), fixture("broken-syntax.repair"), "root");
    expect(validateProgram(merged, refsFor("broken-syntax"))).toEqual([]);
  });

  it("a broken part takes its whole figure down, never just the part", () => {
    const program = fixture("hermes-coupling").replace('"r1"', '"r99"');
    const errors = validateProgram(program, refsFor("hermes-coupling"));
    expect(ids(errors)).toEqual(["p1"]);
    const kept = pruneBroken(program, errors);
    expect(kept).not.toContain("f1 =");
    expect(kept).toContain("t1 = Snippet(");
    expect(validateProgram(kept, refsFor("hermes-coupling"))).toEqual([]);
  });
});
