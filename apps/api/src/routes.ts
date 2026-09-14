import { Router } from "express";
import {
  ALL_QUESTS,
  BOSSES,
  DAILY_QUESTS,
  SHOP_ITEMS,
  STAT_NAMES,
  WEEKLY_QUESTS,
  isStatName,
  utcDayKey,
  utcWeekKey,
} from "@commitquest/shared";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { requireAuth, requireInternal, signToken, type AuthedRequest } from "./auth.js";
import {
  allocateStat,
  applyDeath,
  buyItem,
  claimQuest,
  createCharacter,
  grantXp,
  periodKeys,
  recordBossDamage,
  recordCommit,
  recordDuelResult,
  serializeCharacter,
} from "./services/progression.js";
import {
  estimateFilesFromPush,
  exchangeGithubCode,
  fetchCommitDiff,
  fetchGithubUser,
  verifyGithubSignature,
  type PushPayload,
} from "./github.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, name: "commitquest-api", authMock: env.authMock });
});

router.get("/auth/config", (_req, res) => {
  res.json({
    authMock: env.authMock,
    githubEnabled: Boolean(env.githubClientId && env.githubClientSecret),
  });
});

router.get("/auth/github", (_req, res) => {
  if (!env.githubClientId) {
    res.status(400).json({ error: "GITHUB_CLIENT_ID is not configured" });
    return;
  }
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.githubClientId);
  url.searchParams.set("redirect_uri", env.githubCallbackUrl);
  url.searchParams.set("scope", "read:user user:email");
  res.redirect(url.toString());
});

router.get("/auth/github/callback", async (req, res) => {
  try {
    const code = String(req.query.code ?? "");
    const accessToken = await exchangeGithubCode(code);
    const gh = await fetchGithubUser(accessToken);
    const user = await prisma.user.upsert({
      where: { githubId: String(gh.id) },
      update: { login: gh.login, email: gh.email, avatarUrl: gh.avatar_url, accessToken },
      create: {
        githubId: String(gh.id),
        login: gh.login,
        email: gh.email,
        avatarUrl: gh.avatar_url,
        accessToken,
      },
      include: { character: true },
    });
    let character = user.character;
    if (!character) character = await createCharacter(user.id, gh.login);
    const token = signToken({ sub: user.id, login: user.login, characterId: character.id });
    res.cookie("cq_token", token, { httpOnly: false, sameSite: "lax" });
    res.redirect(`${env.webOrigin}/?token=${encodeURIComponent(token)}`);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "OAuth failed" });
  }
});

router.post("/auth/mock", async (req, res) => {
  if (!env.authMock) {
    res.status(403).json({ error: "AUTH_MOCK is disabled" });
    return;
  }
  const login = String(req.body?.login ?? "octocat").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "octocat";
  const user = await prisma.user.upsert({
    where: { githubId: `mock:${login}` },
    update: { login },
    create: { githubId: `mock:${login}`, login, avatarUrl: `https://github.com/${login}.png` },
    include: { character: true },
  });
  const character = user.character ?? (await createCharacter(user.id, login));
  const token = signToken({ sub: user.id, login: user.login, characterId: character.id });
  res.json({ token, user: { id: user.id, login: user.login }, characterId: character.id });
});

router.get("/me", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    include: { character: { include: { weapons: true } } },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    user: { id: user.id, login: user.login, avatarUrl: user.avatarUrl },
    character: user.character ? serializeCharacter(user.character) : null,
    keys: periodKeys(),
  });
});

router.post("/character", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const existing = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (existing) {
    res.status(409).json({ error: "Character already exists" });
    return;
  }
  const displayName = String(req.body?.displayName ?? auth.login).slice(0, 24);
  const color = String(req.body?.color ?? "#33ff88");
  const character = await createCharacter(auth.sub, displayName, color);
  res.json({ character: serializeCharacter(character) });
});

router.patch("/character", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  const data: { displayName?: string; color?: string; focusSession?: boolean } = {};
  if (typeof req.body?.displayName === "string") data.displayName = req.body.displayName.slice(0, 24);
  if (typeof req.body?.color === "string") data.color = req.body.color;
  if (typeof req.body?.focusSession === "boolean") data.focusSession = req.body.focusSession;
  const updated = await prisma.character.update({
    where: { id: character.id },
    data,
    include: { weapons: true, user: true },
  });
  res.json({ character: serializeCharacter(updated) });
});

router.post("/character/stats", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  const stat = String(req.body?.stat ?? "");
  if (!isStatName(stat)) {
    res.status(400).json({ error: `stat must be one of ${STAT_NAMES.join(", ")}` });
    return;
  }
  try {
    const updated = await allocateStat(character.id, stat, Number(req.body?.amount ?? 1));
    res.json({ character: serializeCharacter(updated) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Allocate failed" });
  }
});

router.post("/commits/simulate", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  const result = await recordCommit(character.id, {
    additions: Number(req.body?.additions ?? 0),
    deletions: Number(req.body?.deletions ?? 0),
    files: req.body?.files,
    language: req.body?.language,
    repo: req.body?.repo,
    sha: req.body?.sha,
    source: "simulate",
  });
  res.json(result);
});

