// The rule-proving figure: premises over an inference bar, the rule's name on the bar, the conclusion under it, down to
// the goal. The one thing to do with it: break a premise and watch checking stop at the rule above it, the rules below
// go unreached, the goal refuse to form, and the real line that refuses it. "Comprobar" checks it bar by bar.
import * as React from "react";
import type { ElementNode } from "@openuidev/lang-core";
import { useTriggerAction } from "@openuidev/react-lang";
import { Check, Play, X } from "lucide-react";
import { whenSeen } from "../autoplay";
import { rejectRows } from "../curate";
import { post } from "../post";
import { readProof, type ProofModel, type ProofNode } from "../proof/model";
import { rangeText } from "../refs";
import { isStill } from "../still";
import { TurnContext, usePicks, useRefs } from "../store";
import { askRejectMessage, breakAria, checkingRule, linesAria, noLine, openAria, proofAria, restoreAria, ruleAria, S, stoppedAt } from "../strings";
import { Inline } from "./blocks";
import { CodeLines } from "./Code";
import { RefChip } from "./RefChip";

export function ProofBlock({ props, statementId }: { props: Record<string, unknown>; statementId?: string }) {
  const refs = useRefs();
  // Draw once the goal is in: it comes last, so the tree never grows from the bottom while it streams.
  if (!props.goal || typeof props.goal !== "object") return null;
  const model = readProof({ type: "element", typeName: "Proof", props } as unknown as ElementNode, refs);
  if (model.nodes.length < 2) return null;
  return <Proof model={model} block={statementId} />;
}

/** The Rules in checking order: a rule after its premises, left to right (post-order). */
function rulesInOrder(nodes: ProofNode[], at = 0, out: number[] = []) {
  for (const given of nodes[at]!.given) rulesInOrder(nodes, given, out);
  if (nodes[at]!.type === "Rule") out.push(at);
  return out;
}

/** What breaking one premise does: checking stops at the rule right under it; every rule further down goes unreached. */
function failurePath(nodes: ProofNode[], broken: number | null) {
  if (broken === null) return { stop: -1, blocked: [] as number[] };
  const stop = nodes[broken]!.parent;
  const blocked: number[] = [];
  for (let at = nodes[stop]!.parent; at >= 0; at = nodes[at]!.parent) blocked.push(at);
  return { stop, blocked };
}

const SLOT = 360;

