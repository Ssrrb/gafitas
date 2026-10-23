// The small blocks: Snippet, Callout, Check, Text.
import * as React from "react";
import { useTriggerAction } from "@openuidev/react-lang";
import { codeRows } from "../curate";
import { resolveRef } from "../refs";
import { TurnContext, usePicks, useRefs, useSelected } from "../store";
import { notQuite, S } from "../strings";
import { CodeLines } from "./Code";
import { RefChip } from "./RefChip";

export function SnippetBlock({ cite, note }: { cite: string; note?: string }) {
  const refs = useRefs();
  const selected = useSelected();
  const resolved = resolveRef(cite, refs);
  if (!resolved.ok) return null;
  const ref = resolved.ref;
  return (
    <figure className="g-snippet" data-selected={selected === ref.entry.id ? "" : undefined}>
      <figcaption className="g-snippet-head">
        <RefChip cite={cite} />
        {note ? <span className="g-snippet-note">{note}</span> : null}
      </figcaption>
      <CodeLines entry={ref.entry} rows={codeRows(ref.entry, ref.from, ref.to, ref.line)} />
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

/** A quiz's Checks report their first answer, so the Answer can say how many were right at the first try. */
export const QuizContext = React.createContext<{ answered: (id: string, right: boolean) => void }>({ answered: () => {} });

export function CheckBlock({ question, options, answer, why, cite, statementId }: { question: string; options: string[]; answer: number; why: string; cite?: string; statementId?: string }) {
  const [chosen, setChosen] = React.useState<number | null>(null);
  const refs = useRefs();
  const quiz = React.useContext(QuizContext);
  const proof = cite ? resolveRef(cite, refs) : null;
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
            <button
              key={i}
              type="button"
              className="g-option"
              data-state={state}
              aria-pressed={chosen === n}
              onClick={() => {
                if (chosen === null && statementId) quiz.answered(statementId, n === right);
                setChosen(n);
              }}
            >
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
      {chosen !== null && proof?.ok ? (
        <figure className="g-check-proof">
          <figcaption>
            <RefChip cite={cite!} />
          </figcaption>
          <CodeLines entry={proof.ref.entry} rows={codeRows(proof.ref.entry, proof.ref.from, proof.ref.to, proof.ref.line, 0, false)} />
        </figure>
      ) : null}
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
