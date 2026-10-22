// The figure: each real unit of code is a jigsaw tile, its project's colour; a joint is the edge two tiles
// share, its knob where one hands work to the next, labelled with what crosses. The shapes are SVG; every word
// is HTML on top (real buttons, CSS clamping), so VoiceOver reads the pieces, joints and steps as lists.
import * as React from "react";
import type { ElementNode } from "@openuidev/lang-core";
import { post } from "../post";
import { DEFAULT_WIDTH, layout, type Layout } from "../puzzle/layout";
import { basename, readPuzzle, type PuzzleModel, type PuzzlePiece } from "../puzzle/model";
import { KNOB_HALF, knobPath, knobSegment, tilePath } from "../puzzle/path";
import { isStill } from "../still";
import { TurnContext, useRefs, useSelected } from "../store";
import { adaptAria, alsoJoint, linesAria, linesShort, puzzleAria, S, stepOf, stepsCount } from "../strings";
import { Inline } from "./blocks";

/** Turns whose figure already played its entrance: a repair remount or a reflow never replays it. */
const entered = new Set<string>();

/** Break a code name before each "." and after each "_", so it wraps where a reader would. */
function CodeName({ name }: { name: string }) {
  const parts = name.split(/(?=\.)|(?<=_)/);
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i ? <wbr /> : null}
          {part}
        </React.Fragment>
      ))}
    </>
  );
}

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || DEFAULT_WIDTH);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const pieceAria = (piece: PuzzlePiece) => {
  if (piece.type === "Idea") return [piece.name, piece.note].filter(Boolean).join(". ");
  if (piece.type === "NewPiece") return `${piece.name}, ${S.isNew}, ${piece.path}`;
  const ref = piece.ref;
  const where = ref ? `${basename(ref.entry.path)}, ${linesAria(ref.from, ref.to)}` : "";
  return [piece.name, [piece.kind, piece.band].filter(Boolean).join(" de "), where, S.openCode].filter(Boolean).join(", ");
};

export function PuzzleBlock({ props }: { props: Record<string, unknown> }) {
  const refs = useRefs();
  // Lay out only once the steps are in: pieces and joints are complete by then, so nothing reflows mid-stream.
  if (!Array.isArray(props.steps)) return null;
  const model = readPuzzle({ type: "element", typeName: "Puzzle", props } as unknown as ElementNode, refs);
  if (model.pieces.length < 2) return null;
  return <Puzzle model={model} />;
}

