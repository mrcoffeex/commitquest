import { STAT_NAMES, type Stats } from "./types.js";

export function emptyStats(): Stats {
  return {
    STR: 0,
    AGI: 0,
    VIT: 0,
    INT: 0,
    WIS: 0,
    LUK: 0,
    DEF: 0,
    SPD: 0,
    CRIT: 0,
    FOCUS: 0,
  };
}

export function parseStats(value: unknown): Stats {
  const base = emptyStats();
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  for (const name of STAT_NAMES) {
    const n = raw[name];
    if (typeof n === "number" && Number.isFinite(n)) {
      base[name] = Math.max(0, Math.floor(n));
    }
  }
  return base;
}

export function sumStats(base: Stats, bonus: Partial<Stats>): Stats {
  const next = { ...base };
  for (const name of STAT_NAMES) {
    next[name] += bonus[name] ?? 0;
  }
  return next;
}

export function effectiveStats(base: Stats, weapons: { stats: Partial<Stats> }[] = []): Stats {
  return weapons.reduce((acc, weapon) => sumStats(acc, weapon.stats), { ...base });
}

export function isStatName(value: string): value is (typeof STAT_NAMES)[number] {
  return (STAT_NAMES as readonly string[]).includes(value);
}
