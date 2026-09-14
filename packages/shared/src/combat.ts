import { effectiveStats } from "./stats.js";
import type { AttackResult, Combatant, Stats } from "./types.js";

export function maxHp(combatant: Combatant): number {
  const stats = effectiveStats(combatant.stats, combatant.weapons);
  return 50 + stats.VIT * 8 + combatant.level * 5;
}

export function attackCooldownMs(stats: Stats): number {
  return Math.max(280, 640 - stats.SPD * 22);
}

export function moveSpeed(stats: Stats): number {
  return 140 + stats.AGI * 6 + stats.SPD * 3;
}

export function critChance(stats: Stats): number {
  return Math.min(0.55, 0.05 + stats.CRIT * 0.02 + stats.LUK * 0.005);
}

export function rollAttack(
  attacker: Combatant,
  defender: Combatant,
  rng: () => number = Math.random,
): AttackResult {
  const a = effectiveStats(attacker.stats, attacker.weapons);
  const d = effectiveStats(defender.stats, defender.weapons);
  const effects = (attacker.weapons ?? []).flatMap((w) => w.effects.map((e) => e.id));

  const base = 8 + a.STR * 2 + a.INT * 0.4 + attacker.level;
  const variance = Math.floor(rng() * (5 + a.LUK));
  let damage = base + variance;

  if (effects.includes("focus_fire")) {
    damage += a.FOCUS * 0.5;
  }
  if (effects.includes("async_blade") && rng() < 0.35) {
    damage += 10;
  }
  if (effects.includes("null_guard")) {
    // attacker-side flavor only; defender effect applied below
  }

  const crit = rng() < critChance(a) + (effects.includes("crit_patch") ? 0.08 : 0);
  if (crit) damage *= 1.5;

  const guarded = (defender.weapons ?? []).some((w) => w.effects.some((e) => e.id === "null_guard"));
  const defense = d.DEF * 0.55 + (guarded ? 4 : 0);
  damage = Math.max(1, Math.floor(damage - defense));

  if (effects.includes("rubber_hex") && rng() < 0.05) {
    damage = Math.max(1, Math.floor(damage * 0.5));
  }

  const lifesteal = effects.includes("lifesteal") ? Math.floor(damage * 0.1) : 0;
  const stunned = effects.includes("segfault") && rng() < 0.08;

  return {
    damage,
    crit,
    stunned,
    lifesteal,
    flavor: crit ? "CRIT" : stunned ? "SEGFAULT" : "HIT",
  };
}

export function botThink(
  bot: { x: number; y: number },
  target: { x: number; y: number } | undefined,
  range: number,
): { vx: number; vy: number; attack: boolean } {
  if (!target) return { vx: 0, vy: 0, attack: false };
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist <= range) {
    return { vx: 0, vy: 0, attack: true };
  }
  return { vx: dx / dist, vy: dy / dist, attack: false };
}
