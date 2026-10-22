// The OpenUI library: the only components a model may write. Zod key order is the positional order in
// OpenUI Lang, so every schema below is also the call signature the model sees in its system prompt. No .max()
// on strings: an invalid prop would drop the whole node mid-stream; validate.ts reports limits instead.
import "./zod-setup";
import * as React from "react";
import { createLibrary, defineComponent, useRenderNode } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { CalloutBlock, CheckBlock, CompareBlock, Inline, SnippetBlock, TextBlock, type SideProps } from "./components/blocks";
import { PuzzleBlock } from "./components/Puzzle";

export const ROOT = "Answer";

const nothing = () => null;

export const Piece = defineComponent({
  name: "Piece",
  description: 'Code that exists. name: as written in the code ("HTTPAdapter.send"), at most 32 characters. ref: its ref. kind: function, method, class, module, type, value or file.',
  props: z.object({ name: z.string(), ref: z.string(), kind: z.string().optional() }),
  component: nothing,
});

export const NewPiece = defineComponent({
  name: "NewPiece",
  description: 'Code the user would still write, drawn as an empty tile in the gap. project: the repo it goes in, as in the list. path: a proposed file. from: the ref it adapts, or "". note: what it does, at most 8 words.',
  props: z.object({ name: z.string(), project: z.string(), path: z.string(), from: z.string().optional(), note: z.string().optional() }),
  component: nothing,
});

export const Idea = defineComponent({
  name: "Idea",
  description: "A piece of a concept, with no code (when there are no refs). note: at most 8 words.",
  props: z.object({ name: z.string(), note: z.string().optional() }),
  component: nothing,
});

const pieceRef = () => z.union([Piece.ref, NewPiece.ref, Idea.ref]);

export const Joint = defineComponent({
  name: "Joint",
  description: "Where two pieces fit. from: the piece that calls or gives; to: the piece that receives (ids like p1). label: what crosses (arguments, data or a returned value), at most 40 characters.",
  props: z.object({ from: pieceRef(), to: pieceRef(), label: z.string() }),
  component: nothing,
});

export const Step = defineComponent({
  name: "Step",
  description: "One moment, in order. lit: the id of the piece or joint it lights. text: at most 20 words.",
  props: z.object({ lit: z.union([Piece.ref, NewPiece.ref, Idea.ref, Joint.ref]), text: z.string() }),
  component: nothing,
});

export const Puzzle = defineComponent({
  name: "Puzzle",
  description: "The figure: each piece is a jigsaw tile for one real unit of code; joints are where one hands work to the next. At most 1. title: at most 8 words. caption: one true sentence.",
  props: z.object({
    title: z.string(),
    pieces: z.array(pieceRef()),
    joints: z.array(Joint.ref),
    steps: z.array(Step.ref),
    caption: z.string().optional(),
  }),
  component: ({ props }) => <PuzzleBlock props={props as Record<string, unknown>} />,
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

export const LIMITS = { Puzzle: 1, Snippet: 2, Text: 3 } as const;
export const BLOCKS = ["Puzzle", "Snippet", "Callout", "Compare", "Check", "Text"] as const;

function AnswerView({ lede, blocks }: { lede: string; blocks: unknown[] }) {
  const renderNode = useRenderNode();
  const seen: Record<string, number> = {};
  return (
    <article className="g-answer">
      {lede ? (
        <p className="g-lede">
          <Inline md={lede} />
        </p>
      ) : null}
      {blocks.map((block, i) => {
        const type = (block as { typeName?: string } | null)?.typeName ?? "";
        if (!(BLOCKS as readonly string[]).includes(type)) return null;
        seen[type] = (seen[type] ?? 0) + 1;
        const limit = LIMITS[type as keyof typeof LIMITS];
        if (limit && seen[type]! > limit) return null;
        const id = (block as { statementId?: string }).statementId ?? `${type}-${i}`;
        return <React.Fragment key={id}>{renderNode(block)}</React.Fragment>;
      })}
    </article>
  );
}

export const Answer = defineComponent({
  name: "Answer",
  description: "The answer. lede: one plain sentence that answers the question (at most 25 words). blocks: the Puzzle first, then code and words.",
  props: z.object({
    lede: z.string(),
    blocks: z.array(z.union([Puzzle.ref, Snippet.ref, Callout.ref, Compare.ref, Check.ref, Text.ref])),
  }),
  component: ({ props }) => <AnswerView lede={props.lede} blocks={Array.isArray(props.blocks) ? props.blocks : []} />,
});

export const library = createLibrary({
  root: ROOT,
  components: [Answer, Puzzle, Piece, NewPiece, Idea, Joint, Step, Snippet, Callout, Compare, Side, Check, Text],
});
