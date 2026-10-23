// "El rastro": what Pi did for this turn. Swift writes the lines (in Spanish); while Pi works the last one is
// live, the found places show as loose pieces, and once the answer is drawn it all folds into one line.
import * as React from "react";
import { post } from "../post";
import { useRefs } from "../store";
import { moreSteps, S } from "../strings";
import type { Trail } from "../store";
import type { RefEntry } from "../refs";
import { Others } from "./Others";

const SHOWN = 8;

/** The place's own name: "en HTTPAdapter.send" → "HTTPAdapter.send"; else the file. */
const DEF = /^\s*(?:async\s+)?(?:def|class|function|func|fn)\s+([\w$]+)/;

// The summary is a symbol ("en Session.send") or, for a ref with none, its first line: keep just a def's or class's
// name. Given a cited line, name the def or class that line sits in, when it isn't the summary's own.
export const placeName = (entry: RefEntry, line?: number) => {
  const summary = (entry.summary ?? "").replace(/^(en|in)\s+/, "").trim();
  const own = summary.match(DEF)?.[1] ?? (summary.split(".").pop() || undefined);
  if (line !== undefined) {
    const lines = entry.text.split("\n");
    for (let n = Math.min(line, entry.last) - entry.first; n >= 0; n--) {
      const name = lines[n]?.match(DEF)?.[1];
      if (!name) continue;
      if (name !== own) return name;
      break;
    }
  }
  return summary.match(DEF)?.[1] ?? (summary || entry.path.split("/").pop() || entry.id);
};

function Places() {
  const refs = useRefs();
  const byRepo = new Map<string, RefEntry[]>();
  for (const entry of refs.values()) {
    const list = byRepo.get(entry.repo) ?? [];
    list.push(entry);
    byRepo.set(entry.repo, list);
  }
  if (!byRepo.size) return null;
  return (
    <ul className="g-places">
      {[...byRepo].map(([repo, list]) => (
        <li key={repo} className="g-places-row">
          <span className="g-places-repo">
            <span className="g-dot" data-tint={((list[0]!.tint ?? 0) % 4) + 1} aria-hidden="true" />
            {repo}
          </span>
          <span className="g-places-pieces">
            {list.slice(0, 3).map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="g-loose-piece"
                data-tint={((entry.tint ?? 0) % 4) + 1}
                title={`${entry.repo}/${entry.path}`}
                onClick={() => post({ type: "open", ref: entry.id, line: entry.focus ?? entry.first })}
                onPointerEnter={() => post({ type: "hover", ref: entry.id })}
                onPointerLeave={() => post({ type: "hover", ref: null })}
              >
                <code>{placeName(entry)}</code>
              </button>
            ))}
            {list.length > 3 ? <span className="g-places-more">+{list.length - 3}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TrailView({ trail, live, program = "" }: { trail: Trail; live: boolean; program?: string }) {
  const [open, setOpen] = React.useState(false);
  const lines = trail.lines;
  if (!lines.length && !trail.summary) return null;
  const folded = Boolean(trail.summary) && !open;
  if (folded) {
    return (
      <p className="g-trail-sum" data-running={live ? "" : undefined}>
        <span>{trail.summary}</span>
        {lines.length || trail.thinking ? (
          <button type="button" className="g-link" aria-expanded="false" onClick={() => setOpen(true)}>
            {S.showProcess} ›
          </button>
        ) : null}
      </p>
    );
  }
  const shown = open ? lines : lines.slice(-SHOWN);
  const hidden = lines.length - shown.length;
  return (
    <div className="g-trail" aria-live="off">
      <ol className="g-trail-lines">
        {hidden > 0 ? <li className="g-trail-more">{moreSteps(hidden)}</li> : null}
        {shown.map((line, i) => (
          <li key={i} data-running={line.running && live ? "" : undefined}>
            <span>{line.text}</span>
            {line.places ? <Places /> : null}
          </li>
        ))}
      </ol>
      {open && trail.thinking ? (
        <section className="g-thinking" aria-label={S.thinking}>
          <p className="g-thinking-head">{S.thinking}</p>
          <div className="g-thinking-text" tabIndex={0}>
            {trail.thinking}
          </div>
        </section>
      ) : null}
      {open && program ? <Others program={program} /> : null}
      {open ? (
        <button type="button" className="g-link" aria-expanded="true" onClick={() => setOpen(false)}>
          {S.hideProcess}
        </button>
      ) : null}
    </div>
  );
}
