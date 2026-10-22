// Which parts a machine has room for. A Part's role picks its slot; the drawing has exactly these slots.

export type MachineName = "Coupling" | "Conveyor";

export const ROLES = ["a_part", "a_port", "adapter", "key", "b_port", "b_part", "intake", "station", "reject", "output"] as const;
export type Role = (typeof ROLES)[number];

interface RoleRule {
  max: number;
  required?: boolean;
}

export const MACHINES: Record<MachineName, { order: Role[]; rules: Partial<Record<Role, RoleRule>> }> = {
  Coupling: {
    // Flow order, left to right on the drawing.
    order: ["a_part", "a_port", "key", "adapter", "b_port", "b_part"],
    rules: {
      a_part: { max: 3 },
      a_port: { max: 1, required: true },
      key: { max: 1 },
      adapter: { max: 1, required: true },
      b_port: { max: 1, required: true },
      b_part: { max: 3 },
    },
  },
  Conveyor: {
    order: ["intake", "station", "reject", "output"],
    rules: {
      intake: { max: 1 },
      station: { max: 6, required: true },
      reject: { max: 1 },
      output: { max: 1 },
    },
  },
};

export const isMachine = (name: unknown): name is MachineName => name === "Coupling" || name === "Conveyor";

/** "a_part:1", "a_port", "station:3"… */
export type SlotKey = string;
export const slotKey = (role: Role, index: number) => (MACHINES.Coupling.rules[role]?.max === 1 || MACHINES.Conveyor.rules[role]?.max === 1 ? role : `${role}:${index}`);

export interface PartLike {
  label?: string;
  role?: string;
  ref?: string;
  note?: string;
  status?: string;
}

export interface Binding {
  /** For each part (in the program's order), the slot it is drawn in, or null when it has no room. */
  slotOfPart: (SlotKey | null)[];
  /** For each slot that holds a part, the part's index. */
  partOfSlot: Map<SlotKey, number>;
  /** How many slots of each role the drawing has. */
  counts: Partial<Record<Role, number>>;
  problems: { part: number | null; message: string }[];
}

export function bind(machine: MachineName, parts: PartLike[]): Binding {
  const { rules } = MACHINES[machine];
  const used: Partial<Record<Role, number>> = {};
  const slotOfPart: (SlotKey | null)[] = [];
  const partOfSlot = new Map<SlotKey, number>();
  const problems: Binding["problems"] = [];
  parts.forEach((part, index) => {
    const role = part.role as Role;
    const rule = rules[role];
    if (!rule) {
      problems.push({ part: index, message: `role "${part.role ?? ""}" is not a ${machine} slot (use ${Object.keys(rules).join(", ")})` });
      slotOfPart.push(null);
      return;
    }
    const at = used[role] ?? 0;
    used[role] = at + 1;
    if (at >= rule.max) {
      problems.push({ part: index, message: `${machine} has room for ${rule.max === 1 ? "one" : `at most ${rule.max}`} "${role}" part${rule.max === 1 ? "" : "s"}` });
      slotOfPart.push(null);
      return;
    }
    const key = slotKey(role, at);
    slotOfPart.push(key);
    partOfSlot.set(key, index);
  });
  for (const [role, rule] of Object.entries(rules) as [Role, RoleRule][]) {
    if (rule.required && !used[role]) problems.push({ part: null, message: `${machine} needs ${/^[aeiou]/.test(role) ? "an" : "a"} "${role}" part` });
  }
  const counts: Partial<Record<Role, number>> = {};
  for (const [role, rule] of Object.entries(rules) as [Role, RoleRule][]) counts[role] = Math.min(rule.max, used[role] ?? 0);
  return { slotOfPart, partOfSlot, counts, problems };
}
