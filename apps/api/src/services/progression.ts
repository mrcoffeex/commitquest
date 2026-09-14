import {
  ALL_QUESTS,
  applyCommitStreak,
  applyDeathPenalty,
  applyXp,
  bitsForLevelUp,
  computeCommitXp,
  duelWinRewards,
  emptyStats,
  inferLanguage,
  parseStats,
  questById,
  rollWeapon,
  shopItemById,
  utcDayKey,
  utcWeekKey,
  weaponTiersGained,
  type CommitXpInput,
  type QuestMetric,
  type Stats,
} from "@commitquest/shared";
import type { Character, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

export function serializeCharacter(character: Character & { weapons?: unknown[] }) {
  const progress = applyXp(character.totalXp, 0);
  return {
    ...character,
    stats: parseStats(character.stats),
    cosmetics: (character.cosmetics as string[]) ?? [],
    emotes: (character.emotes as string[]) ?? [],
    languageAffinity: (character.languageAffinity as Record<string, number>) ?? {},
    progress,
    deathRule:
      "Death subtracts 5% of current XP toward the next level (the progress bar), not lifetime total XP. You cannot de-level.",
  };
}

export async function createCharacter(userId: string, displayName: string, color = "#33ff88") {
  return prisma.character.create({
    data: {
      userId,
      displayName,
      color,
      stats: emptyStats(),
      cosmetics: [],
      emotes: ["gg", "duck", "404"],
      languageAffinity: {},
    },
    include: { weapons: true, user: true },
  });
}

export async function grantXp(characterId: string, amount: number, bits = 0) {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const before = applyXp(character.totalXp, 0);
  const after = applyXp(character.totalXp, amount);
  const levelsGained = after.level - before.level;
  const unspent = character.unspentStatPoints + levelsGained;
  let extraBits = bits;
  for (let level = before.level + 1; level <= after.level; level += 1) {
    extraBits += bitsForLevelUp(level);
  }

  const tiers = weaponTiersGained(before.level, after.level);
  const weapons = tiers.map((lvl) => {
    const rolled = rollWeapon(lvl);
    return {
      characterId,
      name: rolled.name,
      grantedAtLevel: rolled.grantedAtLevel,
      stats: rolled.stats as Prisma.InputJsonValue,
      effects: rolled.effects as Prisma.InputJsonValue,
    };
  });

  const updated = await prisma.character.update({
    where: { id: characterId },
    data: {
      totalXp: after.totalXp,
      level: after.level,
      unspentStatPoints: unspent,
      bits: character.bits + extraBits,
    },
    include: { weapons: true, user: true },
  });

  if (weapons.length) {
    await prisma.weapon.createMany({ data: weapons });
  }
  if (extraBits > 0) {
    await bumpQuest(characterId, "bits_earned", extraBits);
  }

  return {
    character: serializeCharacter(
      await prisma.character.findUniqueOrThrow({
        where: { id: characterId },
        include: { weapons: true, user: true },
      }),
    ),
    levelsGained,
    weaponsGranted: weapons.length,
    bitsGained: extraBits,
    previous: before,
    progress: after,
  };
}

export async function applyDeath(characterId: string) {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const result = applyDeathPenalty(character.totalXp);
  const updated = await prisma.character.update({
    where: { id: characterId },
    data: {
      totalXp: result.totalXpAfter,
      deaths: { increment: 1 },
    },
    include: { weapons: true, user: true },
  });
  return { character: serializeCharacter(updated), death: result };
}

export async function allocateStat(characterId: string, stat: keyof Stats, amount = 1) {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  if (character.unspentStatPoints < amount) {
    throw new Error("No unspent stat points");
  }
  const stats = parseStats(character.stats);
  stats[stat] += amount;
  return prisma.character.update({
    where: { id: characterId },
    data: {
      stats,
      unspentStatPoints: character.unspentStatPoints - amount,
    },
    include: { weapons: true, user: true },
  });
}

export async function recordCommit(characterId: string, input: CommitXpInput & { sha?: string; repo?: string; source: string }) {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const computed = computeCommitXp({ ...input, focusSession: character.focusSession });
  const sha = input.sha ?? `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = await prisma.commitEvent.findUnique({
    where: { characterId_sha: { characterId, sha } },
  });
  if (existing) {
    return { duplicate: true, commit: existing, character: serializeCharacter(character) };
  }

  const language = inferLanguage(input.files ?? [], input.language);
  const affinity = { ...((character.languageAffinity as Record<string, number>) ?? {}) };
  if (language) affinity[language] = (affinity[language] ?? 0) + 1;

  const streak = applyCommitStreak(character.commitStreak, character.lastCommitDate);

  await prisma.commitEvent.create({
    data: {
      characterId,
      sha,
      repo: input.repo,
      additions: computed.additions,
      deletions: computed.deletions,
      filteredAdditions: computed.filteredAdditions,
      filteredDeletions: computed.filteredDeletions,
      xpAwarded: computed.xp,
      language,
      source: input.source,
    },
  });

  await prisma.character.update({
    where: { id: characterId },
    data: {
      languageAffinity: affinity,
      commitStreak: streak.streak,
      lastCommitDate: streak.lastCommitDate,
    },
  });

  const grant = await grantXp(characterId, computed.xp);
  await bumpQuest(characterId, "commits", 1);
  if (computed.xp > 0) await bumpQuest(characterId, "net_lines", computed.xp);
  await bumpQuest(characterId, "commit_streak", streak.streak, true);
  if (language) await bumpQuest(characterId, "languages", 1, false, language);

  return { duplicate: false, computed, language, streak: streak.streak, ...grant };
}

export async function bumpQuest(
  characterId: string,
  metric: QuestMetric,
  amount: number,
  setAbsolute = false,
  uniqueKey?: string,
) {
  const now = new Date();
  const matching = ALL_QUESTS.filter((q) => q.metric === metric);
  for (const template of matching) {
    const periodKey = template.period === "daily" ? utcDayKey(now) : utcWeekKey(now);
    const existing = await prisma.questProgress.findUnique({
      where: { characterId_templateId_periodKey: { characterId, templateId: template.id, periodKey } },
    });
    let progress = existing?.progress ?? 0;
    if (template.metric === "languages" && uniqueKey) {
      const marker = `lang:${uniqueKey}`;
      const seen = await prisma.questProgress.findFirst({
        where: { characterId, templateId: `${template.id}:${marker}`, periodKey },
      });
      if (seen) continue;
      await prisma.questProgress.create({
        data: {
          characterId,
          templateId: `${template.id}:${marker}`,
          period: template.period,
          periodKey,
          progress: 1,
          completed: true,
          claimed: true,
        },
      });
      progress += 1;
    } else if (setAbsolute) {
      progress = Math.max(progress, amount);
    } else {
      progress += amount;
    }
    const completed = progress >= template.target;
    await prisma.questProgress.upsert({
      where: { characterId_templateId_periodKey: { characterId, templateId: template.id, periodKey } },
      update: { progress, completed: completed || existing?.completed || false },
      create: {
        characterId,
        templateId: template.id,
        period: template.period,
        periodKey,
        progress,
        completed,
      },
    });
  }
}

export async function claimQuest(characterId: string, templateId: string) {
  const template = questById(templateId);
  if (!template) throw new Error("Unknown quest");
  const now = new Date();
  const periodKey = template.period === "daily" ? utcDayKey(now) : utcWeekKey(now);
  const row = await prisma.questProgress.findUnique({
    where: { characterId_templateId_periodKey: { characterId, templateId, periodKey } },
  });
  if (!row?.completed) throw new Error("Quest is not complete");
  if (row.claimed) throw new Error("Already claimed");
  await prisma.questProgress.update({
    where: { id: row.id },
    data: { claimed: true },
  });
  const grant = await grantXp(characterId, template.xpReward, template.bitsReward);
  return { template, ...grant };
}

export async function buyItem(characterId: string, itemId: string) {
  const item = shopItemById(itemId);
  if (!item) throw new Error("Unknown item");
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  if (character.bits < item.cost) throw new Error("Not enough Bits");

  const cosmetics = [...((character.cosmetics as string[]) ?? [])];
  const emotes = [...((character.emotes as string[]) ?? [])];

  if (item.kind === "cosmetic") {
    if (cosmetics.includes(item.id)) throw new Error("Already owned");
    cosmetics.push(item.id);
  }
  if (item.kind === "emote") {
    const emote = item.id.replace("emote_", "");
    if (emotes.includes(emote)) throw new Error("Already owned");
    emotes.push(emote);
  }

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: {
        bits: character.bits - item.cost,
        cosmetics,
        emotes,
        unspentStatPoints: item.kind === "stat" ? character.unspentStatPoints + 1 : character.unspentStatPoints,
      },
    }),
    prisma.shopPurchase.create({ data: { characterId, itemId: item.id } }),
  ]);

  if (item.kind === "consumable" && item.id === "xp_tonic") {
    return grantXp(characterId, 50);
  }

  return {
    character: serializeCharacter(
      await prisma.character.findUniqueOrThrow({
        where: { id: characterId },
        include: { weapons: true, user: true },
      }),
    ),
  };
}

export async function recordDuelResult(input: {
  mode: "solo" | "duo" | "trio";
  winnerSide: number;
  participants: {
    characterId?: string;
    displayName: string;
    side: number;
    isBot: boolean;
    damageDealt: number;
  }[];
}) {
  const rewards = duelWinRewards(input.mode);
  const match = await prisma.match.create({
    data: {
      mode: input.mode,
      winnerSide: input.winnerSide,
      endedAt: new Date(),
      participants: {
        create: await Promise.all(
          input.participants.map(async (p) => {
            const won = p.side === input.winnerSide;
            let xpDelta = 0;
            let bitsDelta = 0;
            if (p.characterId && !p.isBot) {
              if (won) {
                const grant = await grantXp(p.characterId, rewards.xp, rewards.bits);
                xpDelta = rewards.xp;
                bitsDelta = grant.bitsGained;
                await prisma.character.update({
                  where: { id: p.characterId },
                  data: {
                    wins: { increment: 1 },
                    kills: { increment: 1 },
                    highestDamage: {
                      set: Math.max(
                        (await prisma.character.findUniqueOrThrow({ where: { id: p.characterId } })).highestDamage,
                        p.damageDealt,
                      ),
                    },
                  },
                });
                await bumpQuest(p.characterId, "duel_wins", 1);
              } else {
                const death = await applyDeath(p.characterId);
                xpDelta = -death.death.penalty;
                await prisma.character.update({
                  where: { id: p.characterId },
                  data: { losses: { increment: 1 } },
                });
              }
            }
            return {
              characterId: p.characterId,
              displayName: p.displayName,
              side: p.side,
              isBot: p.isBot,
              damageDealt: p.damageDealt,
              won,
              xpDelta,
              bitsDelta,
            };
          }),
        ),
      },
    },
    include: { participants: true },
  });
  return match;
}

export async function recordBossDamage(characterId: string, bossId: string, damage: number, killed: boolean) {
  const periodKey = bossId.includes("merge") ? utcWeekKey() : utcDayKey();
  const row = await prisma.bossContribution.upsert({
    where: { characterId_bossId_periodKey: { characterId, bossId, periodKey } },
    update: { damage: { increment: damage } },
    create: { characterId, bossId, periodKey, damage },
  });
  await bumpQuest(characterId, "boss_damage", damage);
  if (killed) {
    if (bossId.includes("merge")) {
      await bumpQuest(characterId, "weekly_boss_kill", 1);
    }
    if (!row.rewarded) {
      await prisma.bossContribution.update({ where: { id: row.id }, data: { rewarded: true } });
      const xp = bossId.includes("merge") ? 120 : 60;
      const bits = bossId.includes("merge") ? 80 : 30;
      return grantXp(characterId, xp, bits);
    }
  }
  await prisma.character.update({
    where: { id: characterId },
    data: {
      highestDamage: {
        set: Math.max(
          (await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).highestDamage,
          damage,
        ),
      },
    },
  });
  return { contribution: row };
}

export function periodKeys() {
  const now = new Date();
  return { daily: utcDayKey(now), weekly: utcWeekKey(now) };
}