function Puzzle({ model }: { model: PuzzleModel }) {
  const { pieces, joints, steps } = model;
  const selected = useSelected();
  const turn = React.useContext(TurnContext);
  const uid = React.useId().replace(/:/g, "");
  const stage = React.useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const [step, setStep] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [enter, setEnter] = React.useState(() => !turn.replay && !isStill() && !entered.has(turn.key));
  React.useEffect(() => {
    if (turn.key) entered.add(turn.key);
    // WebKit pauses animations outside the viewport: the entrance ends by the clock too, so no piece stays hidden.
    if (!enter) return;
    const timer = window.setTimeout(() => setEnter(false), 700);
    return () => window.clearTimeout(timer);
  }, [turn.key, enter]);

  const L: Layout = React.useMemo(
    () =>
      layout(
        pieces.map((p) => ({ band: p.band, name: p.name })),
        joints.map((j) => ({ from: j.from, to: j.to })),
        width,
      ),
    [pieces, joints, width],
  );

  const count = steps.length;
  const current = count ? Math.min(step, count - 1) : -1;
  const chosen = selected ? pieces.findIndex((p) => p.ref?.entry.id === selected) : -1;
  const shownStep = chosen >= 0 ? steps.findIndex((s) => s.lit && "piece" in s.lit && s.lit.piece === chosen) : current;
  const lit = chosen >= 0 ? { piece: chosen } : current >= 0 ? steps[current]!.lit : null;
  const litPiece = lit && "piece" in lit ? lit.piece : -1;
  const litJoint = lit && "joint" in lit ? lit.joint : -1;
  const joinedTo = (i: number) => joints.flatMap((j, index) => (j.from === i || j.to === i ? [index] : []));

  const go = (to: number) => {
    if (!count) return;
    setStep(((to % count) + count) % count);
  };

  const hoverPiece = (i: number | null) => {
    setHover(i);
    post({ type: "hover", ref: i === null ? null : (pieces[i]!.ref?.entry.id ?? null) });
  };

  const describe = (target: typeof lit) => {
    if (!target) return "";
    if ("piece" in target) return pieces[target.piece]?.name ?? "";
    const j = joints[target.joint];
    return j ? `${pieces[j.from]!.name} → ${pieces[j.to]!.name}` : "";
  };
  const hovered = hover === null ? null : pieces[hover]!;
  const readout = hovered
    ? hovered.ref
      ? `${hovered.ref.entry.repo}/${hovered.ref.entry.path} · ${linesAria(hovered.ref.from, hovered.ref.to)}`
      : hovered.path
    : [shownStep >= 0 ? stepOf(shownStep + 1, count) : count ? stepsCount(count) : "", describe(lit)].filter(Boolean).join(" · ");

  const bands = L.bands.filter(Boolean);
  const tintOfBand = (band: string) => pieces.find((p) => p.band === band && p.tint)?.tint ?? 0;
  const hasNew = pieces.some((p) => p.type === "NewPiece");
  const hasIdea = pieces.some((p) => p.type === "Idea");

  return (
    <figure className="g-puzzle">
      <div
        className="g-card"
        tabIndex={0}
        role="group"
        aria-roledescription={S.puzzle}
        aria-label={puzzleAria(model.title, pieces.length, joints.length)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") go(current + 1);
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp") go(current - 1);
          else if (event.key === "Home") go(0);
          else if (event.key === "End") go(count - 1);
          else return;
          event.preventDefault();
        }}
      >
        <header className="g-puzzle-head">
          <span className="g-puzzle-title">{model.title}</span>
          <ul className="g-legend" aria-label={S.projects}>
            {bands.map((band) => (
              <li key={band}>
                <span className="g-swatch" data-tint={tintOfBand(band)} aria-hidden="true" />
                {band}
              </li>
            ))}
            {hasNew ? (
              <li>
                <span className="g-swatch" data-type="new" aria-hidden="true" />
                {S.newCode}
              </li>
            ) : null}
            {hasIdea ? (
              <li>
                <span className="g-swatch" data-type="idea" aria-hidden="true" />
                {S.idea}
              </li>
            ) : null}
          </ul>
        </header>

        <div ref={stage} className="g-stage" data-enter={enter ? "" : undefined} style={{ height: L.height }}>
          <svg className="g-puzzle-svg" width={L.width} height={L.height} viewBox={`0 0 ${L.width} ${L.height}`} aria-hidden="true">
            <defs>
              {L.tiles.map((tile, i) => (
                <clipPath key={i} id={`${uid}-c${i}`}>
                  <path d={tilePath(tile, tile.top, tile.bottom)} />
                </clipPath>
              ))}
            </defs>
            <g>
              {L.tiles.map((tile, i) => (
                <path
                  key={i}
                  className="g-fill"
                  d={tilePath(tile, tile.top, tile.bottom)}
                  data-tint={pieces[i]!.tint || undefined}
                  data-type={pieces[i]!.type}
                  data-lit={i === litPiece ? "" : undefined}
                  style={{ "--i": i } as React.CSSProperties}
                />
              ))}
            </g>
            <g>
              {/* New pieces first: where a real neighbour touches the hole, its solid edge shows. */}
              {[...L.tiles.keys()]
                .sort((a, b) => Number(pieces[b]!.type === "NewPiece") - Number(pieces[a]!.type === "NewPiece"))
                .map((i) => (
                  <path key={i} className="g-edge" d={tilePath(L.tiles[i]!, L.tiles[i]!.top, L.tiles[i]!.bottom)} data-type={pieces[i]!.type} style={{ "--i": i } as React.CSSProperties} />
                ))}
            </g>
            <g>
              {hover !== null && hover !== litPiece ? (
                <path className="g-hover-edge" d={tilePath(L.tiles[hover]!, L.tiles[hover]!.top, L.tiles[hover]!.bottom)} clipPath={`url(#${uid}-c${hover})`} />
              ) : null}
              {litPiece >= 0 && L.tiles[litPiece] ? (
                <path className="g-lit-edge" d={tilePath(L.tiles[litPiece]!, L.tiles[litPiece]!.top, L.tiles[litPiece]!.bottom)} clipPath={`url(#${uid}-c${litPiece})`} />
              ) : null}
              {L.seams.map((seam) =>
                seam.joint === litJoint ? (
                  <path key={seam.joint} className="g-knob-lit" d={knobPath(seam.x, seam.y, seam.s)} />
                ) : hover !== null && (seam.upper === hover || seam.lower === hover) ? (
                  <path key={seam.joint} className="g-knob-hover" d={`M ${seam.x - KNOB_HALF} ${seam.y} ${knobSegment(seam.x, seam.y, seam.s, 1)}`} />
                ) : null,
              )}
            </g>
          </svg>

          <ol className="g-tiles" aria-label={S.pieces}>
            {pieces.map((piece, i) => {
              const tile = L.tiles[i]!;
              const style = { left: tile.x, top: tile.y, width: tile.w, height: tile.h, "--i": i } as React.CSSProperties;
              const events = {
                onPointerEnter: () => hoverPiece(i),
                onPointerLeave: () => hoverPiece(null),
                onFocus: () => hoverPiece(i),
                onBlur: () => hoverPiece(null),
              };
              const ref = piece.ref;
              return (
                <li key={piece.id} className="g-tile-slot" style={style} aria-current={i === litPiece ? "true" : undefined}>
                  {piece.type === "Piece" ? (
                    <button
                      type="button"
                      className="g-tile"
                      aria-label={pieceAria(piece)}
                      onClick={() => ref && post({ type: "open", ref: ref.entry.id, line: ref.line })}
                      {...events}
                    >
                      <code className="g-tile-name">
                        <CodeName name={piece.name} />
                      </code>
                      <span className="g-tile-meta">{[ref ? linesShort(basename(ref.entry.path), ref.from, ref.to) : "", piece.kind].filter(Boolean).join(" · ")}</span>
                      {piece.code ? <code className="g-tile-code">{piece.code}</code> : null}
                    </button>
                  ) : piece.type === "NewPiece" ? (
                    <div className="g-tile" data-type="new" {...events}>
                      <code className="g-tile-name">
                        <CodeName name={piece.name} />
                      </code>
                      <span className="g-tile-meta">
                        {basename(piece.path)} · {S.isNew}
                      </span>
                      <span className="g-tile-new">
                        {piece.note ? <span className="g-tile-note">{piece.note}</span> : <span />}
                        <button
                          type="button"
                          className="g-button g-adapt"
                          aria-label={adaptAria(piece.adapts ? `${piece.adapts.repo}/${piece.adapts.path}` : "", piece.name)}
                          onClick={() => post({ type: "adapt", ref: piece.adapts?.id ?? null, path: piece.path })}
                        >
                          {S.adapt}
                        </button>
                      </span>
                    </div>
                  ) : (
                    <div className="g-tile" data-type="idea">
                      <span className="g-tile-name g-idea-name">{piece.name}</span>
                      {piece.note ? <span className="g-tile-note">{piece.note}</span> : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <ul className="g-joints" aria-label={S.joints}>
            {L.seams.map((seam) => {
              const joint = joints[seam.joint]!;
              const { label } = seam;
              const same = L.tiles[seam.upper]!.x === L.tiles[seam.lower]!.x;
              return (
                <li
                  key={joint.id}
                  className="g-joint"
                  data-align={label.align}
                  data-place={same ? "mid" : "above"}
                  data-lit={seam.joint === litJoint ? "" : undefined}
                  data-hover={hover !== null && (seam.upper === hover || seam.lower === hover) ? "" : undefined}
                  style={{ left: label.x, top: label.y, width: label.w, height: label.h, "--i": seam.lower } as React.CSSProperties}
                >
                  <span className="g-sr">
                    {pieces[joint.from]!.name} → {pieces[joint.to]!.name}:{" "}
                  </span>
                  <span className="g-joint-text">
                    <span className="g-diamond" aria-hidden="true" />
                    {joint.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {L.loose.length ? (
          <ul className="g-loose">
            {L.loose.map((index) => {
              const joint = joints[index]!;
              return (
                <li key={joint.id} data-lit={index === litJoint ? "" : undefined}>
                  <span className="g-diamond" aria-hidden="true" />
                  {alsoJoint(pieces[joint.from]!.name, pieces[joint.to]!.name, joint.label)}
                </li>
              );
            })}
          </ul>
        ) : null}

        <footer className="g-puzzle-foot">
          <span className="g-hint">{S.hint}</span>
          <span className="g-readout" aria-live="polite">
            {readout}
          </span>
        </footer>
      </div>

      {model.caption ? (
        <figcaption className="g-caption">
          <Inline md={model.caption} />
        </figcaption>
      ) : null}

      {count ? (
        <ol className="g-steps" aria-label={S.steps}>
          {steps.map((s, i) => (
            <li key={s.id} aria-current={i === shownStep ? "step" : undefined}>
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
      ) : null}
    </figure>
  );
}
