import { describe, expect, it } from "vitest";
import {
  applyDeathPenalty,
  applyXp,
  bitsForLevelUp,
  DEATH_XP_RULE,
  progressFromTotalXp,
  shouldGrantWeapon,
  totalXpToReachLevel,
  weaponTiersGained,
  xpToNextLevel,
} from "./xp.js";

describe("level curve", () => {
  it("starts at level 1 with an empty bar", () => {
    expect(progressFromTotalXp(0)).toMatchObject({
      level: 1,
      currentXp: 0,
      xpToNext: 100,
      totalXp: 0,
    });
  });

  it("uses 100 * level for the next-level gate", () => {
    expect(xpToNextLevel(1)).toBe(100);
    expect(xpToNextLevel(10)).toBe(1000);
    expect(totalXpToReachLevel(1)).toBe(0);
    expect(totalXpToReachLevel(2)).toBe(100);
    expect(totalXpToReachLevel(3)).toBe(300);
  });

  it("levels from lifetime XP without skipping the bar remainder", () => {
    expect(progressFromTotalXp(100)).toMatchObject({ level: 2, currentXp: 0 });
    expect(progressFromTotalXp(150)).toMatchObject({ level: 2, currentXp: 50, xpToNext: 200 });
    expect(applyXp(90, 20)).toMatchObject({ level: 2, currentXp: 10, totalXp: 110 });
  });

  it("grants a stat-point-sized climb: one level per threshold", () => {
    const a = progressFromTotalXp(0);
    const b = applyXp(0, xpToNextLevel(a.level));
    expect(b.level - a.level).toBe(1);
  });
});

describe("death penalty", () => {
  it("documents current-bar XP, not lifetime total", () => {
    expect(DEATH_XP_RULE.basis).toBe("currentXpTowardNextLevel");
    expect(DEATH_XP_RULE.percent).toBe(0.05);
    expect(DEATH_XP_RULE.canDelevel).toBe(false);
  });

  it("subtracts 5% of current XP toward next level", () => {
    // Level 2 starts at 100 total. 150 total => 50 current. 5% of 50 = 2.
    const result = applyDeathPenalty(150);
    expect(result.level).toBe(2);
    expect(result.currentXpBefore).toBe(50);
    expect(result.penalty).toBe(2);
    expect(result.totalXpAfter).toBe(148);
    expect(result.currentXpAfter).toBe(48);
  });

  it("never drops a character below their current level", () => {
    const atFloor = applyDeathPenalty(100);
    expect(atFloor.level).toBe(2);
    expect(atFloor.penalty).toBe(0);
    expect(atFloor.totalXpAfter).toBe(100);

    const emptyBar = applyDeathPenalty(0);
    expect(emptyBar.level).toBe(1);
    expect(emptyBar.totalXpAfter).toBe(0);
  });
});

describe("level-up weapons and bits", () => {
  it("awards a weapon every 10 levels, including multi-level jumps", () => {
    expect(shouldGrantWeapon(9, 10)).toBe(true);
    expect(shouldGrantWeapon(10, 11)).toBe(false);
    expect(shouldGrantWeapon(19, 30)).toBe(true);
    expect(weaponTiersGained(9, 30)).toEqual([10, 20, 30]);
    expect(weaponTiersGained(10, 19)).toEqual([]);
  });

  it("pays Bits on level-up from the new level", () => {
    expect(bitsForLevelUp(2)).toBe(50);
    expect(bitsForLevelUp(10)).toBe(250);
  });
});
