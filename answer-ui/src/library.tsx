// The OpenUI library: the only components a model may write. Zod key order is the positional order in
// OpenUI Lang, so every schema below is also the call signature the model sees in its system prompt. No .max()
// on strings: an invalid prop would drop the whole node mid-stream; validate.ts reports limits instead.
import "./zod-setup";
import * as React from "react";
import { createLibrary, defineComponent, useRenderNode } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { CalloutBlock, CheckBlock, Inline, QuizContext, SnippetBlock, TextBlock } from "./components/blocks";
import { MatchesBlock, SideBySideBlock, WalkthroughBlock, type SideProps } from "./components/Learn";
import { PuzzleBlock } from "./components/Puzzle";
import { ProofBlock } from "./components/Proof";
import { BoardBlock, NextBlock, PickBlock, WaysBlock } from "./components/Choices";
import { ICON_NAMES } from "./icons";
import { TurnContext } from "./store";
import { quizScore } from "./strings";

export const ROOT = "Answer";

const nothing = () => null;

export const Piece = defineComponent({
  name: "Piece",
  description: 'Code that exists. name: as in the code ("HTTPAdapter.send"). kind: function, method, class, module, type, value or file.',
  props: z.object({ name: z.string(), ref: z.string(), kind: z.string().optional() }),
  component: nothing,
});

export const NewPiece = defineComponent({
  name: "NewPiece",
  description: 'Code still to write. name: the function or class ("TimedAdapter.send"), never a line of code. project: its repo. path: a proposed file. from: the ref it adapts, or "". note: at most 8 words.',
  props: z.object({ name: z.string(), project: z.string(), path: z.string(), from: z.string().optional(), note: z.string().optional() }),
  component: nothing,
});

export const Idea = defineComponent({
  name: "Idea",
  description: "A piece of a concept, when there are no refs. note: at most 6 words.",
  props: z.object({ name: z.string(), note: z.string().optional() }),
  component: nothing,
});

const pieceRef = () => z.union([Piece.ref, NewPiece.ref, Idea.ref]);

export const Joint = defineComponent({
  name: "Joint",
  description: "Where two pieces fit: from gives, to receives (ids like p1). label: what crosses, as the code names it, at most 40 characters.",
  props: z.object({ from: pieceRef(), to: pieceRef(), label: z.string() }),
  component: nothing,
});

export const Step = defineComponent({
  name: "Step",
  description: "One moment, in order. lit: a piece or joint id. text: at most 6 words, verb first.",
  props: z.object({ lit: z.union([Piece.ref, NewPiece.ref, Idea.ref, Joint.ref]), text: z.string() }),
  component: nothing,
});

