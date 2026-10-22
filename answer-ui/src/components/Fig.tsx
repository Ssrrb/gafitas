// A numbered figure: the machine in a card (Fig n, title, hint, live readout), a caption, the steps and the
// parts legend. It owns the lit step: ← → step, Tab walks the parts, an idle tour steps on its own.
import * as React from "react";
import { FigureContext, TOUR_BACK, TOUR_FIRST, useVisible, type SlotInfo } from "../figure/runtime";
import { isStill } from "../figure/still";
import { CouplingView, couplingModel } from "../machines/Coupling";
import { ConveyorView, conveyorModel } from "../machines/Conveyor";
import { bind, isMachine, type MachineName, type PartLike, type SlotKey } from "../machines/slots";
import { post } from "../post";
import { refIdOf, resolveRef } from "../refs";
import { useRefs, useSelected } from "../store";
import { Inline } from "./blocks";
import { hoverRef, RefChip } from "./RefChip";

export const FigNumber = React.createContext(1);

const DWELL = 3000;

export interface StepLike {
  lit?: number;
  text?: string;
  value?: number;
  fails?: boolean;
}

interface LangNode {
  type?: string;
  typeName?: string;
  props?: Record<string, unknown>;
}

const propsOf = <T,>(list: unknown, type: string): T[] =>
  (Array.isArray(list) ? list : []).filter((n): n is LangNode => Boolean(n) && (n as LangNode).typeName === type).map((n) => (n.props ?? {}) as T);

export function FigBlock({ title, machine, caption }: { title: string; machine: unknown; caption: string }) {
  const number = React.useContext(FigNumber);
  const node = machine as LangNode | undefined;
  if (!node || !isMachine(node.typeName)) return null;
  const parts = propsOf<PartLike>(node.props?.parts, "Part");
  const steps = propsOf<StepLike>(node.props?.steps, "Step");
  if (!parts.length) return null;
  return <Figure number={number} title={title} type={node.typeName} parts={parts} steps={steps} readout={typeof node.props?.readout === "string" ? node.props.readout : ""} caption={caption} />;
}

