// After the stream ends: every problem in the program, each tied to the statement that has to change.
// The parser is lenient (it drops what it can't read and renders the rest), so this adds a line check, the
// ref check (the anti-hallucination rule) and the machines' slot rules on top of the parser's own errors.
import { createParser, mergeStatements, type ElementNode } from "@openuidev/lang-core";
import { library, ROOT } from "./library";
import { bind, isMachine, type PartLike } from "./machines/slots";
import { resolveRef, type RefTable } from "./refs";

export interface AnswerError {
  id: string;
  message: string;
}

export const LIMITS = { Fig: 2, Snippet: 2, Text: 3 } as const;
export const BLOCKS = ["Fig", "CodeRef", "Snippet", "Callout", "Compare", "NewCode", "Check", "Text"] as const;

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
    add(error.statementId, error.message);
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
      case "Fig":
        if (isElement(p.machine)) {
          if (!isMachine(p.machine.typeName)) add(p.machine.statementId ?? id, `A Fig's machine must be Coupling or Conveyor, not ${p.machine.typeName}.`);
          else checkMachine(p.machine, id);
        }
        break;
      case "CodeRef":
        refCheck(id, "CodeRef", p.ref);
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
      case "NewCode": {
        const items = Array.isArray(p.items) ? p.items : [];
        for (const item of items) {
          if (!isElement(item)) continue;
          if (item.typeName !== "NewItem") add(item.statementId ?? id, `NewCode takes NewItem(...) values, not ${item.typeName}.`);
          else refCheck(item.statementId ?? id, "NewItem adapts", item.props.adapts, true);
        }
        break;
      }
      case "Check": {
        const options = Array.isArray(p.options) ? p.options : [];
        if (options.length !== 3) add(id, `Check needs exactly 3 options, not ${options.length}.`);
        const answer = Number(p.answer);
        if (!Number.isInteger(answer) || answer < 1 || answer > Math.max(1, options.length)) add(id, `Check's answer is the number of the right option (1–${options.length || 3}), not ${String(p.answer)}.`);
        break;
      }
    }
  }

  function checkMachine(machine: ElementNode, figId: string) {
    const id = machine.statementId ?? figId;
    const type = machine.typeName as "Coupling" | "Conveyor";
    const rawParts = Array.isArray(machine.props.parts) ? machine.props.parts : [];
    const rawSteps = Array.isArray(machine.props.steps) ? machine.props.steps : [];
    const parts: PartLike[] = [];
    rawParts.forEach((part) => {
      if (!isElement(part)) return;
      if (part.typeName !== "Part") {
        add(part.statementId ?? id, `${type} parts must be Part(...), not ${part.typeName}.`);
        return;
      }
      const pid = part.statementId ?? id;
      const props = part.props as PartLike;
      parts.push(props);
      const status = props.status ?? "exists";
      const ref = (props.ref ?? "").trim();
      if (status === "exists" && !ref) add(pid, `Part "${props.label ?? ""}" exists in the code, so it needs a ref; if it isn't written yet, mark it "new".`);
      if (ref) refCheck(pid, `Part "${props.label ?? ""}"`, ref);
    });
    const binding = bind(type, parts);
    for (const problem of binding.problems) {
      const partNode = problem.part === null ? null : rawParts.filter(isElement).filter((n) => n.typeName === "Part")[problem.part];
      add(partNode?.statementId ?? id, problem.message + ".");
    }
    if (!rawSteps.length) add(id, `${type} needs at least one Step.`);
    rawSteps.forEach((step) => {
      if (!isElement(step)) return;
      const sid = step.statementId ?? id;
      if (step.typeName !== "Step") {
        add(sid, `${type} steps must be Step(...), not ${step.typeName}.`);
        return;
      }
      const lit = Number(step.props.lit);
      if (!Number.isInteger(lit) || lit < 1 || lit > parts.length) add(sid, `Step lights part ${String(step.props.lit)}, but the parts are numbered 1–${parts.length}.`);
    });
  }

  return errors;
}

/**
 * Repair turn: what is still broken is dropped. Each broken statement takes down the top-level block that
 * reaches it (a bad Part drops its whole Fig, so step numbers never shift); stray lines just go.
 */
export function pruneBroken(text: string, errors: AnswerError[]): string {
  if (!errors.length) return text;
  const { statements } = statementsOf(text);
  const byId = new Map(statements.map((s) => [s.id, s]));
  const uses = new Map(statements.map((s) => [s.id, [...words(s.rhs)].filter((w) => byId.has(w) && w !== s.id)]));
  const reach = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (uses.get(from) ?? []).some((next) => reach(next, target, seen));
  };
  const rootBlocks = (uses.get("root") ?? []).filter((id) => id !== "root");
  const dropIds = new Set<string>();
  const dropLines = new Set<number>();
  for (const error of errors) {
    const stray = /^line (\d+)$/.exec(error.id);
    if (stray) {
      dropLines.add(Number(stray[1]));
      continue;
    }
    if (error.id === "root" || !byId.has(error.id)) continue;
    const owners = rootBlocks.filter((block) => reach(block, error.id));
    if (owners.length) owners.forEach((block) => dropIds.add(block));
    else dropIds.add(error.id);
  }
  const kept = text
    .split("\n")
    .filter((_, index) => {
      if (dropLines.has(index + 1)) return false;
      const match = STATEMENT.exec(_.trim());
      return !(match && dropIds.has(match[1]!));
    })
    .join("\n");
  // Dropped blocks become unresolved names in root's list; rewrite the list without them.
  const rootLine = statementsOf(kept).statements.find((s) => s.id === "root");
  let cleaned = kept;
  if (rootLine && dropIds.size) {
    const lines = kept.split("\n");
    const index = rootLine.line - 1;
    lines[index] = lines[index]!.replace(/\[([^\]]*)\]\s*\)\s*$/, (_m, inner: string) => {
      const list = inner
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && !dropIds.has(part));
      return `[${list.join(", ")}])`;
    });
    cleaned = lines.join("\n");
  }
  try {
    return mergeStatements(cleaned, "", "root");
  } catch {
    return cleaned;
  }
}
