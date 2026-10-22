import { describe, expect, it } from "vitest";
import { codeRows, tileRows, type CodeRow } from "../src/curate";
import { resolveRef } from "../src/refs";
import { refsFor } from "./load";

const refs = refsFor("requests-urllib3");
const at = (cite: string) => {
  const r = resolveRef(cite, refs);
  if (!r.ok) throw new Error(r.reason);
  return r.ref;
};
const shown = (rows: CodeRow[]) => rows.map((row) => (row.kind === "gap" ? `⋯${row.to - row.from + 1}` : row.n));

describe("the hand-off line of each puzzle tile", () => {
  // The requests → urllib3 example: each piece's tile shows the line that calls the next one.
  const chain = [
    { cite: "r1:784", next: { name: "HTTPAdapter.send", label: "request, **kwargs" } },
    { cite: "r2:696-708", next: { name: "HTTPConnectionPool.urlopen", label: "method, url, body, headers" } },
    { cite: "r3:782-795", next: { name: "HTTPConnectionPool._make_request", label: "conn, method, url" } },
    { cite: "r4", next: undefined },
  ];

  it("finds 784, 696, 782 and 383", () => {
    const mains = chain.map(({ cite, next }) => {
      const ref = at(cite);
      const { rows } = tileRows(ref.entry, ref, next);
      const main = rows.find((row) => row.main)!;
      return ref.entry.text.split("\n").findIndex((line) => line.trim() && line.endsWith(main.text.replace(/ ⋯$/, ""))) + ref.entry.first;
    });
    expect(mains).toEqual([784, 696, 782, 383]);
  });

  it("shows where the called object comes from when the call is one line", () => {
    const ref = at("r1:784");
    const { rows, call } = tileRows(ref.entry, ref, chain[0]!.next);
    expect(call).toBe("send");
    expect(rows.map((row) => row.text)).toEqual(["adapter = self.get_adapter(url=request.url)", "⋯", "r = adapter.send(request, **kwargs)"]);
  });

  it("follows a call across lines, at most 3 rows, dedented, the last one cut with ⋯", () => {
    const ref = at("r2:696-708");
    const { rows, call } = tileRows(ref.entry, ref, chain[1]!.next);
    expect(call).toBe("urlopen");
    expect(rows.map((row) => row.text)).toEqual(["resp = conn.urlopen(", "    method=request.method,", "    url=url, ⋯"]);
    expect(rows.map((row) => row.main)).toEqual([true, false, false]);
  });

  it("gives the last piece its own def, without self", () => {
    const ref = at("r4");
    const { rows, call } = tileRows(ref.entry, ref);
    expect(call).toBe("");
    expect(rows.map((row) => row.text)).toEqual(["def _make_request(", "    conn: BaseHTTPConnection,", "    method: str, ⋯"]);
  });

  it("shows a piece's own def when its ref doesn't show the hand-off", () => {
    // r1 holds Session.send, but nothing in it calls "Nowhere": the tile shows the def, not the focus line.
    const ref = at("r1:784");
    const { rows, call } = tileRows(ref.entry, ref, { name: "Pool.nowhere", label: "x" }, "Session.send");
    expect(call).toBe("");
    expect(rows[0]!.text).toBe("def send(self, request: PreparedRequest, **kwargs: Any) -> Response:");
  });

  it("falls back to a call named in the joint's label", () => {
    const ref = at("r2:696-708");
    const { rows, call } = tileRows(ref.entry, ref, { name: "Pool.send_it", label: "conn.urlopen(method, url)" });
    expect(call).toBe("urlopen");
    expect(rows[0]!.text).toBe("resp = conn.urlopen(");
  });
});

describe("the lines a code view shows", () => {
  it("cuts a long range to its head and tail, with a line of context each side", () => {
    const ref = at("r2:696-708");
    const rows = codeRows(ref.entry, ref.from, ref.to, ref.line);
    expect(shown(rows)).toEqual([695, 696, 697, 698, 699, 700, "⋯6", 707, 708, 709, 710]);
    expect(rows.filter((row) => row.kind === "line" && row.lit).length).toBe(7);
  });

  it("takes context from the same block, never the inside of the statement before", () => {
    const ref = at("r2:690-693");
    const rows = codeRows(ref.entry, ref.from, ref.to, ref.line);
    expect(shown(rows)).toEqual([690, 691, 692, 693, 694, 695]);
    const lines = rows.flatMap((row) => (row.kind === "line" ? [row.text] : []));
    expect(lines).toContain("elif isinstance(timeout, TimeoutSauce):");
    expect(lines).toContain("    resolved_timeout = timeout");
  });

  it("lights the statement at a whole ref's focus, and folds the docstring after it", () => {
    const ref = at("r4");
    const rows = codeRows(ref.entry, ref.from, ref.to, ref.line);
    expect(shown(rows)).toEqual([383, 384, 385, 386, 387, "⋯8", 396, 397]);
  });

  it("puts the enclosing def on top, with the lines between folded", () => {
    const ref = at("r1:784");
    const rows = codeRows(ref.entry, ref.from, ref.to, ref.line);
    expect(shown(rows)).toEqual([752, "⋯28", 781, 782, 783, 784, 785, 786, 787]);
    expect(rows.filter((row) => row.kind === "line" && row.lit).map((row) => (row.kind === "line" ? row.n : 0))).toEqual([784]);
    expect(rows.find((row) => row.kind === "line" && row.n === 783)).toMatchObject({ comment: true });
  });

  it("folds a docstring the ref starts inside", () => {
    const entry = refsFor("requests-urllib3").get("r5")!;
    const rows = codeRows(entry, 481, 483, 481);
    expect(rows.some((row) => row.kind === "line" && row.n < 480)).toBe(false);
  });
});