function Figure({ number, title, type, parts, steps, readout, caption }: { number: number; title: string; type: MachineName; parts: PartLike[]; steps: StepLike[]; readout: string; caption: string }) {
  const refs = useRefs();
  const selected = useSelected();
  const binding = React.useMemo(() => bind(type, parts), [type, parts]);
  const [step, setStep] = React.useState(0);
  const [hover, setHover] = React.useState<SlotKey | null>(null);
  const [engaged, setEngaged] = React.useState(false);
  const [idle, setIdle] = React.useState(true);
  const [poke, setPoke] = React.useState(0);
  const card = React.useRef<HTMLDivElement>(null);
  const visible = useVisible(card);
  const count = steps.length;
  const current = count ? Math.min(step, count - 1) : -1;

  // Parts as drawn: label, status, resolved ref, and the number shown in the legend.
  const info = React.useMemo(() => {
    const map = new Map<SlotKey, SlotInfo>();
    binding.partOfSlot.forEach((index, slot) => {
      const part = parts[index]!;
      const resolved = resolveRef(part.ref, refs);
      map.set(slot, {
        label: part.label ?? "",
        status: part.status === "new" || part.status === "concept" ? part.status : "exists",
        refId: resolved.ok ? resolved.ref.entry.id : null,
        line: resolved.ok ? resolved.ref.line : null,
        number: index + 1,
      });
    });
    return map;
  }, [binding, parts, refs]);

  const selectedPart = selected ? parts.findIndex((part) => refIdOf(part.ref) === selected) : -1;
  const stepPart = current >= 0 ? Number(steps[current]!.lit) - 1 : -1;
  const litPart = selectedPart >= 0 ? selectedPart : stepPart;
  const lit = litPart >= 0 ? (binding.slotOfPart[litPart] ?? null) : null;
  const shownStep = selectedPart >= 0 ? steps.findIndex((s) => Number(s.lit) - 1 === selectedPart) : current;
  const fails = Boolean(shownStep >= 0 && steps[shownStep]?.fails);

  const wake = React.useCallback(() => {
    setIdle(false);
    setPoke((n) => n + 1);
  }, []);

  React.useEffect(() => {
    if (engaged) {
      setIdle(false);
      return;
    }
    const timer = window.setTimeout(() => setIdle(true), TOUR_BACK);
    return () => window.clearTimeout(timer);
  }, [engaged, poke]);

  const touring = visible && idle && !engaged && selectedPart < 0 && count > 1 && !isStill();
  React.useEffect(() => {
    if (!touring) return;
    let timer = window.setTimeout(function next() {
      setStep((s) => (s + 1) % count);
      timer = window.setTimeout(next, DWELL);
    }, TOUR_FIRST);
    return () => window.clearTimeout(timer);
  }, [touring, count]);

  const go = (to: number) => {
    if (!count) return;
    wake();
    setStep(((to % count) + count) % count);
  };

  const hoverSlot = React.useCallback(
    (slot: SlotKey | null) => {
      setHover(slot);
      const ref = slot ? info.get(slot)?.refId : null;
      post({ type: "hover", ref: ref ?? null });
    },
    [info],
  );

  const context = React.useMemo(
    () => ({
      lit,
      hover,
      slots: info,
      onHover: hoverSlot,
      onOpen: (slot: SlotKey) => {
        const part = info.get(slot);
        if (part?.refId) post({ type: "open", ref: part.refId, line: part.line });
      },
    }),
    [lit, hover, info, hoverSlot],
  );

  const litLabel = litPart >= 0 ? (parts[litPart]?.label ?? "") : "";
  const value = shownStep >= 0 ? steps[shownStep]?.value : undefined;
  const readoutText = [
    shownStep >= 0 ? `step ${shownStep + 1} of ${count}` : count ? `${count} steps` : "",
    litLabel,
    typeof value === "number" && Number.isFinite(value) ? String(value) : "",
    readout,
  ]
    .filter(Boolean)
    .join(" · ");

  const counts = binding.counts;
  const view =
    type === "Coupling" ? (
      <CouplingView model={couplingModel(counts.a_part ?? 0, counts.b_part ?? 0)} stepIndex={current} lit={lit} fails={fails} visible={visible} />
    ) : (
      <ConveyorView model={conveyorModel(Math.max(1, counts.station ?? 1))} stepIndex={current} lit={lit} fails={fails} visible={visible} />
    );

  const figLabel = `Fig ${number}`;
  return (
    <figure className="g-fig" aria-label={`${figLabel} · ${title}`}>
      <div
        ref={card}
        className="g-card iso"
        tabIndex={0}
        role="group"
        aria-roledescription="figure"
        aria-label={`${figLabel} · ${title}. Left and right arrows step through the ${count} steps; Tab moves through the parts.`}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setEngaged(true);
        }}
        onPointerLeave={() => {
          setEngaged(false);
          wake();
        }}
        onPointerDown={wake}
        onFocus={() => setEngaged(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
            setEngaged(false);
            wake();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") go(current + 1);
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp") go(current - 1);
          else if (event.key === "Home") go(0);
          else if (event.key === "End") go(count - 1);
          else return;
          event.preventDefault();
        }}
      >
        <div className="g-corners" data-row="top">
          <span className="g-fig-n">{figLabel}</span>
          <span className="g-fig-title">{title}</span>
        </div>
        <FigureContext.Provider value={context}>
          <div className="g-stage">
            {view}
          </div>
        </FigureContext.Provider>
        <div className="g-corners" data-row="bottom">
          <span className="g-hint">Hover a part · ← → steps</span>
          <span className="g-readout" data-readout="">
            {readoutText}
          </span>
        </div>
      </div>
      {caption ? (
        <figcaption className="g-caption">
          <Inline md={caption} />
        </figcaption>
      ) : null}
      {count ? (
        <ol className="g-steps" aria-label={`Steps of ${figLabel}`}>
          {steps.map((s, i) => (
            <li key={i} aria-current={i === shownStep ? "step" : undefined}>
              <button type="button" onClick={() => go(i)}>
                <span className="g-step-n">{i + 1}</span>
                <span className="g-step-text">
                  <Inline md={s.text ?? ""} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <ol className="g-legend" aria-label={`Parts of ${figLabel}`}>
        {parts.map((part, i) => {
          const slot = binding.slotOfPart[i] ?? null;
          const resolved = resolveRef(part.ref, refs);
          return (
            <li
              key={i}
              data-lit={i === litPart ? "" : undefined}
              data-hover={slot !== null && slot === hover ? "" : undefined}
              data-selected={resolved.ok && selected === resolved.ref.entry.id ? "" : undefined}
              onPointerEnter={() => {
                setHover(slot);
                hoverRef(resolved.ok ? resolved.ref : null);
              }}
              onPointerLeave={() => {
                setHover(null);
                hoverRef(null);
              }}
            >
              <span className="g-pin" aria-hidden="true">
                {i + 1}
              </span>
              <span className="g-part-label">{part.label}</span>
              {part.status === "new" ? <span className="g-tag">New</span> : null}
              {resolved.ok ? <RefChip cite={part.ref!} compact /> : null}
              {part.note ? <span className="g-part-note">{part.note}</span> : null}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
