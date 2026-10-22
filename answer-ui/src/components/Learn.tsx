// Reading real code: Walkthrough (stop by stop through a ref's lines), SideBySide (one idea in two places) and Matches
// (what in one repo corresponds to what in another, as sure as the model is). Every line is the ref's own; clicking one
// opens it in the editor.
import * as React from "react";
import { useTriggerAction } from "@openuidev/react-lang";
import { CircleHelp } from "lucide-react";
import { post } from "../post";
import { linesOf, resolveRef, type RefEntry, type ResolvedRef } from "../refs";
import { TurnContext, usePicks, useRefs } from "../store";
import { S } from "../strings";
import { Inline } from "./blocks";
import { placeName } from "./Trail";
import { hoverRef, openRef, RefChip } from "./RefChip";

interface Node {
  typeName?: string;
  statementId?: string;
  props?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nodes = (list: unknown, type: string) =>
  (Array.isArray(list) ? list : []).filter((n): n is Node => Boolean(n) && (n as Node).typeName === type);
const fileOf = (entry: RefEntry) => entry.path.split("/").pop() ?? entry.path;
const span = (from: number, to: number) => (from === to ? `${from}` : `${from}–${to}`);

function usePickOpen(block?: string) {
  const turn = React.useContext(TurnContext);
  const { picked, busy } = usePicks();
  const asked = new Set((block ? (picked.get(`${turn.id}:${block}`) ?? []) : []).flatMap((via) => via.choices));
  return { turn, asked, closed: busy || turn.live };
}

function useSend() {
  const trigger = useTriggerAction();
  return (message: string, params: Record<string, unknown>) => void trigger(message, undefined, { type: "continue_conversation", params });
}

/** A run of a ref's real lines, `lit` from–to, each line opening the code; `after(n)` adds a row under line n. */
function CodeView({ entry, first, last, lit, badges, after }: { entry: RefEntry; first: number; last: number; lit?: [number, number]; badges?: Map<number, number>; after?: (n: number) => React.ReactNode }) {
  const lines = linesOf(entry).filter((line) => line.n >= first && line.n <= last);
  const width = String(last).length;
  const asRef: ResolvedRef = { entry, from: first, to: last, line: lit?.[0] ?? first, single: false };
  return (
    <pre className="g-code g-code-learn" style={{ "--g-gutter": `${width + 1}ch` } as React.CSSProperties}>
      <code>
        {lines.map((line) => {
          const on = lit && line.n >= lit[0] && line.n <= lit[1];
          const badge = badges?.get(line.n);
          return (
            <React.Fragment key={line.n}>
              <span
                className="g-line"
                data-focus={on ? "" : undefined}
                onClick={() => openRef(asRef, line.n)}
                onPointerEnter={() => hoverRef(asRef)}
                onPointerLeave={() => hoverRef(null)}
              >
                <span className="g-ln" aria-hidden="true">
                  {badge ? <span className="g-stop-badge" data-current={on ? "" : undefined}>{badge}</span> : null}
                  {line.n}
                </span>
                <span className="g-lt">{line.text || " "}</span>
                {"\n"}
              </span>
              {after?.(line.n)}
            </React.Fragment>
          );
        })}
      </code>
    </pre>
  );
}

const WINDOW = 22;

export function WalkthroughBlock({ props }: { props: Record<string, unknown> }) {
  const refs = useRefs();
  const [at, setAt] = React.useState(0);
  const stops = nodes(props.stops, "Lines")
    .map((node) => {
      const r = resolveRef(str(node.props?.ref), refs);
      return r.ok ? { id: node.statementId ?? "", ref: r.ref, text: str(node.props?.text) } : null;
    })
    .filter((stop): stop is NonNullable<typeof stop> => stop !== null);
  if (stops.length < 2) return null;
  const current = Math.min(at, stops.length - 1);
  const stop = stops[current]!;
  const entry = stop.ref.entry;
  const mine = stops.filter((s) => s.ref.entry.id === entry.id);
  // The stops of this ref, two lines of context, at most WINDOW lines around the current stop.
  let first = Math.max(entry.first, Math.min(...mine.map((s) => s.ref.from)) - 2);
  let last = Math.min(entry.last, Math.max(...mine.map((s) => s.ref.to)) + 2);
  if (last - first + 1 > WINDOW) {
    first = Math.max(entry.first, Math.min(stop.ref.from - 4, stop.ref.to + 4 - WINDOW + 1));
    last = Math.min(entry.last, first + WINDOW - 1);
  }
  const badges = new Map(stops.flatMap((s, i) => (s.ref.entry.id === entry.id ? [[s.ref.from, i + 1] as const] : [])));
  const go = (to: number) => setAt(((to % stops.length) + stops.length) % stops.length);
  const title = str(props.title);
  const readout = `${S.stop} ${current + 1} ${S.of} ${stops.length} · ${S.lines} ${span(stop.ref.from, stop.ref.to)}`;
  return (
    <figure className="g-puzzle g-walk">
      <div
        className="g-card"
        tabIndex={0}
        role="group"
        aria-roledescription={S.walkthrough}
        aria-label={`${title}. ${stops.length} ${S.stops}.`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") go(current + 1);
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp") go(current - 1);
          else if (event.key === "Home") go(0);
          else if (event.key === "End") go(stops.length - 1);
          else return;
          event.preventDefault();
        }}
      >
        <header className="g-puzzle-head">
          <span className="g-puzzle-title">{title}</span>
          <RefChip cite={`${entry.id}:${entry.first}-${entry.last}`} />
        </header>
        <CodeView
          entry={entry}
          first={first}
          last={last}
          lit={[stop.ref.from, stop.ref.to]}
          badges={badges}
          after={(n) =>
            n === Math.min(stop.ref.to, last) ? (
              <span className="g-stop-say">
                {current + 1} {S.of} {stops.length} · <Inline md={stop.text} />
                {"\n"}
              </span>
            ) : null
          }
        />
        <footer className="g-puzzle-foot">
          <span className="g-hint">{S.walkHint}</span>
          <span className="g-walk-nav">
            <span className="g-readout" aria-live="polite">
              {readout}
            </span>
            <button type="button" className="g-button g-step-button" aria-label={S.prevStop} onClick={() => go(current - 1)}>
              ‹
            </button>
            <button type="button" className="g-button g-step-button" aria-label={S.nextStop} onClick={() => go(current + 1)}>
              ›
            </button>
          </span>
        </footer>
      </div>
      <ol className="g-steps" aria-label={S.stopsList}>
        {stops.map((s, i) => (
          <li key={`${s.id}-${i}`} aria-current={i === current ? "step" : undefined}>
            {i === 0 || stops[i - 1]!.ref.entry.id !== s.ref.entry.id ? (
              stops.some((o) => o.ref.entry.id !== stops[0]!.ref.entry.id) ? <p className="g-stop-file">{fileOf(s.ref.entry)}</p> : null
            ) : null}
            <button type="button" onClick={() => go(i)}>
              <span className="g-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="g-step-text">
                <Inline md={s.text} />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="g-link g-walk-ask"
        onClick={() => post({ type: "draft", message: `Sobre ${fileOf(entry)}:${span(stop.ref.from, stop.ref.to)}: ` })}
      >
        {S.askLines}
      </button>
    </figure>
  );
}

export interface SideProps {
  title?: string;
  ref?: string;
  points?: string[];
}

const CONTEXT = 3;
const SIDE_LINES = 14;

function SidePane({ side }: { side: SideProps }) {
  const refs = useRefs();
  const r = resolveRef(side.ref, refs);
  if (!r.ok) return <section className="g-side" />;
  const { entry } = r.ref;
  // A whole ref lights its focus line; a range lights itself. A few lines of real context around it, at most 14.
  const lit: [number, number] = r.ref.from === entry.first && r.ref.to === entry.last ? [r.ref.line, r.ref.line] : [r.ref.from, r.ref.to];
  let first = Math.max(entry.first, lit[0] - CONTEXT);
  let last = Math.min(entry.last, lit[1] + CONTEXT);
  if (last - first + 1 > SIDE_LINES) last = first + SIDE_LINES - 1;
  if (last - first + 1 < SIDE_LINES) first = Math.max(entry.first, last - SIDE_LINES + 1);
  return (
    <section className="g-side" aria-label={side.title}>
      <p className="g-side-repo">
        <span className="g-dot" data-tint={((entry.tint ?? 0) % 4) + 1} aria-hidden="true" />
        {entry.repo}
      </p>
      <h3 className="g-side-title">
        <code>{side.title}</code> <RefChip cite={side.ref ?? ""} label={fileOf(entry)} />
      </h3>
      <CodeView entry={entry} first={first} last={last} lit={lit} />
      {side.points?.length ? (
        <ul className="g-side-points">
          {side.points.slice(0, 4).map((point, i) => (
            <li key={i}>
              <Inline md={point} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function SideBySideBlock({ title, left, right, note }: { title?: string; left?: SideProps; right?: SideProps; note?: string }) {
  if (!left || !right) return null;
  return (
    <figure className="g-sxs">
      <div className="g-card">
        {title ? (
          <header className="g-puzzle-head">
            <span className="g-puzzle-title">{title}</span>
          </header>
        ) : null}
        <div className="g-sxs-grid">
          <SidePane side={left} />
          <SidePane side={right} />
        </div>
      </div>
      {note ? (
        <figcaption className="g-caption">
          <Inline md={note} />
        </figcaption>
      ) : null}
    </figure>
  );
}

const SURE: Record<string, "segura" | "probable" | "dudosa"> = { segura: "segura", sure: "segura", seguro: "segura", probable: "probable", likely: "probable", dudosa: "dudosa", unsure: "dudosa", dudoso: "dudosa" };
export const sureOf = (v: unknown) => SURE[str(v).toLowerCase()] ?? "dudosa";

export function MatchesBlock({ props, statementId }: { props: Record<string, unknown>; statementId?: string }) {
  const refs = useRefs();
  const send = useSend();
  const { turn, asked, closed } = usePickOpen(statementId);
  const pairs = nodes(props.pairs, "Match")
    .map((node) => {
      const a = resolveRef(str(node.props?.a), refs);
      const b = resolveRef(str(node.props?.b), refs);
      return a.ok ? { id: node.statementId ?? "", a: a.ref, aCite: str(node.props?.a), b: b.ok ? b.ref : null, bCite: str(node.props?.b), sure: sureOf(node.props?.sure), note: str(node.props?.note) } : null;
    })
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null);
  if (pairs.length < 2) return null;
  const left = pairs[0]!.a.entry.repo;
  const right = pairs.find((p) => p.b)?.b?.entry.repo ?? [...refs.values()].find((e) => e.repo !== left)?.repo ?? "";
  const levels = (["segura", "probable", "dudosa"] as const).filter((level) => pairs.some((p) => p.sure === level));
  const title = str(props.title);
  return (
    <section className="g-panel g-matches" aria-label={title}>
      <header className="g-matches-head">
        <h2 className="g-panel-title">{title}</h2>
        <ul className="g-legend" aria-label={S.sureness}>
          {levels.map((level) => (
            <li key={level}>
              <svg className="g-sure-mark" width="22" height="8" aria-hidden="true" data-sure={level}>
                <line x1="1" y1="4" x2="21" y2="4" />
              </svg>
              {level}
            </li>
          ))}
        </ul>
      </header>
      <div className="g-matches-cols" aria-hidden="true">
        <span>
          <span className="g-dot" data-tint={((pairs[0]!.a.entry.tint ?? 0) % 4) + 1} />
          {left}
        </span>
        <span />
        <span>
          <span className="g-dot" data-tint={((pairs.find((p) => p.b)?.b!.entry.tint ?? 1) % 4) + 1} />
          {right}
        </span>
      </div>
      <ul className="g-matches-list">
        {pairs.map((pair) => {
          const aName = placeName(pair.a.entry, pair.a.from);
          const bName = pair.b ? placeName(pair.b.entry, pair.b.from) : "";
          const message = pair.b ? `Pon lado a lado «${aName}» de ${left} y «${bName}» de ${right}.` : `¿Cómo haría ${right} lo que hace «${aName}»?`;
          return (
            <li key={pair.id} className="g-match" data-sure={pair.sure} data-asked={asked.has(pair.id) ? "" : undefined}>
              <span className="g-match-a">
                <RefChip cite={pair.aCite} label={aName} />
              </span>
              <span className="g-match-link">
                <svg width="100%" height="8" aria-hidden="true" data-sure={pair.sure} className="g-sure-mark" preserveAspectRatio="none" viewBox="0 0 100 8">
                  <line x1="0" y1="4" x2="100" y2="4" />
                </svg>
                <span className="g-match-word">
                  {pair.sure === "dudosa" ? <CircleHelp className="g-icon" size={12} strokeWidth={1.75} aria-hidden="true" /> : null}
                  {pair.sure}
                </span>
              </span>
              <span className="g-match-b">{pair.b ? <RefChip cite={pair.bCite} label={bName} /> : <span className="g-muted">— {S.noEquivalent} {right}</span>}</span>
              <button
                type="button"
                className="g-link g-match-act"
                aria-disabled={closed || undefined}
                onClick={() => {
                  if (closed) return;
                  send(message, { kind: "matches", block: statementId, choices: [pair.id], note: `From your Matches ${statementId} in ${turn.id}, pair ${pair.id}.` });
                }}
              >
                {pair.b ? S.sideBySide : `${S.howWould} ${right}?`}
              </button>
              {pair.note ? <span className="g-match-note">{pair.note}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
