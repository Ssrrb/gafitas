import * as React from "react";
import type { SolidPaths, Tone } from "../vendor/anatomy/iso-kit";
import { isStill } from "./still";
import type { SlotKey } from "../machines/slots";

export interface SlotInfo {
  label: string;
  status: "exists" | "new" | "concept";
  refId: string | null;
  line: number | null;
  number: number;
}

export interface FigureContextValue {
  lit: SlotKey | null;
  hover: SlotKey | null;
  slots: ReadonlyMap<SlotKey, SlotInfo>;
  onHover: (slot: SlotKey | null) => void;
  onOpen: (slot: SlotKey) => void;
}

export const FigureContext = React.createContext<FigureContextValue>({
  lit: null,
  hover: null,
  slots: new Map(),
  onHover: () => {},
  onOpen: () => {},
});

/**
 * One part of the machine, as drawn. The art inside is static and cached per slot count; lit, hover and
 * status arrive through context so only these wrappers re-render. `decor` copies the styling onto a second
 * group of the same part (its back half, drawn earlier in painter's order) without making it a second button.
 */
export function SlotG({ slot, decor = false, children }: { slot: SlotKey; decor?: boolean; children: React.ReactNode }) {
  const { lit, hover, slots, onHover, onOpen } = React.useContext(FigureContext);
  const info = slots.get(slot);
  const status = info?.status ?? "none";
  const common = {
    "data-slot": slot,
    "data-status": status,
    "data-lit": lit === slot ? "" : undefined,
    "data-hover": hover === slot ? "" : undefined,
  };
  if (decor || !info) return <g className="g-part" {...common}>{children}</g>;
  const button = Boolean(info.refId);
  return (
    <g
      className="g-part"
      {...common}
      data-hot=""
      role={button ? "button" : undefined}
      tabIndex={button ? 0 : undefined}
      aria-label={button ? `${info.number}. ${info.label}: open the code` : undefined}
      onPointerEnter={() => onHover(slot)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(slot)}
      onBlur={() => onHover(null)}
      onClick={button ? () => onOpen(slot) : undefined}
      onKeyDown={
        button
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(slot);
              }
            }
          : undefined
      }
    >
      {children}
    </g>
  );
}

export interface LiveSolidApi {
  set(paths: SolidPaths | null): void;
}

/** A solid whose paths change every frame (a key turning with its shaft, a flap on its hinge). */
export function LiveSolid({ api, tone = "hi", crease = "faint", initial }: { api: React.RefObject<LiveSolidApi | null>; tone?: Tone; crease?: Tone | "none"; initial?: SolidPaths | null }) {
  const nodes = React.useRef<(SVGPathElement | null)[]>([]);
  const last = React.useRef<SolidPaths | null>(initial ?? null);
  React.useLayoutEffect(() => {
    api.current = {
      set(paths) {
        const list = nodes.current;
        const d = paths ? [paths.fill, ...paths.shades, paths.top, crease === "none" ? "" : paths.crease, paths.outline] : ["", "", "", "", "", "", "", ""];
        d.forEach((value, index) => {
          const node = list[index];
          if (node && node.getAttribute("d") !== value) node.setAttribute("d", value);
        });
        last.current = paths;
      },
    };
    return () => {
      api.current = null;
    };
  }, [api, crease]);
  const p = initial ?? null;
  const bind = (index: number) => (node: SVGPathElement | null) => {
    nodes.current[index] = node;
  };
  return (
    <g className="iso-solid" data-seamless="">
      <path ref={bind(0)} className="iso-fill" d={p?.fill ?? ""} />
      {[0, 1, 2, 3].map((shade) => (
        <path key={shade} ref={bind(1 + shade)} className="iso-shade" data-shade={shade} d={p?.shades[shade] ?? ""} />
      ))}
      <path ref={bind(5)} className="iso-top" d={p?.top ?? ""} />
      <path ref={bind(6)} className="iso-line iso-crease" data-tone={crease === "none" ? "faint" : crease} d={crease === "none" ? "" : (p?.crease ?? "")} />
      <path ref={bind(7)} className="iso-line iso-edge" data-tone={tone} d={p?.outline ?? ""} />
    </g>
  );
}

export const TAU = 0.22;
export const TOUR_FIRST = 1400;
export const TOUR_BACK = 3600;

export function follow(current: number, target: number, dt: number, seconds = TAU, calm = false) {
  if (calm) return target;
  const next = current + (target - current) * (1 - Math.exp(-dt / seconds));
  return Math.abs(target - next) < 1e-3 ? target : next;
}

/** Critically damped: velocity is continuous too, so a turn starts and stops without a jolt. */
export function settle(state: { x: number; v: number }, target: number, dt: number, seconds: number, calm = false) {
  if (calm) {
    state.x = target;
    state.v = 0;
    return false;
  }
  const w = 1 / seconds;
  for (let i = 0; i < 4; i++) {
    const h = dt / 4;
    state.v += (w * w * (target - state.x) - 2 * w * state.v) * h;
    state.x += state.v * h;
  }
  if (Math.abs(target - state.x) < 1e-4 && Math.abs(state.v) < 1e-4) {
    state.x = target;
    state.v = 0;
    return false;
  }
  return true;
}

/**
 * One frame loop per figure. `tick(dt, calm)` writes attributes through refs and returns true while anything
 * still moves. The loop sleeps when settled or offscreen; `kick()` wakes it.
 */
export function useFrameLoop(tick: (dt: number, calm: boolean) => boolean, visible: boolean) {
  const latest = React.useRef(tick);
  latest.current = tick;
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const shown = React.useRef(visible);
  shown.current = visible;
  const kick = React.useCallback(() => {
    if (frame.current || !shown.current) return;
    last.current = 0;
    const step = (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, 1 / 30) : 1 / 60;
      last.current = now;
      const more = latest.current(dt, isStill());
      frame.current = more && shown.current ? requestAnimationFrame(step) : 0;
    };
    frame.current = requestAnimationFrame(step);
  }, []);
  React.useEffect(() => {
    if (visible) kick();
    else {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
  }, [visible, kick]);
  React.useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );
  return kick;
}

export function useVisible<T extends Element>(ref: React.RefObject<T | null>) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => setVisible(Boolean(entries[entries.length - 1]?.isIntersecting)), { rootMargin: "120px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}
