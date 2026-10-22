import * as React from "react";
import { normalizeRef, type RefEntry } from "./refs";

export type Phase = "idle" | "streaming" | "done";

export interface AnswerState {
  /** Bumped by reset(): a new answer remounts everything (no stale figure state). */
  answer: number;
  refs: ReadonlyMap<string, RefEntry>;
  text: string;
  phase: Phase;
  /** Bumped whenever the program text is replaced wholesale (repair turn). */
  revision: number;
  /** The native card selection: light the part citing this ref. */
  selected: string | null;
  /** Something was dropped after the repair turn. */
  notice: boolean;
  /** Set by replace(): the repair turn is over; `dropped` is what was still broken and is no longer shown. */
  final: boolean;
  dropped: { id: string; message: string }[];
}

let state: AnswerState = { answer: 0, refs: new Map(), text: "", phase: "idle", revision: 0, selected: null, notice: false, final: false, dropped: [] };
const listeners = new Set<() => void>();
let queued = 0;
let queuedOnTimer = false;

/** Frames only come while the page is on screen: a window behind others, or a test that never shows it, gets a timer. */
export function whenDrawn(callback: () => void): { id: number; timer: boolean } {
  const timer = typeof requestAnimationFrame !== "function" || document.visibilityState !== "visible";
  return { id: timer ? (setTimeout(callback, 16) as unknown as number) : requestAnimationFrame(callback), timer };
}

function emit() {
  // Streaming appends arrive many times a frame; render at most once per frame.
  if (queued) return;
  const flush = () => {
    queued = 0;
    for (const listener of listeners) listener();
  };
  ({ id: queued, timer: queuedOnTimer } = whenDrawn(flush));
}

function flushNow() {
  if (queued) {
    if (queuedOnTimer) clearTimeout(queued);
    else cancelAnimationFrame(queued);
  }
  queued = 0;
  for (const listener of listeners) listener();
}

export const store = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(patch: Partial<AnswerState>, now = false) {
    state = { ...state, ...patch };
    if (now) flushNow();
    else emit();
  },
  addRefs(list: unknown) {
    const next = new Map(state.refs);
    for (const item of Array.isArray(list) ? list : [list]) {
      const entry = normalizeRef(item);
      if (entry) next.set(entry.id, entry);
    }
    state = { ...state, refs: next };
    emit();
  },
  reset() {
    // A new answer brings its own refs: never let an old table vouch for a new program.
    state = { answer: state.answer + 1, refs: new Map(), text: "", phase: "idle", revision: 0, selected: null, notice: false, final: false, dropped: [] };
    flushNow();
  },
};

export function useAnswerState() {
  return React.useSyncExternalStore(store.subscribe, store.get, store.get);
}

export const RefsContext = React.createContext<ReadonlyMap<string, RefEntry>>(new Map());
export const SelectedContext = React.createContext<string | null>(null);

export function useRefs() {
  return React.useContext(RefsContext);
}

export function useSelected() {
  return React.useContext(SelectedContext);
}
