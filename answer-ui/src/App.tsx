import * as React from "react";
import { Renderer, type OpenUIError } from "@openuidev/react-lang";
import { Others } from "./components/Others";
import { TrailView } from "./components/Trail";
import { library } from "./library";
import { post } from "./post";
import { isStill } from "./still";
import { S } from "./strings";
import { RefsContext, SelectedContext, TurnContext, useThread, type Turn } from "./store";
import { validateProgram, type AnswerError } from "./validate";
import type { RefTable } from "./refs";

function TurnView({ turn, chat, first, last, refs }: { turn: Turn; chat: number; first: boolean; last: boolean; refs: RefTable }) {
  const renderErrors = React.useRef<OpenUIError[]>([]);
  const lastPosted = React.useRef("");

  // After the stream ends (and after a repair), report every problem, each with its statement id.
  // The Renderer's own effects run before this one, so its render errors for this commit are in.
  React.useEffect(() => {
    if (turn.phase !== "done" || turn.replay) return;
    let errors: AnswerError[];
    if (turn.final) errors = turn.dropped;
    else {
      errors = validateProgram(turn.text, refs);
      for (const error of renderErrors.current) {
        if (error.source !== "runtime") continue;
        errors.push({ id: error.statementId ?? error.component ?? "root", message: error.message });
      }
    }
    const key = JSON.stringify([turn.final, errors]);
    if (key === lastPosted.current) return;
    lastPosted.current = key;
    post(turn.final ? { type: "errors", turn: turn.id, errors, final: true, program: turn.text } : { type: "errors", turn: turn.id, errors, program: turn.text });
  }, [turn.phase, turn.text, turn.final, turn.dropped, turn.replay, turn.id, refs]);

  // A follow-up brings its question to the top of the sheet; a reopened chat opens at its last turn. The view never
  // follows the stream after that, so it doesn't fight your scrolling.
  const section = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (turn.replay ? last && !first : !first) section.current?.scrollIntoView({ block: "start", behavior: turn.replay || isStill() ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Heading = first ? "h1" : "h2";
  const context = React.useMemo(() => ({ key: `${chat}:${turn.id}`, replay: turn.replay }), [chat, turn.id, turn.replay]);
  return (
    <section ref={section} className="g-turn" aria-label={turn.question || undefined}>
      {turn.question ? <Heading className="g-question">{turn.question}</Heading> : null}
      <TrailView trail={turn.trail} live={turn.phase !== "done" && !turn.replay} />
      <TurnContext.Provider value={context}>
        {turn.text ? (
          <Renderer
            key={turn.revision}
            response={turn.text}
            library={library}
            isStreaming={turn.phase === "streaming"}
            onError={(errors) => {
              renderErrors.current = errors;
            }}
          />
        ) : null}
      </TurnContext.Provider>
      {turn.notice ? (
        <p className="g-notice" role="status">
          {S.partly}
        </p>
      ) : null}
      {last && turn.phase === "done" ? <Others program={turn.text} /> : null}
    </section>
  );
}

export function App() {
  const s = useThread();
  return (
    <RefsContext.Provider value={s.refs}>
      <SelectedContext.Provider value={s.selected}>
        <main className="g-page" key={s.chat}>
          {s.turns.map((turn, i) => (
            <TurnView key={turn.id} turn={turn} chat={s.chat} first={i === 0} last={i === s.turns.length - 1} refs={s.refs} />
          ))}
        </main>
      </SelectedContext.Provider>
    </RefsContext.Provider>
  );
}
