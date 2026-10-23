// A Proof node as the page draws it: the tree of Rules and Facts under its goal, each premise's lines resolved
// against the ref table, and every problem with the statement id to fix. Like the Puzzle's reader, it's shared by
// the component and by validation (English messages: only the model reads them).
import type { ElementNode } from "@openuidev/lang-core";
import { resolveRef, type RefTable, type ResolvedRef } from "../refs";

export const PROOF_LIMITS = { nodes: 7, depth: 3, given: [1, 3] } as const;

export interface ProofNode {
  id: string;
  type: "Fact" | "Rule";
  claim: string;
  /** A Rule's name at its bar: the function that checks it, or the rule of logic. */
  name: string;
  /** The lines that check this premise: shown where checking stops when it breaks. */
  ref?: ResolvedRef;
  /** Indexes of the premises right above this node's bar. */
  given: number[];
  /** 0 for the goal, 1 for its premises… */
  depth: number;
  /** Index of the Rule this premise feeds, -1 for the goal. */
  parent: number;
}

export interface ProofModel {
  title: string;
  /** Goal first, then breadth first: a parent always comes before its premises. */
  nodes: ProofNode[];
  problems: { id: string; message: string }[];
}

const isElement = (value: unknown): value is ElementNode => Boolean(value && typeof value === "object" && (value as ElementNode).type === "element");
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function readProof(node: ElementNode, refs: RefTable): ProofModel {
  const owner = node.statementId ?? "root";
  const problems: ProofModel["problems"] = [];
  const add = (id: string | undefined, message: string) => problems.push({ id: id ?? owner, message });
  const nodes: ProofNode[] = [];
  const goal = node.props.goal;
  if (!isElement(goal) || goal.typeName !== "Rule") {
    add(owner, "A Proof's goal is one Rule(claim, name, given, ref?): the conclusion at the bottom.");
    return { title: str(node.props.title), nodes, problems };
  }
  const seen = new Set<string>();
  const queue: { raw: ElementNode; depth: number; parent: number }[] = [{ raw: goal, depth: 0, parent: -1 }];
  while (queue.length) {
    const { raw, depth, parent } = queue.shift()!;
    const id = raw.statementId ?? owner;
    if (seen.has(id)) {
      add(id, `${id} is given twice; each premise sits above one Rule.`);
      continue;
    }
    seen.add(id);
    const type = raw.typeName as ProofNode["type"];
    const claim = str(raw.props.claim);
    if (!claim) add(id, `${type} needs a claim: what holds, in at most 8 words.`);
    const proofNode: ProofNode = { id, type, claim, name: type === "Rule" ? str(raw.props.name) : "", given: [], depth, parent };
    const cite = str(raw.props.ref);
    if (cite) {
      const resolved = resolveRef(cite, refs);
      if (!resolved.ok) add(id, `${id}: ref ${resolved.reason}. Cite only refs from the list, or leave it out.`);
      else proofNode.ref = resolved.ref;
    }
    const index = nodes.push(proofNode) - 1;
    if (parent >= 0) nodes[parent]!.given.push(index);
    if (type !== "Rule") continue;
    if (!proofNode.name) add(id, `Rule "${claim}" needs a name: the function that checks it, or the rule of logic.`);
    const given = Array.isArray(raw.props.given) ? raw.props.given : [];
    const [fewest, most] = PROOF_LIMITS.given;
    if (given.length < fewest || given.length > most) add(id, `A Rule rests on ${fewest} to ${most} given, not ${given.length}; with none, it is a Fact.`);
    if (depth >= PROOF_LIMITS.depth && given.length) add(id, `${id} is too deep: a Proof has at most ${PROOF_LIMITS.depth} rows of rules; make ${id} a Fact.`);
    for (const premise of given) {
      if (isElement(premise) && (premise.typeName === "Fact" || premise.typeName === "Rule")) queue.push({ raw: premise, depth: depth + 1, parent: index });
      else add(id, `A Rule's given are Fact(...) or Rule(...) ids, like f1 or g2.`);
    }
  }
  if (nodes.length > PROOF_LIMITS.nodes) add(owner, `A Proof has at most ${PROOF_LIMITS.nodes} Facts and Rules, not ${nodes.length}.`);
  return { title: str(node.props.title), nodes, problems };
}

/** What breaking one premise does: it and every Rule below it down to the goal fail; the rest stand. */
export function failedFrom(nodes: ProofNode[], broken: number) {
  const failed = new Set<number>();
  for (let at = broken; at >= 0; at = nodes[at]!.parent) failed.add(at);
  return failed;
}
