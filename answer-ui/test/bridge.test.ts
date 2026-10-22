import { describe, expect, it } from "vitest";
import { api } from "../src/bridge";
import { store } from "../src/store";
import { fixture, refsFor } from "./load";

describe("bridge", () => {
  it("streams, then repairs: merged by statement id, still-broken blocks dropped, notice on", () => {
    api.reset();
    api.refs([...refsFor("broken-refs").values()]);
    api.turn("t1", "¿Cómo llega una skill al harness?");
    const text = fixture("broken-refs");
    for (let at = 0; at < text.length; at += 7) api.append(text.slice(at, at + 7));
    expect(store.current().phase).toBe("streaming");
    api.done();
    expect(store.current().phase).toBe("done");
    api.replace(fixture("broken-refs.repair"));
    const turn = store.current();
    expect(turn.final).toBe(true);
    expect(turn.notice).toBe(true);
    expect(turn.dropped.map((e) => e.id)).toEqual(["t1"]);
    expect(turn.text).toContain('p2 = Piece("SkillIndex.record", "r2:44"');
    expect(turn.text).not.toContain("t1 =");
  });

  it("a follow-up is a new turn: the first one stays, the stream goes to the new one", () => {
    api.reset();
    api.refs([...refsFor("requests-urllib3").values()]);
    api.turn("t1", "uno");
    api.append(fixture("requests-urllib3"));
    api.done();
    api.turn("t2", "dos");
    api.trail("t2", { lines: [{ text: "Leyendo adapters.py…", running: true }] });
    api.append(fixture("requests-timed"));
    const s = store.get();
    expect(s.turns.map((t) => [t.id, t.phase])).toEqual([
      ["t1", "done"],
      ["t2", "streaming"],
    ]);
    expect(s.turns[1]!.trail.lines[0]!.text).toBe("Leyendo adapters.py…");
    expect(s.turns[0]!.text).toContain("Session.send");
  });

  it("load draws a saved chat as it was: every turn final, nothing to report or repair", () => {
    api.reset();
    api.load([
      { id: "t1", question: "uno", program: fixture("requests-urllib3") },
      { id: "t2", question: "dos", program: fixture("requests-retries"), trail: { lines: [], summary: "Respondió en 9 s" } },
    ]);
    const turns = store.get().turns;
    expect(turns.every((t) => t.replay && t.final && t.phase === "done")).toBe(true);
    expect(turns[1]!.trail.summary).toBe("Respondió en 9 s");
  });

  it("reset clears the thread and the ref table", () => {
    api.refs([{ id: "r1", repo: "x", path: "y", first: 1, last: 2, text: "a\nb" }]);
    api.reset();
    expect(store.get().turns).toEqual([]);
    expect(store.get().refs.size).toBe(0);
  });

  it("select normalizes a cited ref to its id", () => {
    api.select("R3:18");
    expect(store.get().selected).toBe("r3");
    api.select(null);
    expect(store.get().selected).toBe(null);
  });
});
