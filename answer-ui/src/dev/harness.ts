// Dev page: ?f=<fixture>&theme=dark|light&still=1&repair=1&select=r2&chunk=24
// Plays a fixture through the same bridge Swift uses, streaming it in chunks so progressive rendering shows.
import { api, applyTheme } from "../bridge";
import { forceStill } from "../figure/still";

const files = import.meta.glob("../../fixtures/*.openui", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runFixture(params: URLSearchParams) {
  const name = params.get("f") ?? "";
  const theme = params.get("theme");
  if (theme === "dark" || theme === "light") applyTheme({ theme });
  if (params.get("still") === "1") forceStill(true);
  const load = files[`../../fixtures/${name}.openui`];
  if (!load) {
    const note = document.createElement("p");
    note.style.padding = "24px";
    note.textContent = `No fixture "${name}". Try: ${Object.keys(files).map((f) => f.replace(/^.*\/|\.openui$/g, "")).join(", ")}`;
    document.body.append(note);
    return;
  }
  const refs = (await import("../../fixtures/refs.json")).default as Record<string, unknown[]>;
  const text = await load();
  api.reset();
  api.refs(refs[name] ?? refs[name.replace(/-.*$/, "")] ?? []);
  const instant = params.get("still") === "1" || params.get("instant") === "1";
  if (instant) api.append(text);
  else {
    const size = Number(params.get("chunk") ?? 18);
    for (let at = 0; at < text.length; at += size) {
      api.append(text.slice(at, at + size));
      await sleep(28);
    }
  }
  api.done();
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
