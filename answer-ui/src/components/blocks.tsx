// The small blocks: Snippet, Callout, Check, Text.
import * as React from "react";
import { useTriggerAction } from "@openuidev/react-lang";
import { linesOf, resolveRef } from "../refs";
import { TurnContext, usePicks, useRefs, useSelected } from "../store";
import { notQuite, S } from "../strings";
import { hoverRef, openRef, RefChip } from "./RefChip";

export const SNIPPET_LINES = 14;

export function SnippetBlock({ cite, note }: { cite: string; note?: string }) {
  const refs = useRefs();
  const selected = useSelected();
  const resolved = resolveRef(cite, refs);
  if (!resolved.ok) return null;
  const ref = resolved.ref;
  const all = linesOf(ref.entry).filter((line) => line.n >= ref.from && line.n <= ref.to);
  let shown = all;
  if (all.length > SNIPPET_LINES) {
    const at = Math.max(0, all.findIndex((line) => line.n === ref.line));
    const start = Math.min(Math.max(0, at - Math.floor(SNIPPET_LINES / 2) + 1), all.length - SNIPPET_LINES);
    shown = all.slice(start, start + SNIPPET_LINES);
  }
  const mark = ref.single || (ref.line >= ref.from && ref.line <= ref.to && ref.entry.focus === ref.line) ? ref.line : null;
  const width = String(shown[shown.length - 1]?.n ?? 0).length;
  return (
    <figure className="g-snippet" data-selected={selected === ref.entry.id ? "" : undefined}>
      <figcaption className="g-snippet-head">
        <RefChip cite={cite} />
        {note ? <span className="g-snippet-note">{note}</span> : null}
      </figcaption>
      <pre className="g-code" style={{ "--g-gutter": `${width + 1}ch` } as React.CSSProperties}>
        <code>
          {shown.map((line) => (
            <span
              key={line.n}
              className="g-line"
              data-focus={line.n === mark ? "" : undefined}
              onClick={() => openRef(ref, line.n)}
              onPointerEnter={() => hoverRef(ref)}
              onPointerLeave={() => hoverRef(null)}
            >
              <span className="g-ln" aria-hidden="true">
                {line.n}
              </span>
              <span className="g-lt">{line.text || " "}</span>
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

export function CalloutBlock({ kind, text }: { kind: string; text: string }) {
  const watch = kind === "watch";
  return (
    <aside className="g-callout" data-kind={watch ? "watch" : "note"}>
      <p>
        <strong>{watch ? S.watch : S.note}</strong> <Inline md={text} />
      </p>
    </aside>
  );
}

export function CheckBlock({ question, options, answer, why, statementId }: { question: string; options: string[]; answer: number; why: string; statementId?: string }) {
  const [chosen, setChosen] = React.useState<number | null>(null);
  const trigger = useTriggerAction();
  const turn = React.useContext(TurnContext);
  const { busy } = usePicks();
  const right = Number(answer);
  const id = React.useId();
  return (
    <section className="g-check" aria-labelledby={`${id}-q`}>
      <p className="g-check-q" id={`${id}-q`}>
        <Inline md={question} />
      </p>
      <div className="g-options" role="group" aria-labelledby={`${id}-q`}>
        {options.slice(0, 3).map((option, i) => {
          const n = i + 1;
          const state = chosen === null ? undefined : n === right ? "right" : n === chosen ? "wrong" : undefined;
          return (
            <button key={i} type="button" className="g-option" data-state={state} aria-pressed={chosen === n} onClick={() => setChosen(n)}>
              <span className="g-option-n" aria-hidden="true">
                {n}
              </span>
              <span>
                <Inline md={option} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="g-why" aria-live="polite">
        {chosen === null ? null : (
          <>
            <strong>{chosen === right ? S.right : notQuite(right)}</strong> <Inline md={why} />
          </>
        )}
      </p>
      {chosen !== null && chosen !== right && !busy && !turn.live ? (
        <button
          type="button"
          className="g-button"
          onClick={() =>
            void trigger(`Explícame por qué la respuesta a «${question}» es «${options[right - 1] ?? right}».`, undefined, {
              type: "continue_conversation",
              params: { kind: "check", block: statementId, choices: [String(chosen)] },
            })
          }
        >
          {S.explain}
        </button>
      ) : null}
    </section>
  );
}

/** Bold and `code` only. */
export function Inline({ md }: { md: string }) {
  const parts = String(md ?? "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function TextBlock({ md }: { md: string }) {
  return (
    <p className="g-text">
      <Inline md={md} />
    </p>
  );
}
