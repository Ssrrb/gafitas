import { describe, expect, it } from "vitest";
import { EXAMPLE_CONCEPT, EXAMPLE_WITH_REFS, EXAMPLES, systemPrompt } from "../src/prompt";
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

  it("passes Gafitas's own validation: the refs example against its ref table, the concept example with none", () => {
    expect(validateProgram(EXAMPLE_WITH_REFS, refsFor("requests-urllib3"))).toEqual([]);
    expect(validateProgram(EXAMPLE_CONCEPT, new Map())).toEqual([]);
  });

  it("matches the fixtures, so the examples are what the dev page shows", () => {
    expect(fixture("requests-urllib3").trim()).toBe(EXAMPLE_WITH_REFS);
    expect(fixture("hashmap-idea").trim()).toBe(EXAMPLE_CONCEPT);
  });

  it("lists every component signature and the rules", () => {
    const prompt = systemPrompt();
    for (const signature of [
      "Answer(lede: string, blocks:",
      "Puzzle(title: string, pieces: (Piece | NewPiece | Idea)[], joints: Joint[], steps: Step[], caption?: string)",
      "Piece(name: string, ref: string, kind?: string)",
      "NewPiece(name: string, project: string, path: string, from?: string, note?: string)",
      "Joint(from: Piece | NewPiece | Idea, to: Piece | NewPiece | Idea, label: string)",
      "Step(lit: Piece | NewPiece | Idea | Joint, text: string)",
      "Snippet(ref: string, note?: string)",
    ]) {
      expect(prompt).toContain(signature);
    }
    expect(prompt).toContain("Cite code only by the refs in the list");
    expect(prompt).toContain("in Spanish");
    expect(prompt.length).toBeLessThan(14000);
  });
});
