import { describe, expect, it } from "vitest";
import { mergeStatements } from "@openuidev/lang-core";
import { pruneBroken, validateProgram } from "../src/validate";
import { fixture, refsFor } from "./load";

const ids = (errors: { id: string }[]) => errors.map((e) => e.id).sort();

describe("validate", () => {
  it("passes every good fixture", () => {
    for (const name of ["requests-urllib3", "requests-timed", "requests-retries", "hermes-puzzle", "ingest-puzzle", "puzzle-max", "puzzle-min"]) {
      expect(validateProgram(fixture(name), refsFor(name)), name).toEqual([]);
    }
    expect(validateProgram(fixture("hashmap-idea"), new Map())).toEqual([]);
  });

  it("catches an unknown ref, a Piece with no ref, a step lit by number and a snippet outside its ref", () => {
    const errors = validateProgram(fixture("broken-refs"), refsFor("broken-refs"));
    expect(ids(errors)).toEqual(["p2", "p4", "s2", "t1"]);
    expect(errors.find((e) => e.id === "p2")!.message).toContain('"r9" is not in the ref list');
    expect(errors.find((e) => e.id === "s2")!.message).toContain("like p2 or j1");
    expect(errors.find((e) => e.id === "t1")!.message).toContain("outside r2");
  });

  it("catches a stray line, a cut-off statement and a piece in no joint", () => {
    const errors = validateProgram(fixture("broken-syntax"), refsFor("broken-syntax"));
    expect(ids(errors)).toEqual(["line 9", "p3", "x1"]);
    expect(errors.find((e) => e.id === "p3")!.message).toContain("in no Joint");
  });

  it("rejects an invented ref even when everything else is fine", () => {
    const program = fixture("requests-urllib3").replace('"r3:782"', '"r8:782"');
    expect(validateProgram(program, refsFor("requests-urllib3"))).toEqual([{ id: "p3", message: expect.stringContaining('"r8"') }]);
  });

  it("enforces the Puzzle's rules", () => {
    const refs = refsFor("requests-urllib3");
    const base = fixture("requests-urllib3");
    const check = (program: string) => validateProgram(program, refs);
    expect(check(base.replace('j3 = Joint(p3, p4, "conn, method, url, body, headers")', 'j3 = Joint(p3, p3, "conn")'))).toContainEqual({ id: "j3", message: expect.stringContaining("to itself") });
    expect(check(base.replace('"conn, method, url, body, headers"', '"' + "x".repeat(41) + '"'))).toContainEqual({ id: "j3", message: expect.stringContaining("at most 40") });
    expect(check(base.replace('p4 = Piece("HTTPConnectionPool._make_request", "r4", "method")', 'p4 = Piece("HTTPConnectionPool._make_request", "r3:782", "method")'))).toContainEqual({ id: "p4", message: expect.stringContaining("same lines as p3") });
    expect(check(base.replace("[z1, t1]", "[z1, z2, t1]") + '\nz2 = Puzzle("Otra", [p1, p2], [j1], [s1])')).toContainEqual({ id: "z2", message: expect.stringContaining("At most 1 Puzzle") });
    const newPiece = base.replace('p4 = Piece("HTTPConnectionPool._make_request", "r4", "method")', 'p4 = NewPiece("TimedPool", "httpx", "x.py", "", "Mide")');
    expect(check(newPiece)).toContainEqual({ id: "p4", message: expect.stringContaining("one of: requests, urllib3") });
    expect(validateProgram(base, new Map())).toContainEqual({ id: "p1", message: expect.stringContaining("every piece is an Idea") });
  });

  it("repair: merges the corrected statements, drops what is still broken, keeps the rest", () => {
    const refs = refsFor("broken-refs");
    const merged = mergeStatements(fixture("broken-refs"), fixture("broken-refs.repair"), "root");
    const errors = validateProgram(merged, refs);
    expect(ids(errors)).toEqual(["t1"]);
    const kept = pruneBroken(merged, errors);
    expect(kept).not.toContain("t1 =");
    expect(kept).toContain("z1 = Puzzle(");
    expect(validateProgram(kept, refs)).toEqual([]);
  });

  it("repair: a fully corrected program validates clean", () => {
    const merged = mergeStatements(fixture("broken-syntax"), fixture("broken-syntax.repair"), "root");
    expect(validateProgram(merged, refsFor("broken-syntax"))).toEqual([]);
  });

  it("a broken piece takes its joints and their steps, and the puzzle stays", () => {
    const refs = refsFor("requests-urllib3");
    const program = fixture("requests-urllib3").replace('"r4"', '"r99"');
    const errors = validateProgram(program, refs);
    expect(ids(errors)).toEqual(["p4"]);
    const kept = pruneBroken(program, errors);
    expect(kept).not.toMatch(/^(p4|j3|s4) =/m);
    expect(kept).toContain("z1 = Puzzle(");
    expect(kept).toContain("[p1, p2, p3], [j1, j2], [s1, s2, s3]");
    expect(validateProgram(kept, refs)).toEqual([]);
  });

  it("a puzzle left with fewer than 2 pieces goes, and the answer keeps its other blocks", () => {
    const refs = refsFor("puzzle-min");
    const program = fixture("puzzle-min").replace('"r2"', '"r99"').replace("[z1])", "[z1, t1])") + '\nt1 = Snippet("r1:784", "La llamada")';
    const kept = pruneBroken(program, validateProgram(program, refs));
    expect(kept).not.toContain("z1 =");
    expect(kept).toContain("t1 = Snippet(");
    expect(validateProgram(kept, refs)).toEqual([]);
  });
});
