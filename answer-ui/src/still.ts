// Reduced motion, plus a dev override (?still=1) so screenshots are deterministic.
const QUERY = "(prefers-reduced-motion: reduce)";
let forced = false;

export const forceStill = (on: boolean) => {
  forced = on;
  if (typeof document !== "undefined") document.documentElement.toggleAttribute("data-still", on);
};

export function isStill() {
  if (forced) return true;
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}
