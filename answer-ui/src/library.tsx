// The OpenUI library: the only components a model may write. Zod key order is the positional order in
// OpenUI Lang, so every schema below is also the call signature the model sees in its system prompt.
import "./zod-setup";
import * as React from "react";
import { createLibrary, defineComponent, useRenderNode } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { CalloutBlock, CheckBlock, CodeRefBlock, CompareBlock, NewCodeBlock, SnippetBlock, TextBlock, type NewItemProps, type SideProps, Inline } from "./components/blocks";
import { FigBlock, FigNumber } from "./components/Fig";
import { ROLES } from "./machines/slots";

export const ROOT = "Answer";

const nothing = () => null;

export const Part = defineComponent({
  name: "Part",
  description:
    'One part of the machine. label: 1–3 words for what it does (not a file name). role: its slot in the machine. ref: a ref id from the list ("r3", or "r3:18" for one line), or "" when it isn\'t in the code. note: one short line. status: "exists" (in the code; needs a ref), "new" (to be written), "concept" (no refs at all).',
  props: z.object({
    label: z.string().max(28),
    role: z.enum(ROLES),
    ref: z.string(),
    note: z.string().max(90).optional(),
    status: z.enum(["exists", "new", "concept"]).default("exists"),
  }),
  component: nothing,
});

export const Step = defineComponent({
  name: "Step",
  description: "One moment of the motion. lit: the number of the part it lights (1 = the first part in the list). text: at most 20 words. value: a true number to show in the readout. fails: true when this step sends the work to the reject.",
  props: z.object({
    lit: z.number().int(),
    text: z.string().max(140),
    value: z.number().optional(),
    fails: z.boolean().optional(),
  }),
  component: nothing,
});

// Each component needs its own schema object: defineComponent tags the schema with the component's name.
const machineProps = () =>
  z.object({
    parts: z.array(Part.ref),
    steps: z.array(Step.ref),
    readout: z.string().optional(),
  });

export const Coupling = defineComponent({
  name: "Coupling",
  description:
    "Machine for connecting system A to system B: two housings joined by a shaft and a coupling. Roles: a_part (up to 3, inside A), a_port (one, required: where A hands off), key (one, optional: the shape both sides agree on), adapter (one, required: the piece that converts), b_port (one, required: where B takes it in), b_part (up to 3, inside B).",
  props: machineProps(),
  component: nothing,
});

export const Conveyor = defineComponent({
  name: "Conveyor",
  description:
    "Machine for steps in order (a pipeline, a request passing through layers): a belt carries a tote past stations. Roles: intake (one, optional: where work comes in), station (1 to 6, in order), reject (one, optional: where failed work goes), output (one, optional: where finished work ends).",
  props: machineProps(),
  component: nothing,
});

export const Fig = defineComponent({
  name: "Fig",
  description: "A numbered figure: the machine, drawn and animated, with its steps and parts listed under it. caption: one true sentence. At most 2 per answer.",
  props: z.object({
    title: z.string(),
    machine: z.union([Coupling.ref, Conveyor.ref]),
    caption: z.string(),
  }),
  component: ({ props }) => <FigBlock title={props.title} machine={props.machine} caption={props.caption} />,
});

export const CodeRef = defineComponent({
  name: "CodeRef",
  description: "A link to one ref, shown as a chip. label: an optional short name.",
  props: z.object({ ref: z.string(), label: z.string().optional() }),
  component: ({ props }) => <CodeRefBlock cite={props.ref} label={props.label} />,
});

export const Snippet = defineComponent({
  name: "Snippet",
  description: 'Shows the real lines of a ref ("r3", "r3:18" or "r3:41-52"); never type code yourself. note: what to look at. At most 2.',
  props: z.object({ ref: z.string(), note: z.string().optional() }),
  component: ({ props }) => <SnippetBlock cite={props.ref} note={props.note} />,
});

export const Callout = defineComponent({
  name: "Callout",
  description: 'A short aside. kind: "note", or "watch" for a pitfall.',
  props: z.object({ kind: z.enum(["note", "watch"]), text: z.string() }),
  component: ({ props }) => <CalloutBlock kind={props.kind} text={props.text} />,
});

