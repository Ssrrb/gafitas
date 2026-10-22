// JS → Swift. Standalone (dev page, tests) there is no message handler: log instead, and keep a copy.
export type Outgoing =
  | { type: "ready" }
  | { type: "open"; ref: string; line: number | null }
  | { type: "hover"; ref: string | null }
  | { type: "adapt"; ref: string | null; path?: string }
  | { type: "errors"; turn: string; errors: { id: string; message: string }[]; final?: boolean; program: string };

interface Handler {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { gafitas?: Handler } };
    __gafitasPosted?: Outgoing[];
  }
}

let lastHover: string | null = null;

export function post(message: Outgoing) {
  if (message.type === "hover") {
    if (message.ref === lastHover) return;
    lastHover = message.ref;
  }
  if (typeof window === "undefined") return;
  (window.__gafitasPosted ??= []).push(message);
  const handler = window.webkit?.messageHandlers?.gafitas;
  if (handler) handler.postMessage(message);
  else console.log("[gafitas →]", JSON.stringify(message));
}
