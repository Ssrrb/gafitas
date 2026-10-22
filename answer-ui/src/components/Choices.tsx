// The blocks a reader answers by picking: Caminos (ways to go), Elige (a question with icon tiles), Tablero (what's
// there, what's missing, what to decide) and Sigue con (next questions). Only a button sends: each send is a model call,
// so a pick goes through OpenUI's own action (Renderer onAction → Swift → the chat's next question).
import * as React from "react";
import { useTriggerAction } from "@openuidev/react-lang";
import { Check } from "lucide-react";
import { Icon } from "../icons";
import { resolveRef } from "../refs";
import { QUIZ, TurnContext, usePicks, useRefs, useSelected } from "../store";
import { S } from "../strings";
import { placeName } from "./Trail";
import { RefChip } from "./RefChip";
import { post } from "../post";

interface Node {
  typeName?: string;
  statementId?: string;
  props?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nodes = (list: unknown, type: string) =>
  (Array.isArray(list) ? list : []).filter((n): n is Node => Boolean(n) && (n as Node).typeName === type);

/** Spanish "y", or "e" before an i sound: "Elijo: A e Ítems". */
export function listEs(items: string[]) {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1]!;
  const and = /^h?[ií]/i.test(last) ? "e" : "y";
  return `${items.slice(0, -1).join(", ")} ${and} ${last}`;
}

/** What was picked from this block in later turns, and whether sending is open now. */
function usePickState(block: string | undefined) {
  const turn = React.useContext(TurnContext);
  const { picked, busy } = usePicks();
  const vias = block ? (picked.get(`${turn.id}:${block}`) ?? []) : [];
  const chosen = new Set(vias.flatMap((via) => via.choices));
  return { turn, chosen, closed: busy || turn.live };
}

function useSend() {
  const trigger = useTriggerAction();
  return (message: string, params: Record<string, unknown>) => {
    void trigger(message, undefined, { type: "continue_conversation", params });
  };
}

const EFFORT: Record<string, string> = { bajo: "bajo", poco: "bajo", low: "bajo", medio: "medio", medium: "medio", alto: "alto", mucho: "alto", high: "alto" };
export const effortOf = (v: unknown) => EFFORT[str(v).toLowerCase()] ?? "";

