// After the stream ends: every problem in the program, each tied to the statement that has to change.
// The parser is lenient (it drops what it can't read and renders the rest), so this adds a line check, the
// ref check (the anti-hallucination rule) and the Puzzle's rules on top of the parser's own errors. The
// messages go only to the model, in the repair turn, so they're English like the rest of its prompt.
import { createParser, mergeStatements, type ElementNode } from "@openuidev/lang-core";
import { BLOCKS, library, ROOT } from "./library";
import { sureOf } from "./components/Learn";
import { readPuzzle } from "./puzzle/model";
import { columnOf, effortOf } from "./components/Choices";
import { resolveRef, type RefTable } from "./refs";

export interface AnswerError {
  id: string;
  message: string;
  /** Worth a repair, never worth dropping: the page already draws around it. */
  soft?: true;
}

/** A model counting the user's code in words: a claim the page can't check, and the page counts for itself. */
const COUNTED = /\b\d+\s+(módulos?|archivos?|funciones|función|clases?|lugares|tests?|pruebas?|tipos?|líneas?|proyectos?)\b/i;

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

/** What the model writes for a person to read, by component: the words budget counts these. Names, refs, icons and
 * joint labels (what crosses, as the code names it) don't count. */
const PROSE: Record<string, string[]> = {
  Answer: ["lede"],
  Ways: ["question"],
  Way: ["title", "what", "tradeoff"],
  Pick: ["question"],
  Option: ["label", "note"],
  Board: ["title"],
  Item: ["title", "note"],
  Puzzle: ["title", "caption"],
  NewPiece: ["note"],
  Idea: ["note"],
  Step: ["text"],
  Matches: ["title"],
  Match: ["note"],
  Walkthrough: ["title"],
  Lines: ["text"],
  SideBySide: ["title", "note"],
  Side: ["points"],
  Snippet: ["note"],
  Callout: ["text"],
  Text: ["md"],
  Next: ["questions"],
};
/** Words per answer: what it aims for, and past which the repair turn asks for fewer. */
export const WORDS = { lede: 18, answer: 100 } as const;
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const DOTTED = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
/** Code retyped in prose: a `span` or a call with arguments that holds ( = " [ {, or runs past 32 characters. */
function retyped(text: string) {
  for (const match of text.matchAll(/`([^`]+)`/g)) if (/[(="[{]/.test(match[1]!) || match[1]!.length > 32) return match[1]!;
  return /[A-Za-z_$][\w$.]*\([^)\s][^)]*\)/.exec(text.replace(/`[^`]*`/g, ""))?.[0] ?? null;
}

/** The prose an answer puts on screen, and its statements', by id. Checks (a quiz) aren't counted. */
export function measure(text: string) {
  const root = parseProgram(text).root;
  const byId = new Map<string, number>();
  const strings: { id: string; text: string }[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, owner: string) => {
    if (Array.isArray(value)) return value.forEach((v) => visit(v, owner));
    if (!isElement(value) || seen.has(value)) return;
    seen.add(value);
    const id = value.statementId ?? owner;
    for (const field of PROSE[value.typeName] ?? []) {
      const v = value.props[field];
      for (const t of Array.isArray(v) ? v : [v]) {
        if (typeof t !== "string" || !t.trim()) continue;
        strings.push({ id, text: t });
        byId.set(id, (byId.get(id) ?? 0) + wordCount(t));
      }
    }
    for (const v of Object.values(value.props)) visit(v, id);
  };
  visit(root, "root");
  return { words: [...byId.values()].reduce((a, b) => a + b, 0), byId, strings };
}

