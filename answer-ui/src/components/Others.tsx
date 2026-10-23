// "Otros lugares encontrados": the places the dig-up found that the answer doesn't cite, so nothing found is
// out of reach now that the cards column is gone.
import * as React from "react";
import { post } from "../post";
import { rangeText } from "../refs";
import { useRefs } from "../store";
import { morePlaces, openAria, S } from "../strings";
import { shortPath } from "./RefChip";

const SHOWN = 5;
const CITED = /"([A-Za-z]+\d+)(?::\d+(?:\s*[-–]\s*\d+)?)?"/g;

export function Others({ program }: { program: string }) {
  const refs = useRefs();
  const [all, setAll] = React.useState(false);
  const cited = new Set([...program.matchAll(CITED)].map((m) => m[1]!.toLowerCase()));
  const rest = [...refs.values()].filter((entry) => !cited.has(entry.id));
  if (!rest.length || !cited.size) return null;
  const shown = all ? rest : rest.slice(0, SHOWN);
  return (
    <section className="g-others" aria-label={S.others}>
      <h3 className="g-section">{S.others}</h3>
      <ul>
        {shown.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="g-other"
              aria-label={openAria(`${entry.repo}/${entry.path}`, entry.first, entry.last)}
              onClick={() => post({ type: "open", ref: entry.id, line: entry.focus ?? entry.first })}
              onPointerEnter={() => post({ type: "hover", ref: entry.id })}
              onPointerLeave={() => post({ type: "hover", ref: null })}
            >
              <span className="g-dot" data-tint={((entry.tint ?? 0) % 4) + 1} aria-hidden="true" />
              <code className="g-other-path">{shortPath(entry.repo, entry.path)}</code>
              <span className="g-badge">{rangeText(entry.first, entry.last)}</span>
              {entry.summary ? <span className="g-other-summary">{entry.summary}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {rest.length > SHOWN && !all ? (
        <button type="button" className="g-link" onClick={() => setAll(true)}>
          {morePlaces(rest.length - SHOWN)}
        </button>
      ) : null}
    </section>
  );
}
