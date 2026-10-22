// Dev page: ?f=<fixture>&theme=dark|light&still=1&repair=1&select=r2&chunk=24&live=1, or ?thread=requests.
// Plays a fixture through the same bridge Swift uses, streaming it in chunks so progressive rendering shows, with a
// trail like the one Swift writes. live=1 stops before the answer, with Pi still at work; thread= draws a saved chat.
import { api, applyTheme, type SavedTurn } from "../bridge";
import { forceStill } from "../still";
import type { Trail } from "../store";

const files = import.meta.glob("../../fixtures/*.openui", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const QUESTIONS: Record<string, string> = {
  "requests-urllib3": "¿Cómo le pasa requests una petición a urllib3?",
  "requests-timed": "¿Y si quiero medir cuánto tarda cada envío?",
  "requests-retries": "¿Dónde se reintenta si falla la conexión?",
  "hermes-puzzle": "¿Cómo conecto la creación de skills de Hermes con mi harness?",
  "ingest-puzzle": "¿Qué pasa con una fila que no pasa la validación?",
  "hashmap-idea": "¿Cómo crece una tabla hash?",
  "puzzle-max": "¿Cómo se conectan los tres proyectos?",
  "puzzle-min": "¿Quién envía de verdad una petición en requests?",
};

const working: Trail = {
  lines: [
    { text: "Encontró 7 lugares en requests y urllib3", places: true },
    { text: "Leyó adapters.py, líneas 681–720" },
    { text: "Pensando: «The adapter is picked by the longest prefix that matches the URL.»" },
    { text: "Leyendo connectionpool.py…", running: true },
  ],
};

const done = (seconds: number): Trail => ({
  lines: working.lines.map((line) => ({ ...line, running: false, text: line.text.replace("Leyendo connectionpool.py…", "Leyó connectionpool.py, líneas 762–801") })),
  summary: `Respondió deepseek-v4.1-flash en ${seconds} s · cita 4 de 7 lugares`,
  thinking:
    "The user wants to know how requests hands a request to urllib3. Session.send picks the adapter by the longest prefix that matches the URL, then HTTPAdapter.send gets a pool from the PoolManager and calls urlopen with method, url, body and headers. urlopen takes a connection from the pool and _make_request writes the request to it.",
});

const THREADS: Record<string, string[]> = { requests: ["requests-urllib3", "requests-timed", "requests-retries"] };

const refsFor = async (name: string) => {
  const refs = (await import("../../fixtures/refs.json")).default as Record<string, unknown[]>;
  return refs[name] ?? [];
};

function missing(name: string) {
  const note = document.createElement("p");
  note.style.padding = "24px";
  note.textContent = `No fixture "${name}". Try: ${Object.keys(files).map((f) => f.replace(/^.*\/|\.openui$/g, "")).join(", ")}`;
  document.body.append(note);
}

export async function runFixture(params: URLSearchParams) {
  const theme = params.get("theme");
  if (theme === "dark" || theme === "light") applyTheme({ theme });
  // The page sits on the native sheet; paint it, so a screenshot measures the real contrast.
  document.body.style.background = "var(--g-sheet)";
  if (params.get("still") === "1") forceStill(true);
  const thread = params.get("thread");
  if (thread) {
    const names = THREADS[thread] ?? [];
    api.reset();
    api.refs(await refsFor(names[0] ?? ""));
    const turns: SavedTurn[] = [];
    for (const [i, name] of names.entries()) {
      const load = files[`../../fixtures/${name}.openui`];
      if (load) turns.push({ id: `t${i + 1}`, question: QUESTIONS[name] ?? "", program: await load(), trail: done(23 + i * 9) });
    }
    api.load(turns);
    document.documentElement.dataset.ready = "1";
    return;
  }
  const name = params.get("f") ?? "";
  const load = files[`../../fixtures/${name}.openui`];
  if (!load) return missing(name);
  const text = await load();
  api.reset();
  api.refs(await refsFor(name));
  api.turn("t1", QUESTIONS[name] ?? "");
  api.trail("t1", working);
  if (params.get("live") === "1") {
    document.documentElement.dataset.ready = "1";
    return;
  }
  const instant = params.get("still") === "1" || params.get("instant") === "1";
  api.trail("t1", { ...working, summary: "Dibujando la respuesta… · 7 lugares · leyó 2 archivos · 14 s" });
  if (instant) api.append(text);
  else {
    const size = Number(params.get("chunk") ?? 18);
    for (let at = 0; at < text.length; at += size) {
      api.append(text.slice(at, at + size));
      await sleep(28);
    }
  }
  api.done();
  api.trail("t1", done(23));
  if (params.get("repair") === "1") {
    const fix = files[`../../fixtures/${name}.repair.openui`];
    if (fix) {
      await sleep(instant ? 0 : 600);
      api.replace(await fix());
    }
  }
  const select = params.get("select");
  if (select) api.select(select);
  document.documentElement.dataset.ready = "1";
}
