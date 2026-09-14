export type BossTemplate = {
  id: string;
  period: "daily" | "weekly";
  name: string;
  blurb: string;
  maxHp: number;
  color: number;
};

export const DAILY_BOSS: BossTemplate = {
  id: "null_pointer_phantom",
  period: "daily",
  name: "Null Pointer Phantom",
  blurb: "It dereferences everyone. Daily reset.",
  maxHp: 320,
  color: 0x66ff99,
};

export const WEEKLY_BOSS: BossTemplate = {
  id: "great_merge_conflict",
  period: "weekly",
  name: "The Great Merge Conflict",
  blurb: "HEAD and origin/main cannot both be right. Weekly reset.",
  maxHp: 900,
  color: 0xff3366,
};

export const BOSSES = [DAILY_BOSS, WEEKLY_BOSS];

export function bossById(id: string): BossTemplate | undefined {
  return BOSSES.find((b) => b.id === id);
}
