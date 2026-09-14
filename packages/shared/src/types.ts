export const STAT_NAMES = [
  "STR",
  "AGI",
  "VIT",
  "INT",
  "WIS",
  "LUK",
  "DEF",
  "SPD",
  "CRIT",
  "FOCUS",
] as const;

export type StatName = (typeof STAT_NAMES)[number];

export type Stats = Record<StatName, number>;

export type MatchMode = "solo" | "duo" | "trio";

export type QuestPeriod = "daily" | "weekly";

export type WeaponEffectId =
  | "lifesteal"
  | "overclock"
  | "segfault"
  | "crit_patch"
  | "focus_fire"
  | "rubber_hex"
  | "null_guard"
  | "async_blade";

export type WeaponEffect = {
  id: WeaponEffectId;
  name: string;
  description: string;
};

export type Weapon = {
  id: string;
  name: string;
  grantedAtLevel: number;
  stats: Partial<Stats>;
  effects: WeaponEffect[];
};

export type QuestTemplate = {
  id: string;
  period: QuestPeriod;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  bitsReward: number;
  xpReward: number;
};

export type QuestMetric =
  | "commits"
  | "net_lines"
  | "duel_wins"
  | "boss_damage"
  | "talk_duck"
  | "commit_streak"
  | "languages"
  | "bits_earned"
  | "weekly_boss_kill";

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  cost: number;
  kind: "cosmetic" | "consumable" | "emote" | "stat";
};

export type DiffFile = {
  filename: string;
  additions: number;
  deletions: number;
};

export type CommitXpInput = {
  additions?: number;
  deletions?: number;
  files?: DiffFile[];
  language?: string;
  focusSession?: boolean;
};

export type CommitXpResult = {
  additions: number;
  deletions: number;
  filteredAdditions: number;
  filteredDeletions: number;
  xp: number;
  skippedFiles: string[];
};

export type LevelProgress = {
  level: number;
  /** Lifetime XP (never used as the death-penalty base). */
  totalXp: number;
  /** XP already earned toward the next level (the progress bar). */
  currentXp: number;
  /** XP required to go from this level to the next. */
  xpToNext: number;
};

export type DeathPenaltyResult = {
  totalXpBefore: number;
  totalXpAfter: number;
  currentXpBefore: number;
  currentXpAfter: number;
  penalty: number;
  level: number;
};

export type Combatant = {
  level: number;
  stats: Stats;
  weapons?: Weapon[];
};

export type AttackResult = {
  damage: number;
  crit: boolean;
  stunned: boolean;
  lifesteal: number;
  flavor: string;
};
