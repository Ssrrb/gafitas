// The small blocks: CodeRef, Snippet, Callout, Compare, NewCode, Check, Text.
import * as React from "react";
import { post } from "../post";
import { linesOf, refIdOf, resolveRef } from "../refs";
import { useRefs, useSelected } from "../store";
import { hoverRef, openRef, RefChip } from "./RefChip";

export const SNIPPET_LINES = 14;

export function CodeRefBlock({ cite, label }: { cite: string; label?: string }) {
  return (
    <p className="g-coderef">
      <RefChip cite={cite} label={label} />
    </p>
  );
}

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
        <strong>{watch ? "Watch out:" : "Note:"}</strong> <Inline md={text} />
      </p>
    </aside>
  );
}

export interface SideProps {
  title?: string;
  ref?: string;
  points?: string[];
}

export function CompareBlock({ left, right }: { left?: SideProps; right?: SideProps }) {
  const side = (s: SideProps | undefined, which: string) =>
    s ? (
      <section className="g-side" aria-label={s.title}>
        <h3>{s.title}</h3>
        {s.ref ? <RefChip cite={s.ref} /> : null}
        <ul>
          {(s.points ?? []).slice(0, 4).map((point, i) => (
            <li key={i}>
              <Inline md={point} />
            </li>
          ))}
        </ul>
      </section>
    ) : (
      <section className="g-side" key={which} />
    );
  return (
    <div className="g-compare">
      {side(left, "left")}
      {side(right, "right")}
    </div>
  );
}

export interface NewItemProps {
  path?: string;
  what?: string;
  adapts?: string;
}

export function NewCodeBlock({ items }: { items: NewItemProps[] }) {
  const refs = useRefs();
  if (!items.length) return null;
  return (
    <section className="g-newcode" aria-label="New code">
      <h2 className="g-section">New code</h2>
      <ul>
        {items.map((item, i) => {
          const adapts = resolveRef(item.adapts, refs);
          return (
            <li key={i} className="g-newitem">
              <div className="g-newitem-main">
                <code className="g-path">{item.path}</code>
                <span className="g-what">
                  <Inline md={item.what ?? ""} />
                </span>
                {adapts.ok ? (
                  <span className="g-adapts">
                    <span className="g-from">from</span> <RefChip cite={item.adapts!} compact />
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="g-button"
                onClick={() => post({ type: "adapt", ref: adapts.ok ? adapts.ref.entry.id : refIdOf(item.adapts), path: item.path })}
              >
                Adapt…
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CheckBlock({ question, options, answer, why }: { question: string; options: string[]; answer: number; why: string }) {
  const [chosen, setChosen] = React.useState<number | null>(null);
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
            <strong>{chosen === right ? "Right." : `Not quite: it's ${right}.`}</strong> <Inline md={why} />
          </>
        )}
      </p>
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