export function WaysBlock({ props, statementId }: { props: Record<string, unknown>; statementId?: string }) {
  const refs = useRefs();
  const send = useSend();
  const { turn, chosen, closed } = usePickState(statementId);
  const [sent, setSent] = React.useState<string | null>(null);
  const ways = nodes(props.ways, "Way");
  if (ways.length < 2) return null;
  const question = str(props.question);
  return (
    <section className="g-panel g-ways" aria-label={question} data-count={ways.length}>
      <h2 className="g-panel-title">{question}</h2>
      <div className="g-ways-grid">
        {ways.map((way) => {
          const p = way.props ?? {};
          const id = way.statementId ?? str(p.title);
          const title = str(p.title);
          const uses = (Array.isArray(p.uses) ? p.uses : []).map(String).filter((cite) => resolveRef(cite, refs).ok).slice(0, 2);
          const effort = effortOf(p.effort);
          const picked = chosen.has(id) || sent === id;
          const others = ways.filter((w) => w !== way).map((w) => `${w.statementId} «${str(w.props?.title)}»`).join(", ");
          return (
            <article key={id} className="g-way" data-picked={picked ? "" : undefined}>
              <h3 className="g-way-title">
                <Icon name={p.icon} />
                <span>{title}</span>
              </h3>
              <p className="g-way-what">{str(p.what)}</p>
              <div className="g-way-uses">
                {uses.length ? <span className="g-way-label">{S.reuses}</span> : null}
                {uses.length ? (
                  <span className="g-way-chips">
                    {uses.map((cite) => {
                      const r = resolveRef(cite, refs);
                      return <RefChip key={cite} cite={cite} label={r.ok ? placeName(r.ref.entry, r.ref.from) : undefined} />;
                    })}
                  </span>
                ) : (
                  <span className="g-muted">{S.fromScratch}</span>
                )}
              </div>
              <p className="g-way-effort">
                <span className="g-way-label">{S.effort}</span> {effort || "—"}
              </p>
              {str(p.tradeoff) ? (
                <p className="g-way-tradeoff">
                  <span className="g-way-label">{S.tradeoff}</span> {str(p.tradeoff)}
                </p>
              ) : null}
              <div className="g-way-act">
                {picked ? (
                  <span className="g-picked">
                    <Check size={14} strokeWidth={2} aria-hidden="true" />
                    {sent === id && !chosen.has(id) ? S.sent : S.picked}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="g-button"
                    aria-label={`${S.goThisWay}: ${title}`}
                    aria-disabled={closed || undefined}
                    onClick={() => {
                      if (closed) return;
                      setSent(id);
                      send(`Quiero seguir por «${title}».`, {
                        kind: "ways",
                        block: statementId,
                        choices: [id],
                        note: `The user picked ${id} «${title}» from your Ways ${statementId} in ${turn.id}; the others were ${others}.`,
                      });
                    }}
                  >
                    {S.goThisWay}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {closed ? <p className="g-panel-foot">{S.waitPi}</p> : null}
    </section>
  );
}

export function PickBlock({ props, statementId }: { props: Record<string, unknown>; statementId?: string }) {
  const send = useSend();
  const { turn, chosen, closed } = usePickState(statementId);
  const multiple = props.multiple === true;
  const options = nodes(props.options, "Option");
  const [picks, setPicks] = React.useState<string[]>([]);
  const [sentKey, setSentKey] = React.useState<string | null>(null);
  const name = React.useId();
  if (options.length < 2) return null;
  const question = str(props.question);
  const labelOf = (id: string) => str(options.find((o) => (o.statementId ?? str(o.props?.label)) === id)?.props?.label);
  const current = picks.length ? picks : [...chosen];
  const message = current.length ? `Elijo: ${listEs(current.map(labelOf))}.` : "";
  const isSent = sentKey !== null && sentKey === current.join("|");
  const go = () => {
    if (closed || !picks.length || isSent) return;
    setSentKey(picks.join("|"));
    send(message, {
      kind: "pick",
      block: statementId,
      choices: picks,
      note: `The user answered your Pick ${statementId} in ${turn.id} («${question}») with: ${picks.map((id) => `${id} «${labelOf(id)}»`).join(", ")}.`,
    });
  };
  return (
    <fieldset
      className="g-panel g-pick"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          go();
        }
      }}
    >
      <legend className="g-panel-title">{question}</legend>
      <p className="g-pick-kind">{multiple ? S.pickMany : S.pickOne}</p>
      <div className="g-pick-grid" data-count={options.length}>
        {options.map((option) => {
          const p = option.props ?? {};
          const id = option.statementId ?? str(p.label);
          const on = current.includes(id);
          return (
            <label key={id} className="g-tile-pick" data-on={on ? "" : undefined}>
              <input
                className="g-sr"
                type={multiple ? "checkbox" : "radio"}
                name={name}
                checked={on}
                onChange={() => setPicks((list) => (multiple ? (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]) : [id]))}
              />
              <Icon name={p.icon} size={20} />
              <span className="g-tile-pick-text">
                <span className="g-tile-pick-label">{str(p.label)}</span>
                {str(p.note) ? <span className="g-tile-pick-note">{str(p.note)}</span> : null}
              </span>
              <span className="g-mark" data-kind={multiple ? "multiple" : "single"} aria-hidden="true" />
            </label>
          );
        })}
      </div>
      <div className="g-pick-foot">
        <button type="button" className="g-button g-primary" aria-disabled={closed || !picks.length || isSent || undefined} onClick={go}>
          {isSent || (chosen.size && !picks.length) ? S.sent : S.go}
        </button>
        <span className="g-pick-preview" aria-live="polite">
          {closed ? S.waitPi : message ? `${S.willSend} «${message}»` : S.pickFirst}
        </span>
        <button type="button" className="g-link g-pick-other" onClick={() => post({ type: "draft", message: "" })}>
          {S.somethingElse}
        </button>
      </div>
    </fieldset>
  );
}

const COLUMNS = ["tienes", "falta", "decidir"] as const;
type Column = (typeof COLUMNS)[number];
export const columnOf = (v: unknown): Column | null => {
  const raw = str(v).toLowerCase();
  return COLUMNS.find((c) => raw.includes(c)) ?? null;
};

export function BoardBlock({ props, statementId }: { props: Record<string, unknown>; statementId?: string }) {
  const refs = useRefs();
  const selected = useSelected();
  const send = useSend();
  const { turn, chosen, closed } = usePickState(statementId);
  const items = nodes(props.items, "Item");
  if (items.length < 2) return null;
  const title = str(props.title);
  const cited = new Set<string>();
  const repos = new Set<string>();
  const byColumn = new Map<Column, Node[]>(COLUMNS.map((c) => [c, []]));
  for (const item of items) {
    const column = columnOf(item.props?.column);
    if (column) byColumn.get(column)!.push(item);
    const r = resolveRef(str(item.props?.ref), refs);
    if (r.ok) {
      cited.add(r.ref.entry.id);
      if (r.ref.entry.repo) repos.add(r.ref.entry.repo);
    }
  }
  return (
    <section className="g-panel g-board" aria-label={title}>
      <h2 className="g-panel-title">{title}</h2>
      <div className="g-board-grid">
        {COLUMNS.map((column) => {
          const list = byColumn.get(column)!;
          return (
            <section key={column} className="g-board-col" aria-label={S.columns[column]}>
              <h3 className="g-board-head">
                {S.columns[column]} <span className="g-count">{list.length}</span>
              </h3>
              {list.length ? null : <p className="g-muted g-board-empty">{column === "tienes" ? S.noCodeYet : S.nothingHere}</p>}
              {list.map((item) => {
                const p = item.props ?? {};
                const id = item.statementId ?? str(p.title);
                const r = resolveRef(str(p.ref), refs);
                const itemTitle = str(p.title);
                const asked = chosen.has(id);
                const message = column === "falta" ? `¿Cómo hago «${itemTitle}»?` : column === "decidir" ? `Ayúdame a decidir: ${itemTitle}` : "";
                return (
                  <article
                    key={id}
                    className="g-board-item"
                    data-column={column}
                    data-tint={r.ok ? ((r.ref.entry.tint ?? 0) % 4) + 1 : undefined}
                    data-selected={r.ok && selected === r.ref.entry.id ? "" : undefined}
                    data-asked={asked ? "" : undefined}
                  >
                    <button
                      type="button"
                      className="g-board-hit"
                      aria-disabled={(column !== "tienes" && closed) || undefined}
                      aria-label={column === "tienes" ? `${itemTitle}, ${S.openCode}` : message}
                      onClick={() => {
                        if (column === "tienes") {
                          if (r.ok) post({ type: "open", ref: r.ref.entry.id, line: r.ref.line });
                          return;
                        }
                        if (closed) return;
                        send(message, {
                          kind: "board",
                          block: statementId,
                          choices: [id],
                          note: `The user asked about ${id} «${itemTitle}» (${column}) on your Board ${statementId} in ${turn.id}.`,
                        });
                      }}
                      onPointerEnter={() => r.ok && post({ type: "hover", ref: r.ref.entry.id })}
                      onPointerLeave={() => post({ type: "hover", ref: null })}
                    />
                    <h4 className="g-board-title">
                      <Icon name={p.icon} />
                      <span>{itemTitle}</span>
                    </h4>
                    {column === "tienes" && r.ok ? (
                      <p className="g-board-meta">
                        {r.ref.entry.path.split("/").pop()}:{r.ref.from === r.ref.to ? r.ref.from : `${r.ref.from}–${r.ref.to}`}
                      </p>
                    ) : null}
                    {str(p.note) ? <p className="g-board-note">{str(p.note)}</p> : null}
                    {column !== "tienes" && r.ok ? (
                      <p className="g-board-near">
                        {S.goesWith} <RefChip cite={str(p.ref)} label={placeName(r.ref.entry, r.ref.from)} />
                      </p>
                    ) : null}
                    {column === "tienes" ? null : <p className="g-board-ask">{asked ? S.asked : column === "falta" ? S.howDoI : S.helpDecide} ›</p>}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      {cited.size ? <p className="g-panel-foot">{S.restsOn(cited.size, [...repos])}</p> : null}
    </section>
  );
}

/** The next questions as one row of chips, and «Ponme a prueba» after an answer with real code in it. */
export function NextBlock({ props, statementId, quiz = false }: { props: Record<string, unknown>; statementId?: string; quiz?: boolean }) {
  const send = useSend();
  const block = statementId ?? "answer";
  const { turn, chosen, closed } = usePickState(block);
  const questions = [...new Set((Array.isArray(props.questions) ? props.questions : []).map(String).map((q) => q.trim()).filter(Boolean))].slice(0, 3);
  if (turn.live || (!questions.length && !quiz)) return null;
  const chip = (id: string, label: React.ReactNode, onClick: () => void, extra?: Record<string, string>) => {
    const asked = chosen.has(id);
    return (
      <li key={id}>
        <button type="button" className="g-next-q" data-asked={asked ? "" : undefined} aria-disabled={closed || undefined} onClick={() => !closed && onClick()} {...extra}>
          {asked ? <Check className="g-icon" size={13} strokeWidth={2} aria-hidden="true" /> : null}
          {label}
        </button>
      </li>
    );
  };
  return (
    <nav className="g-next" aria-label={S.next}>
      <ul>
        {questions.map((question, i) => chip(`q${i + 1}`, <span>{question}</span>, () => send(question, { kind: "next", block, choices: [`q${i + 1}`] })))}
        {quiz
          ? chip(
              QUIZ,
              <>
                <Icon name="checklist" size={13} />
                <span>{S.quizMe}</span>
              </>,
              () =>
                send(S.quizMeMessage, {
                  kind: "next",
                  block,
                  choices: [QUIZ],
                  note:
                    `The user asked to be quizzed on your answer in ${turn.id}. Reply with root = Answer(lede, [c1, c2, c3]) and nothing else: ` +
                    "a lede of at most 8 words, then 2 or 3 Check(question, options, answer, why, ref) about the code you cited there, " +
                    'each ref the lines that prove the answer. For example: c1 = Check("¿Quién llama a urlopen?", ["Session.send", ' +
                    '"HTTPAdapter.send", "PoolManager.urlopen"], 2, "HTTPAdapter.send le pasa la petición a conn.urlopen.", "r2:696")',
                }),
              { "data-quiz": "" },
            )
          : null}
      </ul>
    </nav>
  );
}