export const Puzzle = defineComponent({
  name: "Puzzle",
  description: "Real code as jigsaw pieces; joints are where one hands work to the next. title: at most 6 words.",
  props: z.object({
    title: z.string(),
    pieces: z.array(pieceRef()),
    joints: z.array(Joint.ref),
    steps: z.array(Step.ref),
    caption: z.string().optional(),
  }),
  component: ({ props, statementId }) => <PuzzleBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Fact = defineComponent({
  name: "Fact",
  description: "A premise. claim: a fact, at most 8 words; `code` names allowed. ref: the lines that check it and refuse when it is false.",
  props: z.object({ claim: z.string(), ref: z.string().optional() }),
  component: nothing,
});

export const Rule = defineComponent({
  name: "Rule",
  description: "A check that concludes claim from given (1 to 3 Facts or Rules). claim: at most 8 words. name: as the code names it (\"add_theorem\") or the rule's name (\"modus ponens\"). ref: the lines that check it and refuse when it is false.",
  props: z.object({ claim: z.string(), name: z.string(), given: z.array(z.union([Fact.ref, z.lazy((): z.core.$ZodType => Rule.ref)])), ref: z.string().optional() }),
  component: nothing,
});

export const Proof = defineComponent({
  name: "Proof",
  description: "Why something holds or can't go wrong: the goal Rule at the bottom, what it needs above it. title: at most 7 words.",
  props: z.object({ title: z.string(), goal: Rule.ref }),
  component: ({ props, statementId }) => <ProofBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Way = defineComponent({
  name: "Way",
  description: 'title: at most 5 words. what: at most 12 words. effort: "bajo", "medio" or "alto". tradeoff: at most 8 words. uses: the refs it reuses.',
  props: z.object({ title: z.string(), icon: z.string(), what: z.string(), effort: z.string(), tradeoff: z.string(), uses: z.array(z.string()).optional() }),
  component: nothing,
});

export const Ways = defineComponent({
  name: "Ways",
  description: "2 or 3 fair ways to do it, as cards to pick. question: at most 6 words.",
  props: z.object({ question: z.string(), ways: z.array(Way.ref) }),
  component: ({ props, statementId }) => <WaysBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Option = defineComponent({
  name: "Option",
  description: "label: at most 5 words. note: at most 8 words.",
  props: z.object({ label: z.string(), icon: z.string(), note: z.string().optional() }),
  component: nothing,
});

export const Pick = defineComponent({
  name: "Pick",
  description: "A question too open to answer yet, with 3 to 6 options as icon tiles. multiple: true to pick several.",
  props: z.object({ question: z.string(), options: z.array(Option.ref), multiple: z.boolean().optional() }),
  component: ({ props, statementId }) => <PickBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Item = defineComponent({
  name: "Item",
  description: 'column: "tienes" (exists), "falta" (to write) or "decidir". title: at most 6 words. note: at most 8 words.',
  props: z.object({ column: z.string(), title: z.string(), icon: z.string(), ref: z.string().optional(), note: z.string().optional() }),
  component: nothing,
});

export const Board = defineComponent({
  name: "Board",
  description: "A plan: what the user has, what is missing, what to decide; 3 to 9 Items. title: at most 6 words.",
  props: z.object({ title: z.string(), items: z.array(Item.ref) }),
  component: ({ props, statementId }) => <BoardBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Next = defineComponent({
  name: "Next",
  description: "2 or 3 questions the user could ask next, in their voice, at most 8 words each.",
  props: z.object({ questions: z.array(z.string()) }),
  // The Answer draws the row itself, with «Ponme a prueba».
  component: nothing,
});

export const Snippet = defineComponent({
  name: "Snippet",
  description: 'The real lines of one place ("r3", "r3:18" or "r3:41-52"). note: at most 10 words.',
  props: z.object({ ref: z.string(), note: z.string().optional() }),
  component: ({ props }) => <SnippetBlock cite={props.ref} note={props.note} />,
});

export const Callout = defineComponent({
  name: "Callout",
  description: 'A pitfall the picture can\'t show. kind: "watch". text: at most 14 words.',
  props: z.object({ kind: z.enum(["note", "watch"]), text: z.string() }),
  component: ({ props }) => <CalloutBlock kind={props.kind} text={props.text} />,
});

export const Side = defineComponent({
  name: "Side",
  description: "One side of a SideBySide: the code name and the ref of the lines to light.",
  props: z.object({ title: z.string(), ref: z.string(), points: z.array(z.string()).optional() }),
  component: nothing,
});

const sideOf = (value: unknown) => (value as { props?: SideProps } | undefined)?.props;

export const SideBySide = defineComponent({
  name: "SideBySide",
  description: "The same idea in two places: two real snippets side by side. title: at most 6 words. note: at most 12 words on what differs.",
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
  description: 'One stop: a range like "r2:696-700", 1 to 8 lines. text: at most 10 words on what they do.',
  props: z.object({ ref: z.string(), text: z.string() }),
  component: nothing,
});

export const Walkthrough = defineComponent({
  name: "Walkthrough",
  description: "Real code read stop by stop: 2 to 4 stops in reading order, in one or two refs. title: at most 6 words.",
  props: z.object({ title: z.string(), stops: z.array(Lines.ref) }),
  component: ({ props }) => <WalkthroughBlock props={props as Record<string, unknown>} />,
});

export const Match = defineComponent({
  name: "Match",
  description: 'a, b: refs in the two repos (b is "" when there is none). sure: "segura", "probable" or "dudosa" (a guess). note: at most 8 words.',
  props: z.object({ a: z.string(), b: z.string(), sure: z.string(), note: z.string().optional() }),
  component: nothing,
});

export const Matches = defineComponent({
  name: "Matches",
  description: "What in one repo matches what in another: 2 to 8 pairs, the same repo always first. title: at most 6 words.",
  props: z.object({ title: z.string(), pairs: z.array(Match.ref) }),
  component: ({ props, statementId }) => <MatchesBlock props={props as Record<string, unknown>} statementId={statementId} />,
});

export const Check = defineComponent({
  name: "Check",
  description: "Only when the user asks «Ponme a prueba». options: exactly 3. answer: the number of the right option (1, 2 or 3). why: one sentence. ref: the lines that prove it.",
  props: z.object({ question: z.string(), options: z.array(z.string()).length(3), answer: z.number().int(), why: z.string(), ref: z.string().optional() }),
  component: ({ props, statementId }) => <CheckBlock question={props.question} options={Array.isArray(props.options) ? props.options : []} answer={props.answer} why={props.why} cite={props.ref} statementId={statementId} />,
});

export const Text = defineComponent({
  name: "Text",
  description: "A short paragraph, at most 60 words. Only **bold** and `code`.",
  props: z.object({ md: z.string() }),
  component: ({ props }) => <TextBlock md={props.md} />,
});

export const LIMITS = { Ways: 1, Pick: 1, Board: 1, Puzzle: 1, Proof: 1, Matches: 1, Walkthrough: 1, SideBySide: 1, Snippet: 1, Text: 1, Callout: 1, Check: 3, Next: 1 } as const;
export const BLOCKS = ["Ways", "Pick", "Board", "Puzzle", "Proof", "Matches", "Walkthrough", "SideBySide", "Snippet", "Callout", "Compare", "Check", "Text", "Next"] as const;
/** At most one of these per answer: the block the reader answers by picking. */
export const CHOICE_BLOCKS = ["Ways", "Pick", "Board"] as const;
/** Pictures of real code: next to one, a Snippet or a Text only repeats it. At most one besides a Proof. */
export const PICTURES = ["Puzzle", "Proof", "Matches", "Walkthrough", "SideBySide", "Compare"] as const;
/** Two drawings at most: what to see (a picture), why it holds (a Proof) or what to decide (a choice). */
export const BIG_BLOCKS = ["Ways", "Pick", "Board", "Puzzle", "Proof", "Matches", "Walkthrough", "SideBySide"] as const;
export const MAX_BIG = 2;
/** Where a block goes, whatever order the model wrote: the picture, the Proof, the choice, then a Callout, the Checks,
 * and the next questions last. Fixed from the root line, so nothing jumps while it streams. */
const RANK: Record<string, number> = { Puzzle: 1, Matches: 1, Walkthrough: 2, SideBySide: 3, Snippet: 3, Compare: 3, Proof: 4, Ways: 5, Pick: 5, Board: 5, Callout: 6, Text: 6, Check: 7, Next: 8 };
export const ICON_LIST = ICON_NAMES.join(", ");

const typeOf = (block: unknown) => (block as { typeName?: string } | null)?.typeName ?? "";
const has = (list: readonly string[], type: string) => list.includes(type);

/** The blocks an answer draws, in order: what the model wrote, cut to two of one picture, one Proof and one choice, a
 * Callout, the Checks of a quiz, and Next last. Text and Snippet go when there is a picture; a Check only answers «Ponme a prueba». */
export function drawnBlocks(blocks: unknown[], quiz: boolean) {
  const ordered = blocks
    .map((block, i) => ({ block, i, type: typeOf(block), rank: RANK[typeOf(block)] ?? 4 }))
    .filter(({ type }) => has(BLOCKS, type))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const picture = ordered.some(({ type }) => has(PICTURES, type));
  const seen: Record<string, number> = {};
  let choice = false;
  let drawn = false;
  let big = 0;
  return ordered.filter(({ type }) => {
    if (picture && (type === "Text" || type === "Snippet")) return false;
    if (type === "Check" && !quiz) return false;
    if (has(BIG_BLOCKS, type) && big >= MAX_BIG) return false;
    if (has(CHOICE_BLOCKS, type)) {
      if (choice) return false;
      choice = true;
    }
    if (has(PICTURES, type) && type !== "Proof") {
      if (drawn) return false;
      drawn = true;
    }
    if (has(BIG_BLOCKS, type)) big += 1;
    seen[type] = (seen[type] ?? 0) + 1;
    const limit = LIMITS[type as keyof typeof LIMITS];
    return !limit || seen[type]! <= limit;
  });
}

function AnswerView({ lede, blocks }: { lede: string; blocks: unknown[] }) {
  const renderNode = useRenderNode();
  const turn = React.useContext(TurnContext);
  const [firsts, setFirsts] = React.useState<ReadonlyMap<string, boolean>>(() => new Map());
  const drawn = drawnBlocks(blocks, turn.quiz);
  const types = drawn.map(({ type }) => type);
  const next = drawn.find(({ type }) => type === "Next")?.block as { statementId?: string; props?: Record<string, unknown> } | undefined;
  // «Ponme a prueba» follows a picture or a snippet of real code, never a choice, and never a quiz.
  const quizMe = !turn.quiz && types.some((type) => has(PICTURES, type) || type === "Snippet") && !types.some((type) => has(CHOICE_BLOCKS, type));
  const checks = types.filter((type) => type === "Check").length;
  const quiz = React.useMemo(
    () => ({ answered: (id: string, right: boolean) => setFirsts((map) => (map.has(id) ? map : new Map(map).set(id, right))) }),
    [],
  );
  return (
    <article className="g-answer">
      {lede ? (
        <p className="g-lede">
          <Inline md={lede} />
        </p>
      ) : null}
      <QuizContext.Provider value={quiz}>
        {drawn.map(({ block, i, type }) => {
          if (type === "Next") return null;
          const id = (block as { statementId?: string }).statementId ?? `${type}-${i}`;
          return <React.Fragment key={id}>{renderNode(block)}</React.Fragment>;
        })}
      </QuizContext.Provider>
      {turn.quiz && checks && firsts.size >= checks ? <p className="g-quiz-score">{quizScore([...firsts.values()].filter(Boolean).length, checks)}</p> : null}
      <NextBlock props={next?.props ?? {}} statementId={next?.statementId} quiz={quizMe} />
    </article>
  );
}

export const Answer = defineComponent({
  name: "Answer",
  description: "The answer. lede: one line that answers, at most 12 words. blocks: one picture; a Proof or one choice beside it only when needed; then Next.",
  props: z.object({
    lede: z.string(),
    blocks: z.array(z.union([Puzzle.ref, Proof.ref, Ways.ref, Pick.ref, Board.ref, Matches.ref, Walkthrough.ref, SideBySide.ref, Snippet.ref, Callout.ref, Compare.ref, Check.ref, Text.ref, Next.ref])),
  }),
  component: ({ props }) => <AnswerView lede={props.lede} blocks={Array.isArray(props.blocks) ? props.blocks : []} />,
});

export const library = createLibrary({
  root: ROOT,
  components: [Answer, Puzzle, Piece, NewPiece, Idea, Joint, Step, Proof, Rule, Fact, Ways, Way, Pick, Option, Board, Item, Matches, Match, Walkthrough, Lines, SideBySide, Side, Snippet, Callout, Compare, Check, Text, Next],
});
