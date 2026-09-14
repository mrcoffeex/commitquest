import { describe, expect, it } from "vitest";
import { botThink, maxHp, rollAttack } from "./combat.js";
import { emptyStats } from "./stats.js";
import { createRng, rollWeapon } from "./weapons.js";

describe("combat", () => {
  it("scales HP from VIT and level", () => {
    const fresh = { level: 1, stats: emptyStats() };
    expect(maxHp(fresh)).toBe(55);
    const tank = { level: 5, stats: { ...emptyStats(), VIT: 4 } };
    expect(maxHp(tank)).toBe(50 + 32 + 25);
  });

  it("always deals at least 1 and can crit", () => {
    const attacker = { level: 3, stats: { ...emptyStats(), STR: 5, CRIT: 50 } };
    const defender = { level: 1, stats: emptyStats() };
    const hit = rollAttack(attacker, defender, () => 0);
    expect(hit.damage).toBeGreaterThanOrEqual(1);
    expect(hit.crit).toBe(true);
  });

  it("bot closes distance then attacks in range", () => {
    expect(botThink({ x: 0, y: 0 }, { x: 200, y: 0 }, 56).attack).toBe(false);
    expect(botThink({ x: 0, y: 0 }, { x: 20, y: 0 }, 56).attack).toBe(true);
  });
});

describe("weapons", () => {
  it("rolls random stats plus 1–2 effects", () => {
    const weapon = rollWeapon(10, createRng(42));
    const statValues = Object.values(weapon.stats);
    expect(statValues.length).toBeGreaterThanOrEqual(2);
    expect(weapon.effects.length).toBeGreaterThanOrEqual(1);
    expect(weapon.effects.length).toBeLessThanOrEqual(2);
    expect(weapon.grantedAtLevel).toBe(10);
  });
});