function Proof({ model, block }: { model: ProofModel; block?: string }) {
  const { nodes } = model;
  const turn = React.useContext(TurnContext);
  const { busy } = usePicks();
  const trigger = useTriggerAction();
  const order = React.useMemo(() => rulesInOrder(nodes), [nodes]);
  const card = React.useRef<HTMLDivElement>(null);
  const stage = React.useRef<HTMLDivElement>(null);
  const tree = React.useRef<HTMLDivElement>(null);
  const still = isStill() || turn.replay;
  const [broken, setBroken] = React.useState<number | null>(null);
  // Rules checked so far, in `order`; all of them unless a check is playing.
  const [progress, setProgress] = React.useState(() => (still ? order.length : 0));
  const [playing, setPlaying] = React.useState(false);
  const [stack, setStack] = React.useState(false);
  const { stop, blocked } = failurePath(nodes, broken);
  const halt = stop >= 0 ? order.indexOf(stop) : order.length;

  // One Comprobar pass when the answer is in view, once; any touch cancels it.
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (still || turn.live || touched.current) return;
    return whenSeen(card.current, turn.key, () => {
      if (touched.current) return 0;
      setProgress(0);
      setPlaying(true);
      return order.length * SLOT;
    });
  }, [still, turn.live, turn.key, order.length]);

  React.useEffect(() => {
    if (!playing) return;
    if (progress >= Math.min(order.length, halt + 1)) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setProgress((p) => p + 1), SLOT);
    return () => window.clearTimeout(timer);
  }, [playing, progress, order.length, halt]);

  // Tree when it fits the card, a stack when it doesn't: measured, after every width change and every break.
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  React.useLayoutEffect(() => setStack(false), [width, broken]);
  React.useLayoutEffect(() => {
    if (stack || !tree.current || !stage.current) return;
    if (tree.current.offsetWidth > stage.current.clientWidth + 1) setStack(true);
  });

  const touch = () => {
    touched.current = true;
  };
  const toggle = (i: number) => {
    touch();
    setPlaying(false);
    setProgress(order.length);
    setBroken((b) => (b === i ? null : i));
  };
  const runCheck = () => {
    touch();
    if (still) {
      setProgress(order.length);
      return;
    }
    setProgress(0);
    setPlaying(true);
  };

  const shownStop = stop >= 0 && (!playing || progress > halt) ? stop : -1;
  // Siblings of a break keep their state; the stop and what's under it never count as checked.
  const checked = new Set(order.slice(0, playing ? Math.min(progress, halt) : progress).filter((i) => i !== stop && !blocked.includes(i)));
  const blockedSet = new Set(shownStop >= 0 ? blocked : []);
  const goal = nodes[0]!;
  const rules = nodes.filter((n) => n.type === "Rule").length;
  const brokenNode = broken === null ? null : nodes[broken]!;

  const readout = playing
    ? checkingRule(nodes[order[Math.min(progress, order.length - 1)]!]!.name)
    : shownStop >= 0
      ? stoppedAt(nodes[shownStop]!.name, brokenNode?.ref?.from, brokenNode?.ref?.to)
      : progress >= order.length
        ? S.holds
        : "";

  const plate = (i: number) => {
    const node = nodes[i]!;
    const isBroken = i === broken;
    return (
      <button
        type="button"
        className="g-pf-plate"
        data-state={isBroken ? "broken" : blockedSet.has(i) || i === shownStop ? "dim" : undefined}
        aria-pressed={isBroken}
        aria-label={isBroken ? restoreAria(node.claim) : breakAria(node.claim)}
        onClick={() => toggle(i)}
        onPointerEnter={() => node.ref && post({ type: "hover", ref: node.ref.entry.id })}
        onPointerLeave={() => node.ref && post({ type: "hover", ref: null })}
      >
        <span className="g-pf-claim">
          {isBroken ? <X className="g-pf-x" size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
          <Inline md={node.claim} />
        </span>
        {node.ref ? (
          <span className="g-pf-badge" aria-hidden="true">
            {rangeText(node.ref.from, node.ref.to)}
          </span>
        ) : null}
      </button>
    );
  };

  const renderRule = (i: number): React.ReactNode => {
    const node = nodes[i]!;
    const state = i === shownStop ? "stop" : blockedSet.has(i) ? "blocked" : checked.has(i) ? "checked" : undefined;
    const ref = node.ref;
    return (
      <div className="g-pf-node" role="group" aria-label={ruleAria(node.name, node.claim, node.given.length)} data-goal={i === 0 ? "" : undefined}>
        <ul className="g-pf-given">
          {node.given.map((g) => (
            <li key={nodes[g]!.id}>{nodes[g]!.type === "Rule" ? renderRule(g) : plate(g)}</li>
          ))}
        </ul>
        <div className="g-pf-bar" data-state={state} style={{ "--pf-p": state === "checked" ? 1 : 0 } as React.CSSProperties}>
          <span className="g-pf-fill" aria-hidden="true" />
          <span className="g-pf-label">
            {state === "checked" ? <Check className="g-pf-tick" size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
            {ref ? (
              <button type="button" className="g-pf-name" aria-label={openAria(ref.entry.path, ref.from, ref.to)} onClick={() => post({ type: "open", ref: ref.entry.id, line: ref.line })}>
                {node.name}
              </button>
            ) : (
              <code className="g-pf-name">{node.name}</code>
            )}
            {ref ? (
              <span className="g-pf-ln" aria-hidden="true">
                L{ref.line}
              </span>
            ) : null}
          </span>
        </div>
        {i === shownStop && brokenNode ? <StopsHere node={brokenNode} rule={node} /> : null}
        {i === 0 ? (
          <p className="g-pf-goal" data-state={shownStop >= 0 ? "blocked" : undefined}>
            <span className="g-pf-claim">
              <Inline md={node.claim} />
            </span>
            {shownStop >= 0 ? <span className="g-pf-nogoal">{S.noGoal}</span> : null}
          </p>
        ) : (
          plate(i)
        )}
      </div>
    );
  };

  const canAsk = brokenNode && block && !busy && !turn.live;
  return (
    <figure className="g-proof">
      <div
        ref={card}
        className="g-card"
        role="group"
        aria-roledescription={S.proof}
        aria-label={proofAria(model.title, rules, nodes.length - rules)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && broken !== null) {
            toggle(broken);
            event.preventDefault();
          }
        }}
        onPointerDown={touch}
      >
        <header className="g-puzzle-head">
          <span className="g-puzzle-title">{model.title}</span>
          <span className="g-walk-nav">
            <span className="g-readout" aria-live={playing ? "off" : "polite"}>
              {readout}
            </span>
            <button type="button" className="g-button" onClick={runCheck}>
              <Play size={12} strokeWidth={2.25} aria-hidden="true" />
              {S.checkProof}
            </button>
            {broken !== null ? (
              <button type="button" className="g-button" onClick={() => toggle(broken)}>
                {S.restore}
              </button>
            ) : null}
          </span>
        </header>
        <p className="g-pf-hint">{S.breakHint}</p>
        <div ref={stage} className="g-pf-stage">
          <div ref={tree} className="g-pf-tree" data-layout={stack ? "stack" : "tree"} data-playing={playing ? "" : undefined}>
            {renderRule(0)}
          </div>
        </div>
        <footer className="g-pf-foot">
          <ul className="g-pf-legend">
            <li>
              <span className="g-pf-mark" data-state="checked" aria-hidden="true" />
              {S.legendChecked}
            </li>
            <li>
              <span className="g-pf-mark" data-state="stop" aria-hidden="true" />
              {S.legendStops}
            </li>
            <li>
              <span className="g-pf-mark" data-state="blocked" aria-hidden="true" />
              {S.legendBlocked}
            </li>
          </ul>
          {canAsk ? (
            <button
              type="button"
              className="g-link"
              onClick={() =>
                void trigger(askRejectMessage(brokenNode.claim), undefined, {
                  type: "continue_conversation",
                  params: {
                    kind: "proof",
                    block,
                    choices: [brokenNode.id],
                    note: `The user broke ${brokenNode.id} «${brokenNode.claim}» in your Proof ${block} in ${turn.id}; checking stops at ${nodes[stop]!.id} ${nodes[stop]!.name}. Answer with the lines that run then.`,
                  },
                })
              }
            >
              {S.askReject} ›
            </button>
          ) : null}
        </footer>
      </div>
    </figure>
  );
}

/** Where checking stops: the broken premise's own lines, lit where they refuse; with no lines, what no longer applies. */
function StopsHere({ node, rule }: { node: ProofNode; rule: ProofNode }) {
  const ref = node.ref ?? rule.ref;
  return (
    <div className="g-pf-stop" role="note">
      <div className="g-pf-stop-inner">
        <p className="g-pf-stop-head">
          <strong>{S.stopsHere}</strong>
          {ref ? <RefChip cite={`${ref.entry.id}:${ref.from}-${ref.to}`} /> : null}
          {ref ? <span className="g-sr">{linesAria(ref.from, ref.to)}</span> : null}
        </p>
        {ref ? <CodeLines entry={ref.entry} rows={rejectRows(ref.entry, ref.from, ref.to)} className="g-code-reject" /> : <p className="g-pf-noline">{noLine(rule.name)}</p>}
      </div>
    </div>
  );
}
