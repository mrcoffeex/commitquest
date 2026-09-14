import type { DeathPenaltyResult, LevelProgress } from "./types.js";

/** XP needed to advance from `level` to `level + 1`. Curve: 100 * level. */
export function xpToNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return 100 * safe;
}

/** Lifetime XP required to *reach* `level` (level 1 starts at 0). */
export function totalXpToReachLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  // sum_{i=1}^{L-1} 100*i = 50 * (L-1) * L
  return 50 * (safe - 1) * safe;
}

export function progressFromTotalXp(totalXp: number): LevelProgress {
  const safeTotal = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = safeTotal;
  // Cap is defensive; the curve stays playable well past 100.
  while (remaining >= xpToNextLevel(level) && level < 200) {
    remaining -= xpToNextLevel(level);
    level += 1;
  }
  return {
    level,
    totalXp: safeTotal,
    currentXp: remaining,
    xpToNext: xpToNextLevel(level),
  };
}

export function applyXp(totalXp: number, amount: number): LevelProgress {
  return progressFromTotalXp(Math.max(0, Math.floor(totalXp) + Math.floor(amount)));
}

/**
 * Death penalty: lose 5% of *current XP toward the next level* (the progress
 * bar), never lifetime/total XP. Level cannot drop. Floor at the XP required
 * to have reached the current level.
 */
export function applyDeathPenalty(totalXp: number): DeathPenaltyResult {
  const before = progressFromTotalXp(totalXp);
  const penalty = Math.floor(before.currentXp * 0.05);
  const totalXpAfter = Math.max(totalXpToReachLevel(before.level), before.totalXp - penalty);
  const after = progressFromTotalXp(totalXpAfter);
  return {
    totalXpBefore: before.totalXp,
    totalXpAfter: after.totalXp,
    currentXpBefore: before.currentXp,
    currentXpAfter: after.currentXp,
    penalty,
    level: before.level,
  };
}

export function bitsForLevelUp(newLevel: number): number {
  return 25 * newLevel;
}

export function duelWinRewards(mode: "solo" | "duo" | "trio"): { xp: number; bits: number } {
  const scale = mode === "trio" ? 1.4 : mode === "duo" ? 1.2 : 1;
  return { xp: Math.round(40 * scale), bits: Math.round(15 * scale) };
}

export function shouldGrantWeapon(oldLevel: number, newLevel: number): boolean {
  if (newLevel <= oldLevel) return false;
  const oldTier = Math.floor(oldLevel / 10);
  const newTier = Math.floor(newLevel / 10);
  return newTier > oldTier;
}

export function weaponTiersGained(oldLevel: number, newLevel: number): number[] {
  const tiers: number[] = [];
  const start = Math.floor(oldLevel / 10) + 1;
  const end = Math.floor(newLevel / 10);
  for (let t = start; t <= end; t += 1) {
    if (t > 0) tiers.push(t * 10);
  }
  return tiers;
}

export const DEATH_XP_RULE = {
  basis: "currentXpTowardNextLevel" as const,
  percent: 0.05,
  canDelevel: false,
  note:
    "Death subtracts 5% of the XP currently filled toward the next level. Lifetime/total XP is not the basis, and a death cannot drop a character below their current level.",
};
