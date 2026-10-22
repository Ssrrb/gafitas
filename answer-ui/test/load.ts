import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRef, type RefEntry } from "../src/refs";

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = (name: string) => readFileSync(join(here, "../fixtures", `${name}.openui`), "utf8");
const all = JSON.parse(readFileSync(join(here, "../fixtures/refs.json"), "utf8")) as Record<string, unknown[]>;
export const refsFor = (name: string): Map<string, RefEntry> => new Map((all[name] ?? []).map((r) => normalizeRef(r)!).map((r) => [r.id, r]));
