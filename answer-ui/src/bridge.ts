// Swift → JS: window.gafitas. See README.md for the contract.
import { mergeStatements } from "@openuidev/lang-core";
import { refIdOf } from "./refs";
import { newTurn, store, type Trail, type Via, isQuiz } from "./store";
import { pruneBroken, validateProgram } from "./validate";

/** A turn saved in the history log, drawn as it was. */
export interface SavedTurn {
  id: string;
  question: string;
  program: string;
  trail?: Trail;
  via?: Via;
}

export interface GafitasApi {
  theme(vars: Record<string, string>): void;
  refs(list: unknown[]): void;
  reset(): void;
  turn(id: string, question: string, via?: Via): void;
  busy(on: boolean): void;
  trail(id: string | null, trail: Trail): void;
  append(delta: string): void;
  done(): void;
  replace(text: string): void;
  load(turns: SavedTurn[]): void;
  select(ref: string | null): void;
}

declare global {
  interface Window {
    gafitas?: GafitasApi;
  }
}

const VARS = new Set(["ground", "sheet", "edge", "text", "muted", "faint", "fill", "active", "accent", "lit", "lit-ink", "lit-fill", "amber", "negative", "p1", "p2", "p3", "p4", "p1-pale", "p2-pale", "p3-pale", "p4-pale", "font", "mono"]);

export function applyTheme(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars ?? {})) {
    if (key === "theme") {
      if (value === "dark" || value === "light") root.dataset.theme = value;
      continue;
    }
    const name = key.startsWith("--") ? key : `--g-${key}`;
    if (!VARS.has(name.replace(/^--g-/, ""))) continue;
    if (typeof value === "string" && value) root.style.setProperty(name, value);
  }
}

const cleanTrail = (trail: Trail | undefined): Trail => ({
  lines: (Array.isArray(trail?.lines) ? trail.lines : []).filter((line) => line && typeof line.text === "string"),
  summary: typeof trail?.summary === "string" ? trail.summary : undefined,
  thinking: typeof trail?.thinking === "string" ? trail.thinking : undefined,
});

const cleanVia = (via: unknown): Via | undefined => {
  const v = via as Partial<Via> | null | undefined;
  if (!v || typeof v.turn !== "string" || typeof v.block !== "string") return undefined;
  return { turn: v.turn, block: v.block, choices: (Array.isArray(v.choices) ? v.choices : []).map(String) };
};

export const api: GafitasApi = {
  theme: applyTheme,
  refs(list) {
    store.addRefs(list);
  },
  reset() {
    store.reset();
  },
  turn(id, question, via) {
    const s = store.get();
    if (s.turns.some((turn) => turn.id === id)) return;
    store.set({ turns: [...s.turns, newTurn(String(id), String(question ?? ""), { via: cleanVia(via) })] }, true);
  },
  busy(on) {
    store.set({ busy: Boolean(on) }, true);
  },
  trail(id, trail) {
    const turn = id ? store.get().turns.find((t) => t.id === id) : store.current();
    if (turn) store.patchTurn(turn.id, { trail: cleanTrail(trail) });
  },
  append(delta) {
    const turn = store.current();
    store.patchTurn(turn.id, { text: turn.text + String(delta ?? ""), phase: "streaming" });
  },
  done() {
    store.patchTurn(store.current().id, { phase: "done" }, true);
  },
  replace(text) {
    const turn = store.current();
    let merged = turn.text;
    try {
      merged = turn.text.trim() ? mergeStatements(turn.text, String(text ?? ""), "root") : String(text ?? "");
    } catch {
      merged = turn.text;
    }
    const errors = validateProgram(merged, store.get().refs, { quiz: isQuiz(turn.via) });
    const kept = errors.length ? pruneBroken(merged, errors) : merged;
    store.patchTurn(turn.id, { text: kept, phase: "done", revision: turn.revision + 1, final: true, dropped: errors, notice: errors.some((e) => !e.soft) }, true);
  },
  load(turns) {
    const list = (Array.isArray(turns) ? turns : []).map((saved, i) =>
      newTurn(String(saved.id ?? `t${i + 1}`), String(saved.question ?? ""), { text: String(saved.program ?? ""), phase: "done", final: true, replay: true, trail: cleanTrail(saved.trail), via: cleanVia(saved.via) }),
    );
    store.set({ turns: list }, true);
  },
  select(ref) {
    store.set({ selected: ref ? refIdOf(ref) : null });
  },
};

export function installBridge() {
  window.gafitas = api;
}
