import { describe, expect, it } from "vitest";
import { EXAMPLE_CONCEPT, EXAMPLE_INSIDE, EXAMPLE_PROOF, EXAMPLE_WITH_REFS, EXAMPLES, systemPrompt } from "../src/prompt";
import { parseProgram, validateProgram } from "../src/validate";
import { fixture, refsFor } from "./load";

describe("the system prompt", () => {
  it("parses both examples with zero parser errors", () => {
    for (const example of EXAMPLES) {
      const result = parseProgram(example);
      expect(result.meta.errors).toEqual([]);
      expect(result.meta.unresolved).toEqual([]);
      expect(result.meta.orphaned).toEqual([]);
      expect(result.root?.typeName).toBe("Answer");
    }
  });

  it("passes Gafitas's own validation: each example against the real Lean and pi lines it cites, the concept with none", () => {
    expect(validateProgram(EXAMPLE_PROOF, refsFor("lean-integrate"))).toEqual([]);
    expect(validateProgram(EXAMPLE_WITH_REFS, refsFor("pi-lean-tool"))).toEqual([]);
    expect(validateProgram(EXAMPLE_CONCEPT, new Map())).toEqual([]);
    expect(validateProgram(EXAMPLE_INSIDE, refsFor("lean-inside"))).toEqual([]);
  });

  it("matches the fixtures, so the examples are what the dev page shows", () => {
    expect(fixture("lean-integrate").trim()).toBe(EXAMPLE_PROOF);
    expect(fixture("pi-lean-tool").trim()).toBe(EXAMPLE_WITH_REFS);
    expect(fixture("modus-ponens").trim()).toBe(EXAMPLE_CONCEPT);
    expect(fixture("lean-inside").trim()).toBe(EXAMPLE_INSIDE);
  });

  it("lists every component signature and the rules", () => {
    const prompt = systemPrompt();
    for (const signature of [
      "Answer(lede: string, blocks:",
      "Proof(title: string, goal: Rule)",
      "Rule(claim: string, name: string, given: (Fact | Rule)[], ref?: string)",
      "Fact(claim: string, ref?: string)",
      "Puzzle(title: string, pieces: (Piece | NewPiece | Idea)[], joints: Joint[], steps: Step[])",
      "Piece(name: string, ref: string, kind?: string)",
      "NewPiece(name: string, project: string, path: string, from?: string, note?: string)",
      "Joint(from: Piece | NewPiece | Idea, to: Piece | NewPiece | Idea, label: string)",
      "Step(lit: Piece | NewPiece | Idea | Joint, text: string)",
      "Snippet(ref: string, note?: string)",
      "Ways(question: string, ways: Way[])",
      "Way(title: string, icon: string, what: string, effort: string, tradeoff: string, uses?: string[])",
      "Pick(question: string, options: Option[], multiple?: boolean)",
      "Board(title: string, items: Item[])",
      "Item(column: string, title: string, icon: string, ref?: string, note?: string)",
      "Next(questions: string[])",
      "Walkthrough(title: string, stops: Lines[])",
      "Lines(ref: string, text: string)",
      "SideBySide(title: string, left: Side, right: Side, note?: string)",
      "Matches(title: string, pairs: Match[])",
      "Match(a: string, b: string, sure: string, note?: string)",
      "Side(title: string, ref: string)",
      "Check(question: string, options: string[], answer: number, why: string, ref?: string)",
    ]) {
      expect(prompt).toContain(signature);
    }
    expect(prompt).toContain("Cite code only by refs from the list");
    expect(prompt).toContain("Never write code, a path or a line number");
    expect(prompt).toContain("is Spanish");
    expect(prompt).toContain("teaches by showing");
    expect(prompt).not.toContain("any");
    expect(prompt).not.toContain("Compare");
    expect(prompt).not.toContain("Text(");
    expect(prompt).not.toContain("caption");
    expect(prompt).not.toContain("Hoisting");
    expect(prompt.length).toBeLessThan(11500);
  });
});
