// The OpenUI library: the only components a model may write. Zod key order is the positional order in
// OpenUI Lang, so every schema below is also the call signature the model sees in its system prompt. No .max()
// on strings: an invalid prop would drop the whole node mid-stream; validate.ts reports limits instead.
import "./zod-setup";
import * as React from "react";
import { createLibrary, defineComponent, useRenderNode } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { CalloutBlock, CheckBlock, Inline, SnippetBlock, TextBlock } from "./components/blocks";
import { MatchesBlock, SideBySideBlock, WalkthroughBlock, type SideProps } from "./components/Learn";
import { PuzzleBlock } from "./components/Puzzle";
import { BoardBlock, NextBlock, PickBlock, WaysBlock } from "./components/Choices";
import { ICON_NAMES } from "./icons";

export const ROOT = "Answer";

const nothing = () => null;

export const Piece = defineComponent({
  name: "Piece",
  description: 'Code that exists. name: as in the code ("HTTPAdapter.send"). ref: its ref. kind: function, method, class, module, type, value or file.',
  props: z.object({ name: z.string(), ref: z.string(), kind: z.string().optional() }),
  component: nothing,
});

export const NewPiece = defineComponent({
  name: "NewPiece",
  description: 'Code still to write, an empty tile in the gap. project: its repo, as in the list. path: a proposed file. from: the ref it adapts, or "". note: at most 8 words.',
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
  description: "Where two pieces fit: from gives, to receives (ids like p1). label: what crosses, at most 40 characters.",
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
  description: "Real units of code as jigsaw pieces; joints are where one hands work to the next. title: at most 8 words. caption: one true sentence.",
  props: z.object({
    title: z.string(),
    pieces: z.array(pieceRef()),
    joints: z.array(Joint.ref),
    steps: z.array(Step.ref),
    caption: z.string().optional(),
  }),
  component: ({ props, statementId }) => <PuzzleBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Way = defineComponent({
  name: "Way",
  description: 'One way to go. title: at most 6 words. icon: a name from the icon list. what: one sentence. effort: "bajo", "medio" or "alto". tradeoff: one sentence. uses: the refs it reuses.',
  props: z.object({ title: z.string(), icon: z.string(), what: z.string(), effort: z.string(), tradeoff: z.string(), uses: z.array(z.string()).optional() }),
  component: nothing,
});

export const Ways = defineComponent({
  name: "Ways",
  description: "2 or 3 fair ways to do what the user asks, as cards to pick from. question: at most 8 words.",
  props: z.object({ question: z.string(), ways: z.array(Way.ref) }),
  component: ({ props, statementId }) => <WaysBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Option = defineComponent({
  name: "Option",
  description: "One answer to a Pick. label: at most 5 words. note: at most 8 words.",
  props: z.object({ label: z.string(), icon: z.string(), note: z.string().optional() }),
  component: nothing,
});

export const Pick = defineComponent({
  name: "Pick",
  description: "A question with 3 to 6 options shown as tiles with icons; the user picks and the pick comes back as their next message. multiple: true to pick several.",
  props: z.object({ question: z.string(), options: z.array(Option.ref), multiple: z.boolean().optional() }),
  component: ({ props, statementId }) => <PickBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Item = defineComponent({
  name: "Item",
  description: 'One card of a Board. column: "tienes" (exists: needs its ref), "falta" (to write) or "decidir" (to decide). title: at most 6 words. note: at most 10 words.',
  props: z.object({ column: z.string(), title: z.string(), icon: z.string(), ref: z.string().optional(), note: z.string().optional() }),
  component: nothing,
});

export const Board = defineComponent({
  name: "Board",
  description: "A plan of the work: what the user already has, what is missing and what to decide, 3 to 9 Items. title: at most 8 words.",
  props: z.object({ title: z.string(), items: z.array(Item.ref) }),
  component: ({ props, statementId }) => <BoardBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Next = defineComponent({
  name: "Next",
  description: "2 or 3 questions the user could ask next, in their voice, at most 12 words each.",
  props: z.object({ questions: z.array(z.string()) }),
  component: ({ props, statementId }) => <NextBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Snippet = defineComponent({
  name: "Snippet",
  description: 'The real lines of a ref ("r3", "r3:18" or "r3:41-52"). note: what to look at.',
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
  description: "One side of a SideBySide: the code name, the ref of the lines to light, up to 4 short points.",
  props: z.object({ title: z.string(), ref: z.string(), points: z.array(z.string()).optional() }),
  component: nothing,
});

const sideOf = (value: unknown) => (value as { props?: SideProps } | undefined)?.props;

export const SideBySide = defineComponent({
  name: "SideBySide",
  description: "The same idea in two places: two real snippets side by side. note: one sentence on what differs.",
  props: z.object({ title: z.string(), left: Side.ref, right: Side.ref, note: z.string().optional() }),
  component: ({ props }) => <SideBySideBlock title={props.title} left={sideOf(props.left)} right={sideOf(props.right)} note={props.note} />,
});

// Older chats wrote Compare: it still draws, as a SideBySide without a title. Not in the prompt.
export const Compare = defineComponent({
  name: "Compare",
  description: "Two pieces of code side by side.",
  props: z.object({ left: Side.ref, right: Side.ref }),
  component: ({ props }) => <SideBySideBlock left={sideOf(props.left)} right={sideOf(props.right)} />,
});

export const Lines = defineComponent({
  name: "Lines",
  description: 'One stop: a range like "r2:696-700", 1 to 12 lines, and at most 25 words on what they do.',
  props: z.object({ ref: z.string(), text: z.string() }),
  component: nothing,
});

export const Walkthrough = defineComponent({
  name: "Walkthrough",
  description: "Reads real code stop by stop; each stop lights its lines. 2 to 6 stops in reading order, in one or two refs. title: at most 8 words.",
  props: z.object({ title: z.string(), stops: z.array(Lines.ref) }),
  component: ({ props }) => <WalkthroughBlock props={props as Record<string, unknown>} />,
});

export const Match = defineComponent({
  name: "Match",
  description: 'a, b: refs in the two repos (b is "" when there is none). sure: "segura", "probable" or "dudosa". note: at most 10 words.',
  props: z.object({ a: z.string(), b: z.string(), sure: z.string(), note: z.string().optional() }),
  component: nothing,
});

export const Matches = defineComponent({
  name: "Matches",
  description: "What in one repo corresponds to what in another. 2 to 8 pairs, the same repo always first.",
  props: z.object({ title: z.string(), pairs: z.array(Match.ref) }),
  component: ({ props, statementId }) => <MatchesBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Check = defineComponent({
  name: "Check",
  description: "A one-question check. options: exactly 3. answer: the number of the right option (1, 2 or 3). why: one sentence.",
  props: z.object({ question: z.string(), options: z.array(z.string()).length(3), answer: z.number().int(), why: z.string() }),
  component: ({ props, statementId }) => <CheckBlock question={props.question} options={Array.isArray(props.options) ? props.options : []} answer={props.answer} why={props.why} statementId={statementId} />,
});

export const Text = defineComponent({
  name: "Text",
  description: "A short paragraph, at most 60 words. Only **bold** and `code`.",
  props: z.object({ md: z.string() }),
  component: ({ props }) => <TextBlock md={props.md} />,
});

export const LIMITS = { Ways: 1, Pick: 1, Board: 1, Puzzle: 1, Matches: 1, Walkthrough: 1, SideBySide: 1, Snippet: 2, Text: 2, Callout: 2, Check: 1, Next: 1 } as const;
export const BLOCKS = ["Ways", "Pick", "Board", "Puzzle", "Matches", "Walkthrough", "SideBySide", "Snippet", "Callout", "Compare", "Check", "Text", "Next"] as const;
/** The drawings: at most 2 in an answer, so it stays one idea. */
export const BIG_BLOCKS = ["Ways", "Pick", "Board", "Puzzle", "Matches", "Walkthrough", "SideBySide"] as const;
export const MAX_BIG = 2;
/** At most one of these per answer: the block the reader answers by picking. */
export const CHOICE_BLOCKS = ["Ways", "Pick", "Board"] as const;
/** Where a block goes, whatever order the model wrote: the choice first, then the figure, the rest, the check, the
 * next questions. Fixed from the root line, so nothing jumps while it streams. */
const RANK: Record<string, number> = { Ways: 0, Pick: 0, Board: 0, Puzzle: 1, Matches: 1, Walkthrough: 2, SideBySide: 3, Snippet: 3, Compare: 3, Callout: 4, Text: 4, Check: 5, Next: 6 };
export const ICON_LIST = ICON_NAMES.join(", ");

function AnswerView({ lede, blocks }: { lede: string; blocks: unknown[] }) {
  const renderNode = useRenderNode();
  const seen: Record<string, number> = {};
  const typeOf = (block: unknown) => (block as { typeName?: string } | null)?.typeName ?? "";
  const ordered = blocks
    .map((block, i) => ({ block, i, rank: RANK[typeOf(block)] ?? 4 }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  let choice = false;
  let big = 0;
  return (
    <article className="g-answer">
      {lede ? (
        <p className="g-lede">
          <Inline md={lede} />
        </p>
      ) : null}
      {ordered.map(({ block, i }) => {
        const type = typeOf(block);
        if (!(BLOCKS as readonly string[]).includes(type)) return null;
        if ((CHOICE_BLOCKS as readonly string[]).includes(type)) {
          if (choice) return null;
          choice = true;
        }
        if ((BIG_BLOCKS as readonly string[]).includes(type)) {
          if (big >= MAX_BIG) return null;
          big += 1;
        }
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
  description: "The answer. lede: one plain sentence that answers the question (at most 25 words). blocks, in order: a choice, an overview, a path, side by side, words, one Check, Next.",
  props: z.object({
    lede: z.string(),
    blocks: z.array(z.union([Ways.ref, Pick.ref, Board.ref, Puzzle.ref, Matches.ref, Walkthrough.ref, SideBySide.ref, Snippet.ref, Callout.ref, Compare.ref, Check.ref, Text.ref, Next.ref])),
  }),
  component: ({ props }) => <AnswerView lede={props.lede} blocks={Array.isArray(props.blocks) ? props.blocks : []} />,
});

export const library = createLibrary({
  root: ROOT,
  components: [Answer, Ways, Way, Pick, Option, Board, Item, Puzzle, Piece, NewPiece, Idea, Joint, Step, Matches, Match, Walkthrough, Lines, SideBySide, Side, Snippet, Callout, Compare, Check, Text, Next],
});
