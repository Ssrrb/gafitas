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
    expect(validateProgram(EXAMPLE_WITH_REFS, refsFor("hermes-coupling"))).toEqual([]);
    expect(validateProgram(EXAMPLE_CONCEPT, new Map())).toEqual([]);
  });

  it("matches the fixtures, so the examples are what the dev page shows", () => {
    expect(fixture("hermes-coupling").trim()).toBe(EXAMPLE_WITH_REFS);
    expect(fixture("middleware-conveyor").trim()).toBe(EXAMPLE_CONCEPT);
  });

  it("lists every component signature and the rules", () => {
    const prompt = systemPrompt();
    for (const signature of ["Answer(lede: string, blocks:", "Fig(title: string, machine: Coupling | Conveyor, caption: string)", "Part(label: string, role:", "Step(lit: number, text: string, value?: number, fails?: boolean)", "Snippet(ref: string, note?: string)", "NewItem(path: string, what: string, adapts: string)"]) {
      expect(prompt).toContain(signature);
    }
    expect(prompt).toContain("Cite code only by the refs in the list");
    expect(prompt.length).toBeLessThan(14000);
  });
});