export const Side = defineComponent({
  name: "Side",
  description: "One side of a Compare: a title, its ref and up to 4 short points.",
  props: z.object({ title: z.string(), ref: z.string(), points: z.array(z.string()).max(4) }),
  component: nothing,
});

export const Compare = defineComponent({
  name: "Compare",
  description: "Two pieces of code side by side.",
  props: z.object({ left: Side.ref, right: Side.ref }),
  component: ({ props }) => {
    const left = props.left as { props?: SideProps } | undefined;
    const right = props.right as { props?: SideProps } | undefined;
    return <CompareBlock left={left?.props} right={right?.props} />;
  },
});

export const NewItem = defineComponent({
  name: "NewItem",
  description: "path: a proposed path for the new file or function. what: what it does. adapts: the ref it adapts.",
  props: z.object({ path: z.string(), what: z.string(), adapts: z.string() }),
  component: nothing,
});

export const NewCode = defineComponent({
  name: "NewCode",
  description: "What the user would write new. When there are refs, end the answer with it.",
  props: z.object({ items: z.array(NewItem.ref) }),
  component: ({ props }) => {
    const items = (Array.isArray(props.items) ? props.items : []).filter((n) => n && (n as { typeName?: string }).typeName === "NewItem").map((n) => (n as { props: NewItemProps }).props);
    return <NewCodeBlock items={items} />;
  },
});

export const Check = defineComponent({
  name: "Check",
  description: "A one-question check. options: exactly 3. answer: the number of the right option (1, 2 or 3). why: one sentence.",
  props: z.object({ question: z.string(), options: z.array(z.string()).length(3), answer: z.number().int(), why: z.string() }),
  component: ({ props }) => <CheckBlock question={props.question} options={Array.isArray(props.options) ? props.options : []} answer={props.answer} why={props.why} />,
});

export const Text = defineComponent({
  name: "Text",
  description: "A short paragraph, at most 60 words. Only **bold** and `code`. At most 3.",
  props: z.object({ md: z.string() }),
  component: ({ props }) => <TextBlock md={props.md} />,
});

const LIMIT: Record<string, number> = { Fig: 2, Snippet: 2, Text: 3 };
const BLOCK_TYPES = new Set(["Fig", "CodeRef", "Snippet", "Callout", "Compare", "NewCode", "Check", "Text"]);

function AnswerView({ lede, blocks }: { lede: string; blocks: unknown[] }) {
  const renderNode = useRenderNode();
  const seen: Record<string, number> = {};
  let figs = 0;
  return (
    <article className="g-answer">
      {lede ? <h1 className="g-lede"><Inline md={lede} /></h1> : null}
      {blocks.map((block, i) => {
        const type = (block as { typeName?: string } | null)?.typeName ?? "";
        if (!BLOCK_TYPES.has(type)) return null;
        seen[type] = (seen[type] ?? 0) + 1;
        if (LIMIT[type] && seen[type]! > LIMIT[type]!) return null;
        const id = (block as { statementId?: string }).statementId ?? `${type}-${i}`;
        if (type === "Fig") {
          figs += 1;
          return (
            <FigNumber.Provider key={id} value={figs}>
              {renderNode(block)}
            </FigNumber.Provider>
          );
        }
        return <React.Fragment key={id}>{renderNode(block)}</React.Fragment>;
      })}
    </article>
  );
}

export const Answer = defineComponent({
  name: "Answer",
  description: "The answer. lede: one plain sentence that answers the question (at most 2 lines). blocks: the figure first, then code and words.",
  props: z.object({
    lede: z.string(),
    blocks: z.array(z.union([Fig.ref, Snippet.ref, CodeRef.ref, Callout.ref, Compare.ref, NewCode.ref, Check.ref, Text.ref])),
  }),
  component: ({ props }) => <AnswerView lede={props.lede} blocks={Array.isArray(props.blocks) ? props.blocks : []} />,
});

export const library = createLibrary({
  root: ROOT,
  components: [Answer, Fig, Coupling, Conveyor, Part, Step, Snippet, CodeRef, Callout, Compare, Side, NewCode, NewItem, Check, Text],
});
