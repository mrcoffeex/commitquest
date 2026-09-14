import type { QuestTemplate } from "./types.js";

export const DAILY_QUESTS: QuestTemplate[] = [
  {
    id: "daily_commits",
    period: "daily",
    title: "Ship Three Times",
    description: "Land 3 commits today (webhook or simulate).",
    metric: "commits",
    target: 3,
    bitsReward: 30,
    xpReward: 40,
  },
  {
    id: "daily_lines",
    period: "daily",
    title: "Net Positive",
    description: "Add 50 net lines after noise filtering.",
    metric: "net_lines",
    target: 50,
    bitsReward: 25,
    xpReward: 35,
  },
  {
    id: "daily_duel",
    period: "daily",
    title: "Honor Duel",
    description: "Win 1 duel (bot counts).",
    metric: "duel_wins",
    target: 1,
    bitsReward: 20,
    xpReward: 30,
  },
  {
    id: "daily_boss",
    period: "daily",
    title: "Hunt the Null Pointer",
    description: "Deal 120 damage to the daily boss.",
    metric: "boss_damage",
    target: 120,
    bitsReward: 35,
    xpReward: 50,
  },
  {
    id: "daily_duck",
    period: "daily",
    title: "Explain It to the Duck",
    description: "Talk to the Rubber Duck NPC in the overworld.",
    metric: "talk_duck",
    target: 1,
    bitsReward: 10,
    xpReward: 15,
  },
];

export const WEEKLY_QUESTS: QuestTemplate[] = [
  {
    id: "weekly_streak",
    period: "weekly",
    title: "Green Square Week",
    description: "Reach a 5-day commit streak.",
    metric: "commit_streak",
    target: 5,
    bitsReward: 80,
    xpReward: 120,
  },
  {
    id: "weekly_duels",
    period: "weekly",
    title: "Arena Circuit",
    description: "Win 3 duels this week.",
    metric: "duel_wins",
    target: 3,
    bitsReward: 70,
    xpReward: 100,
  },
  {
    id: "weekly_boss",
    period: "weekly",
    title: "Resolve the Merge Conflict",
    description: "Defeat the weekly Merge Conflict boss.",
    metric: "weekly_boss_kill",
    target: 1,
    bitsReward: 120,
    xpReward: 180,
  },
  {
    id: "weekly_bits",
    period: "weekly",
    title: "Bit Miner",
    description: "Earn 200 Bits from any source this week.",
    metric: "bits_earned",
    target: 200,
    bitsReward: 50,
    xpReward: 60,
  },
  {
    id: "weekly_langs",
    period: "weekly",
    title: "Polyglot Push",
    description: "Commit in 3 different languages.",
    metric: "languages",
    target: 3,
    bitsReward: 60,
    xpReward: 80,
  },
];

export const ALL_QUESTS = [...DAILY_QUESTS, ...WEEKLY_QUESTS];

export function questById(id: string): QuestTemplate | undefined {
  return ALL_QUESTS.find((q) => q.id === id);
}
