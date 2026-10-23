// One-time demonstrations (a Puzzle's walk, a Proof's check): each plays once its card is half in view, 400 ms later,
// and the figures of one answer take turns. `play` returns how long it runs, so the next one waits for it.
const queues = new Map<string, Promise<void>>();

export function whenSeen(el: Element | null, turn: string, play: () => number): () => void {
  if (!el || typeof IntersectionObserver !== "function") return () => {};
  let cancelled = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const next = (queues.get(turn) ?? Promise.resolve()).then(
        () =>
          new Promise<void>((resolve) => {
            window.setTimeout(() => {
              const ms = cancelled ? 0 : play();
              window.setTimeout(resolve, ms);
            }, 400);
          }),
      );
      queues.set(turn, next);
    },
    { threshold: 0.5 },
  );
  observer.observe(el);
  return () => {
    cancelled = true;
    observer.disconnect();
  };
}
