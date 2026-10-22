import * as React from "react";
import { Renderer, type OpenUIError } from "@openuidev/react-lang";
import { library } from "./library";
import { post } from "./post";
import { RefsContext, SelectedContext, useAnswerState } from "./store";
import { validateProgram, type AnswerError } from "./validate";

export function App() {
  const s = useAnswerState();
  const renderErrors = React.useRef<OpenUIError[]>([]);
  const lastPosted = React.useRef("");

  // After the stream ends (and after a repair), report every problem, each with its statement id.
  // The Renderer's own effects run before this one, so its render errors for this commit are in.
  React.useEffect(() => {
    if (s.phase !== "done") return;
    let errors: AnswerError[];
    if (s.final) errors = s.dropped;
    else {
      errors = validateProgram(s.text, s.refs);
      for (const error of renderErrors.current) {
        if (error.source !== "runtime") continue;
        errors.push({ id: error.statementId ?? error.component ?? "root", message: error.message });
      }
    }
    const key = JSON.stringify([s.answer, s.final, errors]);
    if (key === lastPosted.current) return;
    lastPosted.current = key;
    post(s.final ? { type: "errors", errors, final: true } : { type: "errors", errors });
  }, [s.phase, s.text, s.refs, s.final, s.dropped, s.answer]);

  return (
    <RefsContext.Provider value={s.refs}>
      <SelectedContext.Provider value={s.selected}>
        <main className="g-page" key={s.answer}>
          {s.text ? (
            <Renderer
              key={s.revision}
              response={s.text}
              library={library}
              isStreaming={s.phase === "streaming"}
              onError={(errors) => {
                renderErrors.current = errors;
              }}
            />
          ) : null}
          {s.notice ? (
            <p className="g-notice" role="status">
              Part of this answer couldn't be drawn. Showing the rest.
            </p>
          ) : null}
        </main>
      </SelectedContext.Provider>
    </RefsContext.Provider>
  );
}
