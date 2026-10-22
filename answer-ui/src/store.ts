import * as React from "react";
import { normalizeRef, type RefEntry } from "./refs";

export type Phase = "idle" | "streaming" | "done";

/** One line of what Pi is doing, written by Swift in Spanish. `places`: show the found pieces under it. */
export interface TrailLine {
  text: string;
  running?: boolean;
  places?: boolean;
}

export interface Trail {
  lines: TrailLine[];
  /** Set once the answer is drawn: the trail folds to this line, with "Ver el proceso" to open it again. */
  summary?: string;
  /** Pi's thinking, in full, for the open process. */
  thinking?: string;
}

/** A turn asked by picking in an earlier one: which turn, which block, what was chosen. */
export interface Via {
  turn: string;
  block: string;
  choices: string[];
}

export interface Turn {
  id: string;
  question: string;
  via?: Via;
  text: string;
  phase: Phase;
  /** Bumped whenever the program text is replaced wholesale (repair turn). */
  revision: number;
  /** Something was dropped after the repair turn. */
  notice: boolean;
  /** Set by replace(): the repair turn is over; `dropped` is what was still broken and is no longer shown. */
  final: boolean;
  dropped: { id: string; message: string }[];
  trail: Trail;
  /** Drawn from the history log: no entrance, no error reports, nothing to repair. */
  replay: boolean;
}

export interface ThreadState {
  /** Bumped by reset(): a new chat remounts everything (no stale figure state). */
  chat: number;
  refs: ReadonlyMap<string, RefEntry>;
  turns: Turn[];
  /** The native selection: light the piece citing this ref. */
  selected: string | null;
  /** Pi is answering: nothing on the page may send another question. */
  busy: boolean;
}

export const newTurn = (id: string, question = "", patch: Partial<Turn> = {}): Turn => ({
  id,
  question,
  text: "",
  phase: "idle",
  revision: 0,
  notice: false,
  final: false,
  dropped: [],
  trail: { lines: [] },
  replay: false,
  ...patch,
});

let state: ThreadState = { chat: 0, refs: new Map(), turns: [], selected: null, busy: false };
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
  set(patch: Partial<ThreadState>, now = false) {
    state = { ...state, ...patch };
    if (now) flushNow();
    else emit();
  },
  /** The turn the stream goes to: the last one, made on the spot when Swift streams without opening one. */
  current(): Turn {
    const last = state.turns[state.turns.length - 1];
    if (last) return last;
    const turn = newTurn("t1");
    state = { ...state, turns: [turn] };
    return turn;
  },
  patchTurn(id: string, patch: Partial<Turn>, now = false) {
    state = { ...state, turns: state.turns.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)) };
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
    // A new chat brings its own refs: never let an old table vouch for a new program.
    state = { chat: state.chat + 1, refs: new Map(), turns: [], selected: null, busy: state.busy };
    flushNow();
  },
};

export function useThread() {
  return React.useSyncExternalStore(store.subscribe, store.get, store.get);
}

export const RefsContext = React.createContext<ReadonlyMap<string, RefEntry>>(new Map());
export const SelectedContext = React.createContext<string | null>(null);
/** Which turn a block belongs to, so a figure plays its entrance once per answer (and never when replayed); `live`
 * while it still streams. */
export const TurnContext = React.createContext<{ key: string; id: string; replay: boolean; live: boolean }>({ key: "", id: "", replay: false, live: false });

/** What was picked from each block so far, by "turn:block", from the later turns' `via`; and whether Pi is busy. */
export const PicksContext = React.createContext<{ picked: ReadonlyMap<string, Via[]>; busy: boolean }>({ picked: new Map(), busy: false });

export function usePicks() {
  return React.useContext(PicksContext);
}

export function useRefs() {
  return React.useContext(RefsContext);
}

export function useSelected() {
  return React.useContext(SelectedContext);
}
