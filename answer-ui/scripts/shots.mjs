// Screenshots of the fixtures in headless Chrome: full pages at each width and theme, plus a 2× close-up of
// every figure card. thread:<name> draws a saved chat. Dev tool only (needs `npm run dev` or a static server on the build).
//   node scripts/shots.mjs --url http://localhost:5199 --out /path/to/shots [--fixtures a,b] [--widths 1440,390]
//        [--themes dark,light] [--query extra=1] [--no-zoom] [--steps 0,2]
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return pairs;
  }, []),
);
const url = args.url ?? "http://localhost:5199";
const out = args.out ?? "shots";
const fixtures = (args.fixtures ?? "requests-urllib3,hermes-puzzle,ingest-puzzle,hashmap-idea,puzzle-max,puzzle-min,broken-refs,thread:requests").split(",");
const widths = (args.widths ?? "1440,390").split(",").map(Number);
const themes = (args.themes ?? "dark,light").split(",");
const steps = (args.steps ?? "0").split(",").map(Number);
const zoom = !args["no-zoom"];
const extra = args.query ? `&${args.query}` : "";
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--hide-scrollbars", "--font-render-hinting=none"],
});
const problems = [];
try {
  for (const theme of themes) {
    for (const width of widths) {
      for (const fixture of fixtures) {
        const page = await browser.newPage();
        page.on("console", (m) => {
          if (m.type() === "error" || m.type() === "warning") problems.push(`${fixture} ${theme} ${width}: ${m.text()}`);
        });
        page.on("pageerror", (e) => problems.push(`${fixture} ${theme} ${width}: ${e.message}`));
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
        await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
        const target = fixture.startsWith("thread:") ? `thread=${fixture.slice(7)}` : `f=${fixture}`;
        await page.goto(`${url}/?${target}&theme=${theme}&still=1${extra}`, { waitUntil: "networkidle0" });
        await page.waitForSelector('html[data-ready="1"]', { timeout: 10000 });
        await new Promise((r) => setTimeout(r, 400));
        for (const step of steps) {
          if (step > 0) {
            await page.evaluate((n) => {
              document.querySelectorAll(".g-steps").forEach((list) => list.querySelectorAll("button")[n]?.click());
            }, step);
            await new Promise((r) => setTimeout(r, 300));
          }
          const suffix = steps.length > 1 ? `-s${step}` : "";
          await page.screenshot({ path: join(out, `${fixture.replace(":", "-")}-${theme}-${width}${suffix}.png`), fullPage: true });
          if (zoom && width === widths[0]) {
            const boxes = await page.$$eval(".g-card", (list) => list.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; }));
            for (let i = 0; i < boxes.length; i++) {
              await page.screenshot({ path: join(out, `${fixture.replace(":", "-")}-${theme}-fig${i + 1}-2x${suffix}.png`), clip: { ...boxes[i], scale: 2 } });
            }
          }
        }
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (problems.length) console.log(problems.join("\n"));
console.log("shots in", out);
