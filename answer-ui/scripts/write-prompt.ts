// Writes the model-facing system prompt next to the built page: Resources/answer-ui/system-prompt.txt
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { systemPrompt } from "../src/prompt";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../Resources/answer-ui/system-prompt.txt");
mkdirSync(dirname(out), { recursive: true });
const text = systemPrompt();
writeFileSync(out, text.endsWith("\n") ? text : `${text}\n`);
console.log(`wrote ${out} (${text.length} characters)`);
