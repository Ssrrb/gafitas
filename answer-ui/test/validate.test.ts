import { describe, expect, it } from "vitest";
import { mergeStatements } from "@openuidev/lang-core";
import { drawnBlocks } from "../src/library";
import { measure, parseProgram, pruneBroken, validateProgram, type AnswerError } from "../src/validate";
import { fixture, refsFor } from "./load";

const ids = (errors: { id: string }[]) => errors.map((e) => e.id).sort();
/** What would be dropped after the repair turn: the soft problems (the word budget among them) only ask. */
const hard = (errors: AnswerError[]) => errors.filter((e) => !e.soft);
/** Answers written to the word budget, as the prompt's examples are now. */
const SHORT = ["requests-urllib3", "retry-ways", "repos-matches", "inside-adapter"];
/** Answers written before it: structurally sound, but wordy. */
const LONG = ["requests-timed", "requests-retries", "hermes-puzzle", "ingest-puzzle", "puzzle-max", "puzzle-min"];

describe("validate", () => {
  it("passes every good fixture: the short ones clean, the older ones with nothing to drop", () => {
    for (const name of SHORT) expect(validateProgram(fixture(name), refsFor(name)), name).toEqual([]);
    expect(validateProgram(fixture("hashmap-idea"), new Map())).toEqual([]);
    expect(validateProgram(fixture("quiz-urllib3"), refsFor("quiz-urllib3"), { quiz: true })).toEqual([]);
    for (const name of LONG) expect(hard(validateProgram(fixture(name), refsFor(name))), name).toEqual([]);
  });

  it("keeps answers short: the word budget, code retyped in prose, a NewPiece named as code", () => {
    for (const name of SHORT) expect(measure(fixture(name)).words, name).toBeLessThanOrEqual(90);
    // A live answer from before: 2 Snippets, a Callout and a Text around its Puzzle.
    const https = validateProgram(fixture("live-https"), refsFor("live-https"));
    expect(https.every((e) => e.soft)).toBe(true);
    expect(https).toContainEqual({ id: "root", soft: true, message: expect.stringContaining("words for the user to read") });
    // Another: the code to write named as a line of code.
    const ways = validateProgram(fixture("live-ways"), refsFor("live-ways"));
    expect(ways).toContainEqual({ id: "p0", soft: true, message: expect.stringContaining("never a line of code") });
    expect(ways).toContainEqual({ id: "root", soft: true, message: expect.stringContaining("The lede has") });
    expect(ways).toContainEqual({ id: "root", soft: true, message: expect.stringContaining('retypes code ("Retry(connect=3, backoff_factor=0.5)")') });
    // A quiz turn that came back without its Checks.
    expect(validateProgram(fixture("requests-urllib3"), refsFor("requests-urllib3"), { quiz: true })).toContainEqual({ id: "root", soft: true, message: expect.stringContaining("Ponme a prueba") });
  });

  it("draws one picture and one choice, Next last, and Checks only in a quiz", () => {
    const blocks = (text: string, quiz = false) => drawnBlocks((parseProgram(text).root?.props.blocks as unknown[]) ?? [], quiz).map((b) => b.type);
    expect(blocks(fixture("live-https"))).toEqual(["Puzzle", "Callout"]);
    expect(blocks(fixture("live-ways"))).toEqual(["Puzzle", "Ways", "Next"]);
    expect(blocks(fixture("lean-integrate"))).toEqual(["Proof", "Ways", "Next"]);
    // Two drawings at most: a picture and a Proof leave the choice out; a second Proof goes.
    const three = fixture("lean-integrate").replace("[k1, w0, n1]", "[w0, k1, z1, n1]") + '\nz1 = Puzzle("x", [p1, p2], [j1], [s1])\np1 = Idea("a")\np2 = Idea("b")\nj1 = Joint(p1, p2, "c")\ns1 = Step(p1, "d")';
    expect(blocks(three)).toEqual(["Puzzle", "Proof", "Next"]);
    expect(blocks(fixture("lean-integrate").replace("[k1, w0, n1]", "[k1, k1, n1]"))).toEqual(["Proof", "Next"]);
    expect(blocks(fixture("quiz-urllib3"))).toEqual([]);
    expect(blocks(fixture("quiz-urllib3"), true)).toEqual(["Check", "Check", "Check"]);
    const snippetAlone = 'root = Answer("La llamada.", [t1, n1])\nt1 = Snippet("r2:696-700")\nn1 = Next(["¿Y luego?", "¿Quién la recibe?"])';
    expect(blocks(snippetAlone)).toEqual(["Snippet", "Next"]);
  });

  it("catches an unknown ref, a Piece with no ref, a step lit by number and a snippet outside its ref", () => {
    const errors = hard(validateProgram(fixture("broken-refs"), refsFor("broken-refs")));
    expect(ids(errors)).toEqual(["p2", "p4", "s2", "t1"]);
    expect(errors.find((e) => e.id === "p2")!.message).toContain('"r9" is not in the ref list');
    expect(errors.find((e) => e.id === "s2")!.message).toContain("like p2 or j1");
    expect(errors.find((e) => e.id === "t1")!.message).toContain("outside r2");
  });

  it("catches a stray line, a cut-off statement and a piece in no joint", () => {
    const errors = hard(validateProgram(fixture("broken-syntax"), refsFor("broken-syntax")));
    expect(ids(errors)).toEqual(["line 9", "p3", "x1"]);
    expect(errors.find((e) => e.id === "p3")!.message).toContain("in no Joint");
  });

  it("rejects an invented ref even when everything else is fine", () => {
    const program = fixture("requests-urllib3").replace('"r3:782-795"', '"r8:782"');
    expect(validateProgram(program, refsFor("requests-urllib3"))).toEqual([{ id: "p3", message: expect.stringContaining('"r8"') }]);
  });

  it("enforces the Puzzle's rules", () => {
    const refs = refsFor("requests-urllib3");
    const base = fixture("requests-urllib3");
    const check = (program: string) => validateProgram(program, refs);
    expect(check(base.replace('j3 = Joint(p3, p4, "conn, method, url")', 'j3 = Joint(p3, p3, "conn")'))).toContainEqual({ id: "j3", message: expect.stringContaining("to itself") });
    // A long label is guidance, not an error: the page clamps it, and the joint stays.
    expect(check(base.replace('"conn, method, url"', '"' + "x".repeat(60) + '"'))).toEqual([]);
    expect(check(base.replace('p4 = Piece("HTTPConnectionPool._make_request", "r4", "method")', 'p4 = Piece("HTTPConnectionPool._make_request", "r3:782-795", "method")'))).toContainEqual({ id: "p4", message: expect.stringContaining("same lines as p3") });
    // A second picture isn't sent back: the page draws the first and leaves the second out.
    const two = base.replace("[z1, n1]", "[z1, z2, n1]") + '\nz2 = Puzzle("Otra", [p1, p2], [j1], [s1])';
    expect(check(two)).toEqual([]);
    expect(drawnBlocks((parseProgram(two).root?.props.blocks as unknown[]) ?? [], false).map((b) => b.type)).toEqual(["Puzzle", "Next"]);
    const newPiece = base.replace('p4 = Piece("HTTPConnectionPool._make_request", "r4", "method")', 'p4 = NewPiece("TimedPool", "httpx", "x.py", "", "Mide")');
    expect(check(newPiece)).toContainEqual({ id: "p4", message: expect.stringContaining("one of: requests, urllib3") });
    expect(validateProgram(base, new Map())).toContainEqual({ id: "p1", message: expect.stringContaining("every piece is an Idea") });
  });

  it("repair: merges the corrected statements, drops what is still broken, keeps the rest", () => {
    const refs = refsFor("broken-refs");
    const merged = mergeStatements(fixture("broken-refs"), fixture("broken-refs.repair"), "root");
    const errors = hard(validateProgram(merged, refs));
    expect(ids(errors)).toEqual(["t1"]);
    const kept = pruneBroken(merged, errors);
    expect(kept).not.toContain("t1 =");
    expect(kept).toContain("z1 = Puzzle(");
    expect(hard(validateProgram(kept, refs))).toEqual([]);
  });

  it("repair: a fully corrected program validates clean", () => {
    const merged = mergeStatements(fixture("broken-syntax"), fixture("broken-syntax.repair"), "root");
    expect(hard(validateProgram(merged, refsFor("broken-syntax")))).toEqual([]);
  });

  it("a broken piece takes its joints and their steps, and the puzzle stays", () => {
    const refs = refsFor("requests-urllib3");
    const program = fixture("requests-urllib3").replace('"r4"', '"r99"');
    const errors = hard(validateProgram(program, refs));
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
    expect(hard(validateProgram(kept, refs))).toEqual([]);
  });
});

