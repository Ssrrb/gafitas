// Real lines, as curate.ts picked them: line numbers, the lit lines marked, comments muted, and each fold a button
// that opens its lines in place. Clicking a line opens it in the editor.
import * as React from "react";
import { indentOf, type CodeRow } from "../curate";
import { linesOf, type RefEntry, type ResolvedRef } from "../refs";
import { hiddenLines, showHidden } from "../strings";
import { hoverRef, openRef } from "./RefChip";

export function CodeLines({
  entry,
  rows,
  className,
  badges,
  onLine,
  after,
  style,
  echo,
  onHoverText,
}: {
  entry: RefEntry;
  rows: CodeRow[];
  className?: string;
  /** A number in the gutter of these lines (Walkthrough stops), and whether it is the current one. */
  badges?: Map<number, { n: number; current: boolean }>;
  /** A click on a line; return true when handled, so it doesn't open the editor. */
  onLine?: (n: number) => boolean;
  /** A row under line n. */
  after?: (n: number) => React.ReactNode;
  style?: React.CSSProperties;
  /** Lines to mark as echoing what's hovered elsewhere (SideBySide). */
  echo?: (text: string) => boolean;
  /** The text of the line under the pointer, or null when it leaves. */
  onHoverText?: (text: string | null) => void;
}) {
  const [open, setOpen] = React.useState<ReadonlySet<number>>(() => new Set());
  const raw = React.useMemo(() => new Map(linesOf(entry).map((line) => [line.n, line.text])), [entry]);
  const firstLine = rows.find((row) => row.kind === "line");
  // How much indent curate.ts took off, so opened lines line up with the rest.
  const cut = firstLine?.kind === "line" ? indentOf(raw.get(firstLine.n) ?? "") - indentOf(firstLine.text) : 0;
  const shown = rows.flatMap((row): CodeRow[] =>
    row.kind === "gap" && open.has(row.from)
      ? Array.from({ length: row.to - row.from + 1 }, (_, i) => {
          const text = raw.get(row.from + i) ?? "";
          return { kind: "line", n: row.from + i, text: text.slice(Math.min(cut, indentOf(text))), lit: false, comment: false };
        })
      : [row],
  );
  const last = Math.max(0, ...shown.map((row) => (row.kind === "line" ? row.n : row.to)));
  const asRef: ResolvedRef = { entry, from: entry.first, to: entry.last, line: entry.first, single: false };
  let lit = 0;
  return (
    <pre className={["g-code", className].filter(Boolean).join(" ")} style={{ "--g-gutter": badges?.size ? `calc(${String(last).length + 1}ch + 22px)` : `${String(last).length + 1}ch`, ...style } as React.CSSProperties}>
      <code>
        {shown.map((row) => {
          if (row.kind === "gap") {
            const count = row.to - row.from + 1;
            return (
              <button key={`gap-${row.from}`} type="button" className="g-gap" aria-label={showHidden(count)} onClick={() => setOpen(new Set([...open, row.from]))}>
                {hiddenLines(count)}
                {"\n"}
              </button>
            );
          }
          const badge = badges?.get(row.n);
          return (
            <React.Fragment key={row.n}>
              <span
                className="g-line"
                data-focus={row.lit ? "" : undefined}
                style={row.lit ? ({ "--k": Math.min(lit++, 3) } as React.CSSProperties) : undefined}
                data-comment={row.comment ? "" : undefined}
                data-echo={echo?.(row.text) ? "" : undefined}
                onClick={() => {
                  if (!onLine?.(row.n)) openRef(asRef, row.n);
                }}
                onPointerEnter={() => {
                  hoverRef(asRef);
                  onHoverText?.(row.text);
                }}
                onPointerLeave={() => {
                  hoverRef(null);
                  onHoverText?.(null);
                }}
              >
                <span className="g-ln" aria-hidden="true">
                  {badge ? (
                    <span className="g-stop-badge" data-current={badge.current ? "" : undefined}>
                      {badge.n}
                    </span>
                  ) : null}
                  {row.n}
                </span>
                <span className="g-lt">{row.text || " "}</span>
                {"\n"}
              </span>
              {after?.(row.n)}
            </React.Fragment>
          );
        })}
      </code>
    </pre>
  );
}
