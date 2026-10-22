// After the stream ends: every problem in the program, each tied to the statement that has to change.
// The parser is lenient (it drops what it can't read and renders the rest), so this adds a line check, the
// ref check (the anti-hallucination rule) and the Puzzle's rules on top of the parser's own errors. The
// messages go only to the model, in the repair turn, so they're English like the rest of its prompt.
import { createParser, mergeStatements, type ElementNode } from "@openuidev/lang-core";
import { BLOCKS, LIMITS, library, ROOT } from "./library";
import { readPuzzle } from "./puzzle/model";
import { resolveRef, type RefTable } from "./refs";

export interface AnswerError {
  id: string;
  message: string;
}

let parser: ReturnType<typeof createParser> | null = null;
export const parseProgram = (text: string) => (parser ??= createParser(library.toJSONSchema(), ROOT)).parse(text);

const STATEMENT = /^\s*([A-Za-z_$][\w$]*)\s*=\s*(.*)$/;

export interface Statement {
  id: string;
  line: number;
  rhs: string;
}

/** Split a program into statements; lines that aren't `name = …` are reported, not guessed at. */
export function statementsOf(text: string) {
  const statements: Statement[] = [];
  const stray: { line: number; text: string }[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;
    const match = STATEMENT.exec(line);
    if (!match) stray.push({ line: index + 1, text: line });
    else statements.push({ id: match[1]!, line: index + 1, rhs: match[2]! });
  });
  return { statements, stray };
}

/** Strings closed, brackets balanced, a call or value after the `=`. */
function lintStatement(rhs: string): string | null {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let quote = false;
  for (let i = 0; i < rhs.length; i++) {
    const c = rhs[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === '"') quote = false;
      continue;
    }
    if (c === '"') quote = true;
    else if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (c === ")" || c === "]" || c === "}") {
      if (stack.pop() !== pairs[c]) return "has a closing bracket that doesn't match";
    } else if (c === "#" && !stack.length) break;
  }
  if (quote) return "has a string that never closes";
  if (stack.length) return "is cut off: a bracket never closes";
  if (!rhs.trim()) return "has nothing after the =";
  return null;
}

const words = (rhs: string) => {
  const names = new Set<string>();
  const bare = rhs.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  for (const match of bare.matchAll(/[A-Za-z_$][\w$]*/g)) names.add(match[0]);
  return names;
};

const isElement = (value: unknown): value is ElementNode => Boolean(value && typeof value === "object" && (value as ElementNode).type === "element");

export function validateProgram(text: string, refs: RefTable): AnswerError[] {
  const errors: AnswerError[] = [];
  const add = (id: string | undefined, message: string) => {
    const key = `${id ?? "root"}|${message}`;
    if (!errors.some((e) => `${e.id}|${e.message}` === key)) errors.push({ id: id ?? "root", message });
  };
  if (!text.trim()) {
    add("root", "The answer is empty. Start with root = Answer(...).");
    return errors;
  }
  const { statements, stray } = statementsOf(text);
  for (const line of stray) add(`line ${line.line}`, `Line ${line.line} is not a statement (write name = Component(...)): ${line.text.slice(0, 60)}`);
  for (const statement of statements) {
    const problem = lintStatement(statement.rhs);
    if (problem) add(statement.id, `${statement.id} ${problem}.`);
  }
  if (!statements.some((s) => s.id === "root")) add("root", `There is no root statement. The first line must be root = ${ROOT}(...).`);

  const result = parseProgram(text);
  for (const error of result.meta.errors) {
    if (error.severity === "warning") continue;
    if (error.component === "Step" && error.path === "/lit") add(error.statementId, `${error.statementId} must light a piece or a joint by its id, like p2 or j1, not a number.`);
    else add(error.statementId, error.message);
  }
  for (const name of result.meta.unresolved) {
    const user = statements.find((s) => words(s.rhs).has(name));
    add(user?.id, `"${name}" is used but never defined.`);
  }
  const root = result.root;
  if (!root) return errors;
  if (root.typeName !== ROOT) add("root", `root must be ${ROOT}(...), not ${root.typeName}(...).`);

  const refCheck = (id: string | undefined, what: string, value: unknown, allowEmpty = false) => {
    const text = typeof value === "string" ? value : "";
    if (!text.trim()) {
      if (!allowEmpty) add(id, `${what} needs a ref from the list.`);
      return;
    }
    const resolved = resolveRef(text, refs);
    if (!resolved.ok) add(id, `${what}: ref ${resolved.reason}. Cite only refs from the list.`);
  };

  const blocks = Array.isArray(root.props.blocks) ? root.props.blocks : [];
  const seen: Record<string, number> = {};
  for (const block of blocks) {
    if (!isElement(block)) continue;
    const id = block.statementId ?? "root";
    const type = block.typeName;
    if (!(BLOCKS as readonly string[]).includes(type)) {
      add(id, `${type} can't be a block of the Answer (use ${BLOCKS.join(", ")}).`);
      continue;
    }
    seen[type] = (seen[type] ?? 0) + 1;
    const limit = LIMITS[type as keyof typeof LIMITS];
    if (limit && seen[type]! > limit) add(id, `At most ${limit} ${type}${limit > 1 ? "s" : ""}; this one is not shown.`);
    checkBlock(block, id);
  }

  function checkBlock(node: ElementNode, owner: string) {
    const id = node.statementId ?? owner;
    const p = node.props;
    switch (node.typeName) {
      case "Puzzle":
        for (const problem of readPuzzle(node, refs).problems) add(problem.id, problem.message);
        break;
      case "Snippet":
        refCheck(id, "Snippet", p.ref);
        break;
      case "Compare":
        for (const side of [p.left, p.right]) {
          if (!isElement(side)) continue;
          if (side.typeName !== "Side") add(side.statementId ?? id, `Compare takes two Side(...) values, not ${side.typeName}.`);
          else refCheck(side.statementId ?? id, "Side", side.props.ref);
        }
        break;
      case "Check": {
        const options = Array.isArray(p.options) ? p.options : [];
        if (options.length !== 3) add(id, `Check needs exactly 3 options, not ${options.length}.`);
        const answer = Number(p.answer);
        if (!Number.isInteger(answer) || answer < 1 || answer > Math.max(1, options.length)) add(id, `Check's answer is the number of the right option (1–${options.length || 3}), not ${String(p.answer)}.`);
        break;
      }
    }
  }


  return errors;
}

