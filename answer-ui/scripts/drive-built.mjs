// Drives the BUILT page (Resources/answer-ui, served by `vite preview`) exactly as Swift would: theme, refs,
// reset, streamed appends, done, optional replace. Reports console errors and CSP violations, saves a screenshot.
//   node scripts/drive-built.mjs --url http://localhost:5299 --fixture hermes-coupling --theme dark --out shot.png [--repair]
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]] : pairs), []));
const here = dirname(fileURLToPath(import.meta.url));
const name = args.fixture ?? "hermes-coupling";
const text = readFileSync(join(here, "../fixtures", `${name}.openui`), "utf8");
const refs = JSON.parse(readFileSync(join(here, "../fixtures/refs.json"), "utf8"))[name] ?? [];
const repair = args.repair ? readFileSync(join(here, "../fixtures", `${name}.repair.openui`), "utf8") : null;

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning" || /Content Security Policy|Refused/.test(m.text())) problems.push(m.text());
});
page.on("pageerror", (e) => problems.push(e.message));
const requests = [];
page.on("request", (r) => requests.push(r.url()));
await page.setViewport({ width: Number(args.width ?? 1200), height: 900, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: args.reduced ? "reduce" : "no-preference" }]);
await page.goto(`${args.url ?? "http://localhost:5299"}/`, { waitUntil: "networkidle0" });
const posted = await page.evaluate(
  async ({ text, refs, theme, repair }) => {
    const g = window.gafitas;
    g.theme({ theme, sheet: theme === "dark" ? "#1e1e1e" : "#ffffff", text: theme === "dark" ? "#ececec" : "#1d1d1f", amber: theme === "dark" ? "#F2A22A" : "#D97B1A" });
    g.reset();
    g.refs(refs);
    for (let at = 0; at < text.length; at += 23) {
      g.append(text.slice(at, at + 23));
      await new Promise((r) => setTimeout(r, 8));
    }
    g.done();
    await new Promise((r) => setTimeout(r, 300));
    if (repair) {
      g.replace(repair);
      await new Promise((r) => setTimeout(r, 300));
    }
    return window.__gafitasPosted;
  },
  { text, refs, theme: args.theme ?? "dark", repair },
);
await new Promise((r) => setTimeout(r, Number(args.wait ?? 600)));
if (args.out) await page.screenshot({ path: args.out, fullPage: true });
console.log(JSON.stringify({ posted, problems, offOrigin: requests.filter((u) => !u.startsWith(args.url ?? "http://localhost:5299") && !u.startsWith("data:")) }, null, 1));
await browser.close();
