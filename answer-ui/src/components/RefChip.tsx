import * as React from "react";
import { post } from "../post";
import { rangeText, resolveRef, type ResolvedRef } from "../refs";
import { useRefs, useSelected } from "../store";
import { openAria } from "../strings";

/** "repo/…/dir/file.py" when the full path would crowd the chip. */
export function shortPath(repo: string, path: string) {
  const full = repo ? `${repo}/${path}` : path;
  if (full.length <= 44) return full;
  const parts = path.split("/");
  if (parts.length <= 2) return full;
  return `${repo ? `${repo}/` : ""}…/${parts.slice(-2).join("/")}`;
}

export function openRef(ref: ResolvedRef, line?: number) {
  post({ type: "open", ref: ref.entry.id, line: line ?? ref.line });
}

export function hoverRef(ref: ResolvedRef | null) {
  post({ type: "hover", ref: ref ? ref.entry.id : null });
}

/** A chip for one ref: tint dot, repo/path, line badge. Unknown refs render nothing (validation reports them). */
export function RefChip({ cite, label }: { cite: string; label?: string }) {
  const refs = useRefs();
  const selected = useSelected();
  const resolved = resolveRef(cite, refs);
  if (!resolved.ok) return null;
  const ref = resolved.ref;
  const { entry } = ref;
  const full = `${entry.repo ? `${entry.repo}/` : ""}${entry.path}`;
  const text = label?.trim() || shortPath(entry.repo, entry.path);
  return (
    <button
      type="button"
      className="g-chip"
      data-selected={selected === entry.id ? "" : undefined}
      title={`${full} ${rangeText(ref.from, ref.to)}${entry.summary ? ` · ${entry.summary}` : ""}`}
      aria-label={openAria(full, ref.from, ref.to)}
      onClick={(event) => {
        event.stopPropagation();
        openRef(ref);
      }}
      onPointerEnter={() => hoverRef(ref)}
      onPointerLeave={() => hoverRef(null)}
      onFocus={() => hoverRef(ref)}
      onBlur={() => hoverRef(null)}
    >
      <span className="g-dot" data-tint={((entry.tint ?? 0) % 4) + 1} aria-hidden="true" />
      <span className="g-chip-text">{text}</span>
      <span className="g-badge">{rangeText(ref.from, ref.to)}</span>
    </button>
  );
}
