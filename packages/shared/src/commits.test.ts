import { describe, expect, it } from "vitest";
import { applyCommitStreak, commitLineXp, computeCommitXp, isNoisePath } from "./commits.js";

describe("commit XP", () => {
  it("is +1 per added line and -1 per removed line, floored at 0", () => {
    expect(commitLineXp(12, 4)).toBe(8);
    expect(commitLineXp(3, 10)).toBe(0);
    expect(commitLineXp(0, 0)).toBe(0);
  });

  it("skips node_modules / vendor / lockfile noise when files are provided", () => {
    const result = computeCommitXp({
      files: [
        { filename: "src/app.ts", additions: 20, deletions: 2 },
        { filename: "node_modules/foo/index.js", additions: 400, deletions: 0 },
        { filename: "vendor/phpunit/phpunit.php", additions: 80, deletions: 1 },
        { filename: "package-lock.json", additions: 900, deletions: 10 },
      ],
    });
    expect(result.filteredAdditions).toBe(20);
    expect(result.filteredDeletions).toBe(2);
    expect(result.xp).toBe(18);
    expect(result.skippedFiles).toHaveLength(3);
    expect(isNoisePath("apps/web/dist/bundle.js")).toBe(true);
  });

  it("applies a 10% Focus Session bonus after the floor", () => {
    const focused = computeCommitXp({ additions: 20, deletions: 5, focusSession: true });
    expect(focused.xp).toBe(16);
  });
});

describe("commit streak", () => {
  it("starts at 1 and increments on consecutive UTC days", () => {
    const first = applyCommitStreak(0, null, new Date("2026-09-14T12:00:00Z"));
    expect(first.streak).toBe(1);
    const sameDay = applyCommitStreak(first.streak, first.lastCommitDate, new Date("2026-09-14T18:00:00Z"));
    expect(sameDay.streak).toBe(1);
    const nextDay = applyCommitStreak(1, first.lastCommitDate, new Date("2026-09-15T01:00:00Z"));
    expect(nextDay.streak).toBe(2);
    const gap = applyCommitStreak(2, nextDay.lastCommitDate, new Date("2026-09-18T01:00:00Z"));
    expect(gap.streak).toBe(1);
  });
});
