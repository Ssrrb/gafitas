/**
 * Gafitas for Pi: a `dig` tool that finds the code in your projects that already does something, through Gafitas's
 * code index on this Mac (EmbeddingGemma 2, the `digup` helper), and a guard.
 *
 * Pi explains, it doesn't change anything: the Gafitas app starts it with only `dig` and the read-only tools, and this
 * keeps those inside the code folders you chose (no hidden folders, no keys), so what can be sent to the model is what
 * Gafitas says it sends.
 *
 * Environment: GAFITAS_DIGUP (the `digup` helper), GAFITAS_INDEX (the index folder), GAFITAS_ROOTS (the code
 * folders, ":"-separated), DIGUP_MODELS (the model folder). Without them it uses the installed app's defaults.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const support = `${homedir()}/Library/Application Support/Gafitas`;
const digup = process.env.GAFITAS_DIGUP ?? "/Applications/Gafitas.app/Contents/Helpers/digup";
const index = process.env.GAFITAS_INDEX ?? `${support}/index.noindex`;
const roots = (process.env.GAFITAS_ROOTS ?? "").split(":").filter(Boolean).map(real);

/** At most this many places a dig, and this many lines of each: enough to reason about, small enough to send. */
const placeLimit = 8;
const lineLimit = 40;

interface Ref {
	id: string;
	repo: string;
	path: string;
	file: string;
	first: number;
	last: number;
	focus: number;
	summary: string;
	text: string;
	z: number | null;
}

function real(path: string): string {
	const full = resolve(path.replace(/^~(?=$|\/)/, homedir()));
	try {
		return realpathSync(full);
	} catch {
		return full;
	}
}

/** Inside a code folder, not in a hidden folder, and not a key or a secret (as Gafitas's own rules leave them out). */
function allowed(path: string, cwd: string): boolean {
	const full = real(resolve(cwd, path.replace(/^~(?=$|\/)/, homedir())));
	const root = roots.find((r) => full === r || full.startsWith(r + sep));
	if (!root) return false;
	const inside = full.slice(root.length).split(sep).filter(Boolean);
	if (inside.some((part) => part.startsWith("."))) return false;
	return !/^(\.env.*|.*secret.*|.*credential.*|id_[a-z0-9]+|.*\.(pem|key|p12|pfx|keychain))$/i.test(basename(full));
}

function search(query: string): Promise<any[]> {
	return new Promise((done, fail) => {
		execFile(
			digup,
			["search", `code: ${query}`, "--json", "-n", "30", "--zgate", "1.5", "--index", index],
			{ env: process.env, maxBuffer: 16 << 20, timeout: 60_000 },
			(error, stdout) => {
				if (error) return fail(new Error(`Gafitas's code search didn't run: ${error.message}`));
				try {
					done(JSON.parse(stdout));
				} catch {
					fail(new Error("Gafitas's code search answered with something that isn't JSON"));
				}
			},
		);
	});
}

export default function (pi: ExtensionAPI) {
	let dug = 0; // refs handed out this session: d1, d2…

	pi.registerTool({
		name: "dig",
		label: "Dig up code",
		description:
			"Find the code in the user's projects that already does something, by what it does (\"retry a failed call " +
			"with backoff\") or by a name in it. Returns places as refs (d1, d2…) with their lines. Ask one thing at a " +
			"time: for a question about two projects, dig once for each side, with `project` set.",
		parameters: Type.Object({
			query: Type.String({ description: "What the code does, or a name in it" }),
			project: Type.Optional(Type.String({ description: "Only this project (a repo or code folder's name)" })),
		}),
		async execute(_id, params) {
			const hits = await search(params.query);
			const refs: Ref[] = [];
			for (const hit of hits) {
				if (refs.length >= placeLimit) break;
				const file: string = hit.path;
				const repoPath: string = hit.info?.repo ?? roots.find((r) => file.startsWith(r + sep)) ?? "";
				const repo = basename(repoPath);
				if (params.project && repo !== params.project && !file.includes(`${sep}${params.project}${sep}`)) continue;
				if (roots.length > 0 && !allowed(file, "/")) continue;
				if (!existsSync(file)) continue;
				const lines = readFileSync(file, "utf8").split(/\r?\n/);
				const first = Math.max(1, Math.round(hit.loc ?? 1));
				const last = Math.min(lines.length, Math.round(hit.loc_end ?? first), first + lineLimit - 1);
				refs.push({
					id: `d${++dug}`,
					repo,
					path: repoPath && file.startsWith(repoPath + sep) ? file.slice(repoPath.length + 1) : basename(file),
					file,
					first,
					last,
					focus: Math.round(hit.focus ?? first),
					summary: (hit.excerpt ?? "").replace(/[«»]/g, "").split("\n")[0].slice(0, 160),
					text: lines.slice(first - 1, last).join("\n"),
					z: hit.z ?? null,
				});
			}
			const text = refs.length
				? refs
						.map((r) => `${r.id}: ${r.repo}/${r.path} lines ${r.first}-${r.last} (${r.file})\n${r.text}`)
						.join("\n\n")
				: `Nothing in the projects matches "${params.query}" closely.`;
			return { content: [{ type: "text", text }], details: { refs } };
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (["read", "grep", "find", "ls"].includes(event.toolName)) {
			const path = (event.input as { path?: string }).path ?? ".";
			if (!allowed(path, ctx.cwd)) {
				return { block: true, reason: `${path} is outside the code folders Gafitas may read` };
			}
		}
		return undefined;
	});
}