describe("validate: the blocks a reader picks from", () => {
  const refs = refsFor("retry-ways");

  it("passes the choice fixtures", () => {
    for (const name of ["retry-ways", "retry-pick", "retry-board"]) expect(hard(validateProgram(fixture(name), refsFor(name))), name).toEqual([]);
    expect(hard(validateProgram(fixture("board-norefs"), new Map()))).toEqual([]);
  });

  it("asks for a repair of what the page draws around, and drops only what it can't stand behind", () => {
    const errors = validateProgram(fixture("broken-choices"), refs).filter((e) => e.id !== "root");
    expect(ids(errors.filter((e) => e.soft))).toEqual(["w1", "w3"]);
    expect(ids(hard(errors))).toEqual(["w2"]);
    expect(errors.find((e) => e.id === "w2")!.message).toContain("3 archivos");
    const merged = mergeStatements(fixture("broken-choices"), fixture("broken-choices.repair"), "root");
    const left = hard(validateProgram(merged, refs));
    expect(left.map((e) => e.id)).toEqual(["w2"]);
    const kept = pruneBroken(merged, left);
    expect(kept).not.toMatch(/^w2 =/m);
    expect(kept).toContain("[w1, w3]");
    expect(hard(validateProgram(kept, refs))).toEqual([]);
  });

  it("a Board item under tienes needs its ref; one choice block per answer, drawn without a repair", () => {
    const noRef = fixture("retry-board").replace('"plug", "r2:696-709"', '"plug", ""');
    expect(validateProgram(noRef, refs)).toContainEqual({ id: "i1", message: expect.stringContaining("needs its ref") });
    const two = fixture("retry-board").replace("[b0, n1])", "[b0, k1, n1])") + "\n" + fixture("retry-ways").split("\n").filter((l) => /^(w\d|k1) =/.test(l)).join("\n");
    expect(hard(validateProgram(two, refs))).toEqual([]);
    expect(drawnBlocks((parseProgram(two).root?.props.blocks as unknown[]) ?? [], false).map((b) => b.type)).toEqual(["Board", "Next"]);
  });
});