router.post("/webhooks/github", async (req, res) => {
  const raw = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  if (!verifyGithubSignature(raw, req.header("x-hub-signature-256"))) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }
  const event = req.header("x-github-event");
  if (event !== "push") {
    res.json({ ignored: event });
    return;
  }
  const payload = req.body as PushPayload;
  const repo = payload.repository?.full_name;
  const awarded: unknown[] = [];
  for (const commit of payload.commits ?? []) {
    const login = commit.author?.username ?? payload.pusher?.name;
    if (!login) continue;
    const user = await prisma.user.findFirst({
      where: { login, character: { isNot: null } },
      include: { character: true },
    });
    if (!user?.character) continue;
    const files =
      (repo ? await fetchCommitDiff(repo, commit.id) : null) ?? estimateFilesFromPush(commit);
    awarded.push(
      await recordCommit(user.character.id, {
        files,
        repo,
        sha: commit.id,
        source: "webhook",
      }),
    );
  }
  res.json({ ok: true, awarded: awarded.length });
});

router.get("/quests", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  const keys = periodKeys();
  const rows = await prisma.questProgress.findMany({
    where: { characterId: character.id, periodKey: { in: [keys.daily, keys.weekly] } },
  });
  const decorate = (templates: typeof DAILY_QUESTS) =>
    templates.map((template) => {
      const row = rows.find((r) => r.templateId === template.id);
      return {
        ...template,
        progress: row?.progress ?? 0,
        completed: row?.completed ?? false,
        claimed: row?.claimed ?? false,
      };
    });
  res.json({ daily: decorate(DAILY_QUESTS), weekly: decorate(WEEKLY_QUESTS), keys });
});

router.post("/quests/:id/claim", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  try {
    res.json(await claimQuest(character.id, req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Claim failed" });
  }
});

router.get("/shop", (_req, res) => {
  res.json({ items: SHOP_ITEMS, currency: "Bits" });
});

router.post("/shop/buy", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  try {
    res.json(await buyItem(character.id, String(req.body?.itemId ?? "")));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Purchase failed" });
  }
});

router.get("/leaderboard", async (req, res) => {
  const sort = String(req.query.sort ?? "totalXp");
  const allowed = ["totalXp", "level", "wins", "kills", "highestDamage", "commitStreak"] as const;
  const field = allowed.includes(sort as (typeof allowed)[number]) ? sort : "totalXp";
  const org = typeof req.query.org === "string" ? req.query.org : undefined;
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;

  const where = org
    ? { boards: { some: { org, ...(repo ? { repo } : {}) } } }
    : {};

  const rows = await prisma.character.findMany({
    where,
    orderBy: { [field]: "desc" },
    take: 25,
    include: { user: true },
  });
  res.json({
    sort: field,
    board: org ? { org, repo } : null,
    entries: rows.map((c, i) => ({
      rank: i + 1,
      id: c.id,
      displayName: c.displayName,
      login: c.user.login,
      level: c.level,
      totalXp: c.totalXp,
      wins: c.wins,
      losses: c.losses,
      kills: c.kills,
      deaths: c.deaths,
      highestDamage: c.highestDamage,
      commitStreak: c.commitStreak,
    })),
  });
});

router.get("/profile/:id", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: { weapons: true, user: true, boards: true },
  });
  if (!character) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    profile: {
      ...serializeCharacter(character),
      login: character.user.login,
      avatarUrl: character.user.avatarUrl,
      boards: character.boards,
    },
  });
});

router.get("/matches", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  const matches = await prisma.match.findMany({
    where: { participants: { some: { characterId: character.id } } },
    include: { participants: true },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  res.json({ matches });
});

router.post("/boards", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const character = await prisma.character.findUnique({ where: { userId: auth.sub } });
  if (!character) {
    res.status(404).json({ error: "No character" });
    return;
  }
  const org = String(req.body?.org ?? "").trim();
  const repo = req.body?.repo ? String(req.body.repo).trim() : "";
  if (!org) {
    res.status(400).json({ error: "org is required" });
    return;
  }
  const board = await prisma.boardOptIn.upsert({
    where: { characterId_org_repo: { characterId: character.id, org, repo } },
    update: {},
    create: { characterId: character.id, org, repo },
  });
  res.json({ board });
});

router.get("/bosses", (_req, res) => {
  const keys = periodKeys();
  res.json({
    bosses: BOSSES.map((b) => ({ ...b, periodKey: b.period === "daily" ? keys.daily : keys.weekly })),
    keys,
  });
});

router.get("/catalog", (_req, res) => {
  res.json({
    stats: STAT_NAMES,
    quests: ALL_QUESTS,
    shop: SHOP_ITEMS,
    bosses: BOSSES,
    periods: { daily: utcDayKey(), weekly: utcWeekKey() },
  });
});

router.post("/internal/duel-result", requireInternal, async (req, res) => {
  const match = await recordDuelResult(req.body);
  res.json({ match });
});

router.post("/internal/boss-hit", requireInternal, async (req, res) => {
  const result = await recordBossDamage(
    String(req.body.characterId),
    String(req.body.bossId),
    Number(req.body.damage ?? 0),
    Boolean(req.body.killed),
  );
  res.json(result);
});

router.post("/internal/talk-duck", requireInternal, async (req, res) => {
  const { bumpQuest } = await import("./services/progression.js");
  await bumpQuest(String(req.body.characterId), "talk_duck", 1);
  res.json({ ok: true });
});

router.get("/internal/character/:id", requireInternal, async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: { weapons: true, user: true },
  });
  if (!character) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ character: serializeCharacter(character) });
});

router.post("/internal/death", requireInternal, async (req, res) => {
  res.json(await applyDeath(String(req.body.characterId)));
});

router.post("/internal/grant-xp", requireInternal, async (req, res) => {
  res.json(await grantXp(String(req.body.characterId), Number(req.body.amount ?? 0), Number(req.body.bits ?? 0)));
});
