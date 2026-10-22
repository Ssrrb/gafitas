// Reading real code: Walkthrough (stop by stop through a ref's lines), SideBySide (one idea in two places) and Matches
// (what in one repo corresponds to what in another, as sure as the model is). Every line is the ref's own; clicking one
// opens it in the editor.
import * as React from "react";
import { useTriggerAction } from "@openuidev/react-lang";
import { CircleHelp } from "lucide-react";
import { post } from "../post";
import { codeRows, enclosingDef, litLines, rowsOf, type CodeRow } from "../curate";
import { linesOf, resolveRef, type RefEntry, type RefTable, type ResolvedRef } from "../refs";
import { TurnContext, usePicks, useRefs } from "../store";
import { S } from "../strings";
import { Inline } from "./blocks";
import { placeName } from "./Trail";
import { CodeLines } from "./Code";
import { RefChip } from "./RefChip";

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

/** The rows of a Walkthrough with stop `current` open: its lines (the long ones cut to head and tail), the other stops
 * of the same ref folded to their first line, the def they sit in on top. */
function walkRows(entry: RefEntry, stops: { ref: ResolvedRef }[], current: number) {
  const mine = stops.map((s, i) => ({ ...s, i })).filter((s) => s.ref.entry.id === entry.id);
  const open = stops[current]!.ref;
  const show = litLines(open.from, open.to);
  for (const s of mine) show.add(s.ref.from);
  const def = enclosingDef(linesOf(entry), Math.min(...mine.map((s) => s.ref.from)));
  if (def !== null) show.add(def);
  return rowsOf(entry, show, (n) => n >= open.from && n <= open.to);
}

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
  const rows = walkRows(entry, stops, current);
  // The card keeps the height of its tallest stop, so stepping never moves what's below.
  const tallest = Math.max(...stops.map((_, i) => walkRows(stops[i]!.ref.entry, stops, i).length));
  const lastLit = Math.max(...rows.flatMap((row) => (row.kind === "line" && row.lit ? [row.n] : [])));
  const badges = new Map(stops.flatMap((s, i) => (s.ref.entry.id === entry.id ? [[s.ref.from, { n: i + 1, current: i === current }] as const] : [])));
  const go = (to: number) => setAt(((to % stops.length) + stops.length) % stops.length);
  const title = str(props.title);
  const readout = `${S.stop} ${current + 1} ${S.of} ${stops.length}`;
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
          <span className="g-walk-nav">
            <RefChip cite={`${entry.id}:${stop.ref.from}-${stop.ref.to}`} label={fileOf(entry)} />
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
        </header>
        <CodeLines
          key={current}
          entry={entry}
          rows={rows}
          className="g-code-learn"
          badges={badges}
          style={{ minHeight: `calc(${tallest} * 1.6em + 16px + 3em)` }}
          onLine={(n) => {
            // A folded stop's line opens that stop; any other line opens the code.
            const other = stops.findIndex((s, i) => i !== current && s.ref.entry.id === entry.id && s.ref.from === n);
            if (other < 0) return false;
            go(other);
            return true;
          }}
          after={(n) =>
            n === lastLit && stop.text ? (
              <span className="g-stop-say">
                <Inline md={stop.text} />
                {"\n"}
              </span>
            ) : null
          }
        />
      </div>
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

/** At most this many rows a side; the shorter side takes more context until both match. */
const SIDE_ROWS = 8;

function sideRows(side: SideProps | undefined, refs: RefTable, context: number) {
  const r = resolveRef(side?.ref, refs);
  return r.ok ? codeRows(r.ref.entry, r.ref.from, r.ref.to, r.ref.line, context) : null;
}

/** The names a line uses, for the echo between two sides: 4+ characters, not keywords. */
const STOP = new Set(["self", "this", "return", "const", "def", "function", "async", "await", "None", "null", "true", "false"]);
const namesIn = (text: string) => new Set((text.match(/[A-Za-z_$][\w$]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

function SidePane({ side, rows, echo, onHoverText }: { side: SideProps; rows: CodeRow[] | null; echo?: (text: string) => boolean; onHoverText?: (text: string | null) => void }) {
  const refs = useRefs();
  const r = resolveRef(side.ref, refs);
  if (!r.ok || !rows) return <section className="g-side" />;
  const { entry } = r.ref;
  return (
    <section className="g-side" aria-label={side.title}>
      <p className="g-side-repo">
        <span className="g-dot" data-tint={((entry.tint ?? 0) % 4) + 1} aria-hidden="true" />
        {entry.repo}
      </p>
      <h3 className="g-side-title">
        <code>{side.title}</code> <RefChip cite={side.ref ?? ""} label={fileOf(entry)} />
      </h3>
      <CodeLines entry={entry} rows={rows} echo={echo} onHoverText={onHoverText} />
      {/* Older chats wrote points; one at most, the code says the rest. */}
      {side.points?.length ? (
        <p className="g-side-point">
          <Inline md={side.points[0]!} />
        </p>
      ) : null}
    </section>
  );
}

export function SideBySideBlock({ title, left, right, note }: { title?: string; left?: SideProps; right?: SideProps; note?: string }) {
  const refs = useRefs();
  // A line hovered on one side lights the lines on the other that use the same names.
  const [hovered, setHovered] = React.useState<{ side: "l" | "r"; names: Set<string> } | null>(null);
  if (!left || !right) return null;
  const echoOn = (side: "l" | "r") =>
    hovered && hovered.side !== side && hovered.names.size ? (text: string) => [...namesIn(text)].some((w) => hovered.names.has(w)) : undefined;
  const hoverOn = (side: "l" | "r") => (text: string | null) => setHovered(text ? { side, names: namesIn(text) } : null);
  let l = sideRows(left, refs, 1);
  let r = sideRows(right, refs, 1);
  // Even the panes: the shorter side shows a little more of its own context.
  for (let context = 2; l && r && l.length !== r.length && context <= 6; context++) {
    if (l.length < r.length && l.length < SIDE_ROWS) l = sideRows(left, refs, context);
    else if (r.length < l.length && r.length < SIDE_ROWS) r = sideRows(right, refs, context);
    else break;
  }
  return (
    <figure className="g-sxs">
      <div className="g-card">
        {title ? (
          <header className="g-puzzle-head">
            <span className="g-puzzle-title">{title}</span>
          </header>
        ) : null}
        <div className="g-sxs-grid">
          <SidePane side={left} rows={l} echo={echoOn("l")} onHoverText={hoverOn("l")} />
          <SidePane side={right} rows={r} echo={echoOn("r")} onHoverText={hoverOn("r")} />
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