/** Strings masked as "0", "1"…, so brackets and commas inside them don't count. */
function masked(rhs: string) {
  const strings: string[] = [];
  const bare = rhs.replace(/"(?:[^"\\]|\\.)*"/g, (m) => `"${strings.push(m) - 1}"`);
  return { bare, restore: (text: string) => text.replace(/"(\d+)"/g, (_m, i: string) => strings[Number(i)]!) };
}

/** The [lists] in a statement, each as its items. */
const listsOf = (rhs: string) => [...masked(rhs).bare.matchAll(/\[([^[\]]*)\]/g)].map((m) => m[1]!.split(",").map((x) => x.trim()).filter(Boolean));

/** The statement with these ids taken out of every [list]. */
function dropFromLists(rhs: string, drop: Set<string>) {
  const { bare, restore } = masked(rhs);
  return restore(bare.replace(/\[([^[\]]*)\]/g, (_m, inner: string) => `[${inner.split(",").map((x) => x.trim()).filter((x) => x && !drop.has(x)).join(", ")}]`));
}

/**
 * Repair turn: what is still broken is dropped, and so is everything that leans on it, but no more. A broken
 * piece takes its Joints and the Steps that light them; the Puzzle just loses them from its lists (and goes too
 * once it has fewer than 2 pieces or no Joint). Any other block that reaches a broken statement goes whole;
 * stray lines just go.
 */
export function pruneBroken(text: string, errors: AnswerError[]): string {
  if (!errors.length) return text;
  const { statements } = statementsOf(text);
  const byId = new Map(statements.map((s) => [s.id, s]));
  const kind = new Map(statements.map((s) => [s.id, /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(s.rhs)?.[1] ?? ""]));
  const uses = new Map(statements.map((s) => [s.id, [...words(s.rhs)].filter((w) => byId.has(w) && w !== s.id)]));
  const containers = new Set(["Answer", "Puzzle"]);
  const drop = new Set<string>();
  const dropLines = new Set<number>();
  for (const error of errors) {
    const stray = /^line (\d+)$/.exec(error.id);
    if (stray) dropLines.add(Number(stray[1]));
    else if (error.id !== "root" && byId.has(error.id)) drop.add(error.id);
  }
  const rhs = new Map(statements.map((s) => [s.id, s.rhs]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of statements) {
      if (drop.has(s.id) || !(uses.get(s.id) ?? []).some((u) => drop.has(u))) continue;
      if (!containers.has(kind.get(s.id) ?? "")) {
        drop.add(s.id);
        changed = true;
        continue;
      }
      const next = dropFromLists(rhs.get(s.id)!, drop);
      rhs.set(s.id, next);
      uses.set(s.id, [...words(next)].filter((w) => byId.has(w) && w !== s.id));
      if (kind.get(s.id) === "Puzzle") {
        const [pieces = [], joints = []] = listsOf(next);
        if (pieces.length < 2 || joints.length < 1) {
          drop.add(s.id);
          changed = true;
        }
      }
    }
  }
  const kept = text
    .split("\n")
    .flatMap((line, index) => {
      if (dropLines.has(index + 1)) return [];
      const match = STATEMENT.exec(line.trim());
      if (!match) return [line];
      if (drop.has(match[1]!)) return [];
      const next = rhs.get(match[1]!);
      return [next === undefined || next === match[2] ? line : `${match[1]} = ${next}`];
    })
    .join("\n");
  try {
    return mergeStatements(kept, "", "root");
  } catch {
    return kept;
  }
}
