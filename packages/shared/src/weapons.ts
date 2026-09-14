import { STAT_NAMES, type Stats, type Weapon, type WeaponEffect } from "./types.js";

export const WEAPON_EFFECTS: WeaponEffect[] = [
  { id: "lifesteal", name: "Garbage Collector", description: "Heal 10% of damage dealt." },
  { id: "overclock", name: "Overclock", description: "Attack cadence feels faster." },
  { id: "segfault", name: "Segfault", description: "8% chance to stun the target." },
  { id: "crit_patch", name: "Hotfix", description: "+8% critical chance." },
  { id: "focus_fire", name: "Focus Fire", description: "Deal bonus damage from FOCUS." },
  { id: "rubber_hex", name: "Rubber Hex", description: "The duck watches. Rare damage swing." },
  { id: "null_guard", name: "Null Guard", description: "Ignore a bit of incoming damage." },
  { id: "async_blade", name: "Async Blade", description: "Sometimes an extra +10 damage lands." },
];

const PREFIXES = ["Null", "Async", "Kernel", "Pixel", "Rubber", "Git", "Hash", "Lambda", "Binary"];
const NOUNS = ["Blade", "Pointer", "Keyboard", "Wand", "Axe", "Lance", "Dongle", "Cursor", "Rebase"];

export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function rollWeapon(level: number, rng: () => number = Math.random): Omit<Weapon, "id"> {
  const name = `${pick(PREFIXES, rng)} ${pick(NOUNS, rng)}`;
  const statCount = 2 + Math.floor(rng() * 3);
  const stats: Partial<Stats> = {};
  const pool = [...STAT_NAMES];
  for (let i = 0; i < statCount && pool.length > 0; i += 1) {
    const idx = Math.floor(rng() * pool.length);
    const stat = pool.splice(idx, 1)[0];
    if (!stat) continue;
    stats[stat] = 1 + Math.floor(rng() * 3) + Math.floor(level / 20);
  }

  const effectCount = rng() < 0.45 ? 2 : 1;
  const effects: WeaponEffect[] = [];
  const effectPool = [...WEAPON_EFFECTS];
  for (let i = 0; i < effectCount && effectPool.length > 0; i += 1) {
    const idx = Math.floor(rng() * effectPool.length);
    const effect = effectPool.splice(idx, 1)[0];
    if (effect) effects.push(effect);
  }

  return { name, grantedAtLevel: level, stats, effects };
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]!;
}