export function validateProgram(text: string, refs: RefTable, opts: { quiz?: boolean } = {}): AnswerError[] {
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

  const addSoft = (id: string | undefined, message: string) => {
    if (!errors.some((e) => e.id === (id ?? "root") && e.message === message)) errors.push({ id: id ?? "root", message, soft: true });
  };
  const counted = (id: string, ...texts: unknown[]) => {
    const hit = texts.map((t) => (typeof t === "string" ? COUNTED.exec(t) : null)).find(Boolean);
    if (hit) add(id, `${id} counts the user's code ("${hit[0]}"); never count it in words: Gafitas counts from the refs.`);
  };

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
  // Blocks over their limits are left out of the drawing (library.tsx drawnBlocks), not sent back: a repair turn for
  // something the page already handles only costs time.
  for (const block of blocks) {
    if (!isElement(block)) continue;
    const id = block.statementId ?? "root";
    const type = block.typeName;
    if (!(BLOCKS as readonly string[]).includes(type)) {
      add(id, `${type} can't be a block of the Answer (use ${BLOCKS.join(", ")}).`);
      continue;
    }
    checkBlock(block, id);
  }

  // Few words: what the page can't cut without losing meaning goes back once, drawn as it is meanwhile.
  const lede = typeof root.props.lede === "string" ? root.props.lede : "";
  if (wordCount(lede) > WORDS.lede) addSoft("root", `The lede has ${wordCount(lede)} words; answer in one line of at most 12.`);
  const prose = measure(text);
  if (prose.words > WORDS.answer) addSoft("root", `The answer has ${prose.words} words for the user to read; keep it under ${WORDS.answer}: one block, short steps and notes, each fact once.`);
  for (const { id, text: t } of prose.strings) {
    const code = retyped(t);
    if (code) addSoft(id, `${id} retypes code ("${code.slice(0, 40)}"); cite its ref instead, so Gafitas shows the real lines.`);
  }
  if (opts.quiz && !blocks.some((block) => isElement(block) && block.typeName === "Check")) {
    addSoft("root", "The user asked «Ponme a prueba»: answer with 2 or 3 Check(question, options, answer, why, ref).");
  }

  function checkBlock(node: ElementNode, owner: string) {
    const id = node.statementId ?? owner;
    const p = node.props;
    switch (node.typeName) {
      case "Puzzle": {
        for (const problem of readPuzzle(node, refs).problems) add(problem.id, problem.message);
        for (const piece of (Array.isArray(p.pieces) ? p.pieces : []).filter(isElement)) {
          const name = typeof piece.props.name === "string" ? piece.props.name.trim() : "";
          if ((piece.typeName === "Piece" || piece.typeName === "NewPiece") && name && !DOTTED.test(name)) {
            addSoft(piece.statementId ?? id, `${piece.statementId ?? id} is named "${name.slice(0, 40)}"; name it as the function, method or class, like "TimedAdapter.send", never a line of code.`);
          }
        }
        break;
      }
      case "Snippet":
        refCheck(id, "Snippet", p.ref);
        break;
      case "Walkthrough": {
        const stops = (Array.isArray(p.stops) ? p.stops : []).filter(isElement);
        if (stops.length < 2 || stops.length > 6) add(id, `Walkthrough needs 2 to 6 Lines(...) stops, not ${stops.length}.`);
        const files = new Set<string>();
        for (const stop of stops) {
          const sid = stop.statementId ?? id;
          if (stop.typeName !== "Lines") {
            add(sid, `Walkthrough takes Lines(...) stops, not ${stop.typeName}.`);
            continue;
          }
          const resolved = resolveRef(String(stop.props.ref ?? ""), refs);
          if (!resolved.ok) add(sid, `${sid}: ref ${resolved.reason}. Cite only refs from the list.`);
          else {
            files.add(resolved.ref.entry.id);
            if (resolved.ref.to - resolved.ref.from + 1 > 12) addSoft(sid, `${sid} lights ${resolved.ref.to - resolved.ref.from + 1} lines; a stop is 1 to 12 lines.`);
          }
        }
        if (files.size > 2) add(id, `A Walkthrough reads one or two refs, not ${files.size}.`);
        break;
      }
      case "SideBySide":
        for (const side of [p.left, p.right]) {
          if (!isElement(side)) continue;
          if (side.typeName !== "Side") add(side.statementId ?? id, `SideBySide takes two Side(...) values, not ${side.typeName}.`);
          else refCheck(side.statementId ?? id, "Side", side.props.ref);
        }
        break;
      case "Matches": {
        const pairsList = (Array.isArray(p.pairs) ? p.pairs : []).filter(isElement);
        if (pairsList.length < 2 || pairsList.length > 8) add(id, `Matches needs 2 to 8 Match(...) pairs, not ${pairsList.length}.`);
        const aRepos = new Set<string>();
        const bRepos = new Set<string>();
        for (const pair of pairsList) {
          const mid = pair.statementId ?? id;
          if (pair.typeName !== "Match") {
            add(mid, `Matches takes Match(...) pairs, not ${pair.typeName}.`);
            continue;
          }
          const a = resolveRef(String(pair.props.a ?? ""), refs);
          if (!a.ok) add(mid, `${mid}'s a: ref ${a.reason}. Cite only refs from the list.`);
          else aRepos.add(a.ref.entry.repo);
          const bText = String(pair.props.b ?? "").trim();
          if (bText) {
            const b = resolveRef(bText, refs);
            if (!b.ok) add(mid, `${mid}'s b: ref ${b.reason}. Cite only refs from the list, or "" when there is no equivalent.`);
            else bRepos.add(b.ref.entry.repo);
          }
          if (sureOf(pair.props.sure) === "dudosa" && !/^(dudosa|unsure|dudoso)$/i.test(String(pair.props.sure ?? "").trim())) {
            addSoft(mid, `${mid}'s sure is "segura", "probable" or "dudosa", not "${String(pair.props.sure ?? "")}".`);
          }
        }
        if (aRepos.size > 1 || bRepos.size > 1 || [...aRepos].some((repo) => bRepos.has(repo))) {
          add(id, "In Matches every a is in one repo and every b in another one.");
        }
        break;
      }
      case "Compare":
        addSoft(id, "Use SideBySide(title, left, right, note?) instead of Compare.");
        for (const side of [p.left, p.right]) {
          if (!isElement(side)) continue;
          if (side.typeName !== "Side") add(side.statementId ?? id, `Compare takes two Side(...) values, not ${side.typeName}.`);
          else refCheck(side.statementId ?? id, "Side", side.props.ref);
        }
        break;
      case "Ways": {
        const ways = (Array.isArray(p.ways) ? p.ways : []).filter(isElement);
        if (ways.length < 2 || ways.length > 3) add(id, `Ways needs 2 or 3 Way(...) values, not ${ways.length}.`);
        for (const way of ways) {
          const wid = way.statementId ?? id;
          if (way.typeName !== "Way") add(wid, `Ways takes Way(...) values, not ${way.typeName}.`);
          if (!effortOf(way.props.effort)) addSoft(wid, `${wid}'s effort is "bajo", "medio" or "alto", not "${String(way.props.effort ?? "")}".`);
          for (const cite of Array.isArray(way.props.uses) ? way.props.uses : []) {
            const resolved = resolveRef(String(cite), refs);
            if (!resolved.ok) addSoft(wid, `${wid} uses ${String(cite)}: ref ${resolved.reason}. Cite only refs from the list.`);
          }
          counted(wid, way.props.title, way.props.what, way.props.tradeoff);
        }
        break;
      }
      case "Pick": {
        const options = (Array.isArray(p.options) ? p.options : []).filter(isElement);
        if (options.length < 3 || options.length > 6) add(id, `Pick needs 3 to 6 Option(...) values, not ${options.length}.`);
        for (const option of options) if (option.typeName !== "Option") add(option.statementId ?? id, `Pick takes Option(...) values, not ${option.typeName}.`);
        break;
      }
      case "Board": {
        const items = (Array.isArray(p.items) ? p.items : []).filter(isElement);
        if (items.length < 3 || items.length > 9) add(id, `Board needs 3 to 9 Item(...) values, not ${items.length}.`);
        for (const item of items) {
          const iid = item.statementId ?? id;
          if (item.typeName !== "Item") {
            add(iid, `Board takes Item(...) values, not ${item.typeName}.`);
            continue;
          }
          const column = columnOf(item.props.column);
          const ref = typeof item.props.ref === "string" ? item.props.ref.trim() : "";
          if (!column) addSoft(iid, `${iid}'s column is "tienes", "falta" or "decidir", not "${String(item.props.column ?? "")}".`);
          if (column === "tienes" && !ref) add(iid, `${iid} is under "tienes", so it exists in the code and needs its ref; if it isn't written yet, put it under "falta".`);
          if (ref) {
            const resolved = resolveRef(ref, refs);
            if (!resolved.ok) (column === "tienes" ? add : addSoft)(iid, `${iid}: ref ${resolved.reason}. Cite only refs from the list.`);
          }
          counted(iid, item.props.title, item.props.note);
        }
        break;
      }
      case "Next": {
        const questions = Array.isArray(p.questions) ? p.questions : [];
        if (questions.length < 2 || questions.length > 3) addSoft(id, `Next has 2 or 3 questions, not ${questions.length}.`);
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
  // What a container needs left in each of its lists to stay: a Puzzle 2 pieces and a joint, a choice 2 entries.
  const keeps: Record<string, number[]> = { Answer: [], Puzzle: [2, 1], Ways: [2], Pick: [2], Board: [2], Walkthrough: [2], Matches: [2] };
  const containers = new Set(Object.keys(keeps));
  const drop = new Set<string>();
  const dropLines = new Set<number>();
  for (const error of errors) {
    if (error.soft) continue;
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
      const need = keeps[kind.get(s.id) ?? ""] ?? [];
      if (need.length) {
        const lists = listsOf(next);
        if (need.some((min, i) => (lists[i] ?? []).length < min)) {
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
