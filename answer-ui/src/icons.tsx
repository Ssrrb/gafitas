// The icons a model may name: a short list for code questions, imported one by one so the bundle carries only these.
// Plain glyphs in the muted ink, before a title, never in a square. Lucide's own kebab names work too.
import * as React from "react";
import {
  BadgeCheck,
  BookOpen,
  Braces,
  Brain,
  Bug,
  CircleSmall,
  Clock,
  Cpu,
  Database,
  FileCode,
  Gauge,
  GitBranch,
  GitMerge,
  Globe,
  Layers,
  Link,
  ListChecks,
  Lock,
  Network,
  Package,
  Plug,
  Puzzle,
  RefreshCw,
  Rocket,
  ScrollText,
  Search,
  Server,
  ShieldCheck,
  Sigma,
  Sparkles,
  Split,
  SquareFunction,
  Terminal,
  TestTube,
  Type,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  terminal: Terminal,
  server: Server,
  plug: Plug,
  database: Database,
  file: FileCode,
  braces: Braces,
  type: Type,
  package: Package,
  layers: Layers,
  puzzle: Puzzle,
  flow: Workflow,
  branch: GitBranch,
  split: Split,
  merge: GitMerge,
  link: Link,
  network: Network,
  test: TestTube,
  bug: Bug,
  shield: ShieldCheck,
  lock: Lock,
  checklist: ListChecks,
  proof: BadgeCheck,
  sigma: Sigma,
  function: SquareFunction,
  brain: Brain,
  sparkles: Sparkles,
  book: BookOpen,
  search: Search,
  wrench: Wrench,
  rocket: Rocket,
  cpu: Cpu,
  gauge: Gauge,
  clock: Clock,
  globe: Globe,
  sync: RefreshCw,
  spec: ScrollText,
};

/** Lucide's own names for the same icons ("file-code", "git-branch"…). */
const ALIASES: Record<string, string> = {
  "file-code": "file",
  workflow: "flow",
  "git-branch": "branch",
  "git-merge": "merge",
  "test-tube": "test",
  "shield-check": "shield",
  "list-checks": "checklist",
  "badge-check": "proof",
  "square-function": "function",
  "book-open": "book",
  "refresh-cw": "sync",
  "scroll-text": "spec",
};

export const ICON_NAMES = Object.keys(ICONS);

export function iconOf(name: unknown): LucideIcon {
  const key = typeof name === "string" ? name.trim().toLowerCase() : "";
  return ICONS[key] ?? ICONS[ALIASES[key] ?? ""] ?? CircleSmall;
}

export function Icon({ name, size = 16 }: { name: unknown; size?: number }) {
  const Glyph = iconOf(name);
  return <Glyph className="g-icon" size={size} strokeWidth={1.75} aria-hidden="true" />;
}
