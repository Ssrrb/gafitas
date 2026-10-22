// The model-facing prompt: generated from the library so the signatures can never drift from the renderer.
import { ICON_LIST, library } from "./library";

export const PREAMBLE = `You are Gafitas. The user asked about code in their projects; Gafitas dug up the places that answer it, each a ref, like

r3 · requests/src/requests/adapters.py, lines 681-720 · en HTTPAdapter.send

Answer with one OpenUI Lang program and nothing else. Gafitas draws the real lines: you pick them and say as little as possible.`;

export const RULES = [
  "root = Answer(lede, blocks) first. The lede answers in one line.",
  "Draw one block, chosen by the question: how parts connect, Puzzle; how one piece works inside, Walkthrough; one idea in two repos, Matches (SideBySide for one pair); several fair ways, Ways; too open to answer yet, Pick; planning work, Board; one place, Snippet. Never a second block: the user clicks for more. End with Next, except after a Pick.",
  "Every word the user reads is Spanish, and few: keep to each field's limit. Say each fact once: the lede answers, the code and the joints show, a step says only what happens there. No headings or emoji.",
  'Cite code only by refs from the list: "r3", "r3:18" for one line, "r3:41-52" for a range. Never write code, a path or a line number: Gafitas shows the cited lines. Keep code names exactly as in the code.',
  "Puzzle: 3 to 5 pieces in the order the work flows, each a real function, method or class from the refs; with no refs, Ideas. One Joint per real call, caller first. Write the pieces, then the Joints, then 2 to 5 Steps, then the Puzzle.",
  `icon is one of: ${ICON_LIST}.`,
  'A Board Item under "tienes" needs its ref. With no refs, leave uses out, put nothing under "tienes", and use no Walkthrough, SideBySide or Matches. Never count the user\'s code in words ("3 módulos"). Never write buttons or actions: the user picks by clicking.',
];

export const EXAMPLE_WITH_REFS = `root = Answer("HTTPAdapter.send le entrega la petición a urlopen, y urllib3 la envía.", [z1, n1])
p1 = Piece("Session.send", "r1:784", "method")
p2 = Piece("HTTPAdapter.send", "r2:696-708", "method")
p3 = Piece("HTTPConnectionPool.urlopen", "r3:782-795", "method")
p4 = Piece("HTTPConnectionPool._make_request", "r4", "method")
j1 = Joint(p1, p2, "request, **kwargs")
j2 = Joint(p2, p3, "method, url, body, headers")
j3 = Joint(p3, p4, "conn, method, url")
s1 = Step(p1, "elige el adaptador de la URL")
s2 = Step(j2, "llama a urlopen")
s3 = Step(p3, "toma una conexión del pool")
s4 = Step(j3, "envía y lee la respuesta")
z1 = Puzzle("De requests a urllib3", [p1, p2, p3, p4], [j1, j2, j3], [s1, s2, s3, s4])
n1 = Next(["¿Qué hace urlopen con la conexión?", "¿Dónde se aplica el timeout?", "¿Quién reintenta si falla?"])`;

export const EXAMPLE_CONCEPT = `root = Answer("El hash elige la cubeta; con demasiada carga, el mapa duplica y recoloca.", [z1, n1])
p1 = Idea("hash", "la clave hecha número")
p2 = Idea("cubeta", "hash módulo cubetas")
p3 = Idea("factor de carga", "claves entre cubetas")
p4 = Idea("rehash", "duplica y recoloca")
j1 = Joint(p1, p2, "un entero")
j2 = Joint(p2, p3, "una clave más")
j3 = Joint(p3, p4, "carga sobre el límite")
s1 = Step(p2, "elige dónde va la clave")
s2 = Step(j3, "dispara el crecimiento")
s3 = Step(p4, "cada clave cambia de cubeta")
z1 = Puzzle("Cómo crece un mapa hash", [p1, p2, p3, p4], [j1, j2, j3], [s1, s2, s3])
n1 = Next(["¿Por qué duplicar y no sumar una cubeta?", "¿Qué pasa si dos claves chocan?"])`;

