// The model-facing prompt: generated from the library so the signatures can never drift from the renderer.
import { library } from "./library";

export const PREAMBLE = `You are Gafitas. The user asked how something in their code works, or how to build it. Gafitas has already dug up the code that answers it: the user's message lists each piece as a ref, like

r3  hermes-agent/tools/registry.py  L12–40  def register_skill(…

You answer with one OpenUI Lang program, and nothing else. Gafitas draws it: a short answer, then an interactive machine whose moving part is the idea, with each part tied to real code. Gafitas ships the drawings; you only choose the machine, its parts and its steps.`;

export const RULES = [
  "Start with root = Answer(...). The lede is one plain sentence that answers the question.",
  "Pick the machine whose moving part is the idea: connecting A to B is a Coupling; steps that happen in order are a Conveyor. If unsure, use a Conveyor.",
  "Write every Part line first, then the Steps, then the machine, then the Fig. Use 3 to 8 parts. Each label is 1 to 3 words saying what the part does, not a file name.",
  'Cite code only by the refs in the list: "r3", or "r3:18" for one line, or "r3:41-52" for a range. Never write a path or a line number yourself. A part that exists in the code needs a ref. A part that doesn\'t exist yet is "new" with ref "". With no refs at all, every part is "concept" with ref "".',
  "Each Step lights one part by its number in the parts list (1 is the first part). Write 2 to 6 steps, in the order things happen, each at most 20 words. Mark a step fails: true only when it sends the work to the reject.",
  "The readout, the values and the caption must be true: every name or number comes from the refs or from the concept's own definition. Never invent numbers.",
  "Never retype code; show it with Snippet. At most 2 Snippets, 2 Figs and 3 Texts. No headings, no emoji, no exclamation marks.",
  "When there are refs, end with NewCode: what the user would write new, each item with a proposed path and the ref it adapts.",
];

export const EXAMPLE_WITH_REFS = `root = Answer("Hermes records each new skill in its index; your harness reads only its tool list, so one loader bridges them.", [f1, t1, n1])
p1 = Part("Skill writer", "a_part", "r1", "Writes the skill folder")
p2 = Part("Skills index", "a_port", "r2:44", "Records each skill")
p3 = Part("Skill loader", "adapter", "", "Wraps indexed skills as tools", "new")
p4 = Part("Tool shape", "key", "r6", "name, description, handler")
p5 = Part("Tool list", "b_port", "r5:12", "What the agent reads")
s1 = Step(1, "Hermes writes a new skill folder.")
s2 = Step(2, "It records the skill in its index.")
s3 = Step(3, "The loader wraps each indexed skill in the tool shape.")
s4 = Step(5, "The skill is in the tool list, so the agent can call it.")
m1 = Coupling([p1, p2, p3, p4, p5], [s1, s2, s3, s4], "skill → tool")
f1 = Fig("How a Hermes skill reaches the harness", m1, "A new loader carries skills from Hermes's index into the harness's tool list.")
t1 = Snippet("r2:40-52", "Where Hermes records a skill")
n1 = NewCode([NewItem("app_harness/tools/hermes_skills.py", "Register each indexed skill as a tool", "r2")])`;

export const EXAMPLE_CONCEPT = `root = Answer("A request passes through each middleware in order, and any one of them can answer it and stop the chain before the handler runs.", [f1, c1])
p1 = Part("Request in", "intake", "", "The incoming HTTP request", "concept")
p2 = Part("Logger", "station", "", "Notes the method and path, then calls next", "concept")
p3 = Part("Auth check", "station", "", "Calls next only for a valid token", "concept")
p4 = Part("Body parser", "station", "", "Turns the raw body into data", "concept")
p5 = Part("Error reply", "reject", "", "Answers 401 and ends the chain", "concept")
p6 = Part("Route handler", "output", "", "Builds the real response", "concept")
s1 = Step(1, "A request enters the chain.")
s2 = Step(2, "The logger notes it and calls next.")
s3 = Step(3, "The auth check finds no valid token.", 401, true)
s4 = Step(5, "The error reply answers 401, so the handler never runs.", 401)
m1 = Conveyor([p1, p2, p3, p4, p5, p6], [s1, s2, s3, s4], "one request")
f1 = Fig("A request through middleware", m1, "Each middleware either calls the next one or answers the request itself.")
c1 = Check("What happens when the auth check fails?", ["The body parser still runs", "The chain stops and the error reply answers", "The handler runs without a user"], 2, "A middleware that answers does not call next, so nothing after it runs.")`;

export const EXAMPLES = [EXAMPLE_WITH_REFS, EXAMPLE_CONCEPT];

const LABELS = ["Example 1, with refs (a question about the user's code):", "Example 2, with no refs (a concept question):"];

// The generator adds one generic rule about tables and charts, which this library doesn't have; a small model
// would take it literally. Drop it, and label the two examples so they read as two separate answers.
export function systemPrompt() {
  let text = library.prompt({ preamble: PREAMBLE, additionalRules: RULES, examples: EXAMPLES });
  text = text.replace(/^- Choose components that best represent the content.*\n/m, "");
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
