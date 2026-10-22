import { describe, expect, it } from "vitest";
import { api } from "../src/bridge";
import { store } from "../src/store";
import { fixture, refsFor } from "./load";

describe("bridge", () => {
  it("streams, then repairs: merged by statement id, still-broken blocks dropped, notice on", () => {
    api.reset();
    api.refs([...refsFor("broken-refs").values()]);
    const text = fixture("broken-refs");
    for (let at = 0; at < text.length; at += 7) api.append(text.slice(at, at + 7));
    expect(store.get().phase).toBe("streaming");
    api.done();
    expect(store.get().phase).toBe("done");
    api.replace(fixture("broken-refs.repair"));
    const state = store.get();
    expect(state.final).toBe(true);
    expect(state.notice).toBe(true);
    expect(state.dropped.map((e) => e.id)).toEqual(["t1"]);
    expect(state.text).toContain('p2 = Part("Skills index", "a_port", "r2:44"');
    expect(state.text).not.toContain("t1 =");
  });

  it("reset clears the program and the ref table", () => {
    api.refs([{ id: "r1", repo: "x", path: "y", first: 1, last: 2, text: "a\nb" }]);
    api.reset();
    expect(store.get().text).toBe("");
    expect(store.get().refs.size).toBe(0);
  });

  it("select normalizes a cited ref to its id", () => {
    api.select("R3:18");
    expect(store.get().selected).toBe("r3");
    api.select(null);
    expect(store.get().selected).toBe(null);
  });
});