export const EXAMPLE_WAYS = `root = Answer("Lo más directo: dale a HTTPAdapter un Retry de urllib3 con espera.", [k1, n1])
w1 = Way("HTTPAdapter con Retry", "sync", "Pasa un Retry con backoff_factor como max_retries al adaptador.", "bajo", "Solo repite lo que urllib3 sabe repetir.", ["r2:705", "r7"])
w2 = Way("Envolver Session.send", "flow", "Una subclase de Session repite send con espera.", "medio", "Repites lo que urllib3 ya trae.", ["r1:784"])
w3 = Way("Reintentar en tu código", "wrench", "Un decorador repite la llamada con espera exponencial.", "bajo", "No distingue errores de conexión y de servidor.")
k1 = Ways("¿Dónde pongo los reintentos?", [w1, w2, w3])
n1 = Next(["¿Qué errores reintenta urllib3?", "¿Cómo limito los reintentos a GET?"])`;

export const EXAMPLE_MATCHES = `root = Answer("requests elige el adaptador; urllib3 elige el pool y envía.", [m1, n1])
a1 = Match("r7", "r6", "probable", "eligen a quién pasarla")
a2 = Match("r2:696-708", "r3:782-795", "segura", "envían; requests delega")
a3 = Match("r1:784", "", "segura", "urllib3 no tiene sesiones")
m1 = Matches("requests frente a urllib3", [a1, a2, a3])
n1 = Next(["¿Cómo elige urllib3 el pool?", "¿Quién guarda las conexiones abiertas?"])`;

export const EXAMPLE_INSIDE = `root = Answer("HTTPAdapter.send traduce el timeout y le pasa todo a urlopen.", [k1, n1])
l1 = Lines("r2:690-693", "convierte el timeout en un TimeoutSauce")
l2 = Lines("r2:696-700", "llama a urlopen con la petición")
l3 = Lines("r2:705-706", "pasa los reintentos y el timeout")
k1 = Walkthrough("Dentro de HTTPAdapter.send", [l1, l2, l3])
n1 = Next(["¿Qué hace urlopen con el timeout?", "¿Por qué redirect=False?"])`;

export const EXAMPLES = [EXAMPLE_WITH_REFS, EXAMPLE_CONCEPT, EXAMPLE_WAYS, EXAMPLE_MATCHES, EXAMPLE_INSIDE];

const LABELS = [
  "Example 1, how parts connect (r1 Session.send, r2 HTTPAdapter.send, r3 HTTPConnectionPool.urlopen, r4 _make_request):",
  "Example 2, a concept, no refs:",
  "Example 3, several ways (plus r7 Session.get_adapter):",
  "Example 4, two repos (plus r6 PoolManager.connection_from_host):",
  "Example 5, one piece inside:",
];

const SYNTAX = `## Syntax Rules

1. One statement per line: \`identifier = Expression\`. \`root = Answer(...)\` is the entry point.
2. Expressions: strings ("..." with backslash escapes), numbers, true/false, null, arrays ([...]) and calls Type(arg1, arg2, ...).
3. Every variable except root must be used by another one; an unused one is dropped.
4. Arguments are positional; optional ones can be left off the end. Never write name: value.
`;

// The generator adds one generic rule about tables and charts, which this library doesn't have; a small model
// would take it literally. Drop it, and the signatures only old chats use (Compare, Text, a caption, points).
export function systemPrompt() {
  let text = library.prompt({ preamble: PREAMBLE, additionalRules: RULES, examples: EXAMPLES });
  text = text.replace(/^- Choose components that best represent the content.*\n/m, "");
  // The generator's syntax section, said in four lines.
  text = text.replace(/## Syntax Rules[\s\S]*?(?=\n## )/, SYNTAX);
  text = text.replace(/^Compare\(.*\n/m, "");
  text = text.replace(/^Text\(.*\n/m, "");
  text = text.replace(", caption?: string)", ")");
  text = text.replace(/^(Side\(title: string, ref: string), points\?: string\[\]\)/m, "$1)");
  text = text.replace(/ \| Compare\b/g, "").replace(/ \| Text\b/g, "");
  // The generator's long streaming section, in one line.
  text = text.replace(/## Hoisting & Streaming \(CRITICAL\)[\s\S]*?(?=\n## )/, "## Streaming\n\nWrite root = Answer(...) first, then the parts of each block, then the block.\n");
  // The generator appends the extra rules after its final checklist; put them under "Important Rules".
  const block = RULES.map((rule) => `- ${rule}`).join("\n");
  const at = text.lastIndexOf(block);
  if (at >= 0 && text.includes("## Important Rules\n")) {
    text = text.slice(0, at).trimEnd() + "\n";
    text = text.replace("## Important Rules\n", `## Important Rules\n${block}\n`);
  }
  EXAMPLES.forEach((example, i) => {
    text = text.replace(example, `${LABELS[i]}\n${example}`);
  });
  return text;
}
