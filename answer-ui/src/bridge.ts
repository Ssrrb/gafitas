// Swift → JS: window.gafitas. See README.md for the contract.
import { mergeStatements } from "@openuidev/lang-core";
import { refIdOf } from "./refs";
import { store } from "./store";
import { pruneBroken, validateProgram } from "./validate";

export interface GafitasApi {
  theme(vars: Record<string, string>): void;
  refs(list: unknown[]): void;
  reset(): void;
  append(delta: string): void;
  done(): void;
  replace(text: string): void;
  select(ref: string | null): void;
}

declare global {
  interface Window {
    gafitas?: GafitasApi;
  }
}

const VARS = ["ground", "sheet", "text", "muted", "faint", "fill", "accent", "amber", "moss", "p1", "p2", "p3", "p4", "font", "mono"];

export function applyTheme(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars ?? {})) {
    if (key === "theme") {
      if (value === "dark" || value === "light") root.dataset.theme = value;
      continue;
    }
    const name = key.startsWith("--") ? key : `--g-${key}`;
    if (!VARS.includes(name.replace(/^--g-/, ""))) continue;
    if (typeof value === "string" && value) root.style.setProperty(name, value);
  }
}

export const api: GafitasApi = {
  theme: applyTheme,
  refs(list) {
    store.addRefs(list);
  },
  reset() {
    store.reset();
  },
  append(delta) {
    const s = store.get();
    store.set({ text: s.text + String(delta ?? ""), phase: "streaming" });
  },
  done() {
    store.set({ phase: "done" }, true);
  },
  replace(text) {
    const s = store.get();
    let merged = s.text;
    try {
      merged = s.text.trim() ? mergeStatements(s.text, String(text ?? ""), "root") : String(text ?? "");
    } catch {
      merged = s.text;
    }
    const errors = validateProgram(merged, s.refs);
    const kept = errors.length ? pruneBroken(merged, errors) : merged;
    store.set({ text: kept, phase: "done", revision: s.revision + 1, final: true, dropped: errors, notice: errors.length > 0 }, true);
  },
  select(ref) {
    store.set({ selected: ref ? refIdOf(ref) : null });
  },
};

export function installBridge() {
  window.gafitas = api;
}
