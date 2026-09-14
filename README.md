# CommitQuest

A 2D browser MMO for developers. You walk a shared Matrix-green overworld, duel with WASD + hotkeys, and gain XP from real GitHub line diffs.

This repo is a playable MVP: mock or GitHub login, character + ten stats (no classes), overworld combat, simulate-commit XP, daily/weekly quests, level curve with a random weapon every 10 levels, solo duel vs a bot, death XP penalty, match history, Bits shop, daily + weekly bosses, and a HUD.

## Stack

| Piece | Location |
| --- | --- |
| Phaser 3 + TypeScript + Vite | `apps/web` |
| Colyseus world + duel rooms | `apps/server` |
| Express API + GitHub OAuth + webhooks | `apps/api` |
| Postgres + Prisma | `apps/api/prisma` |
| Shared types + combat/XP math | `packages/shared` |
| Docker Compose for Postgres | `docker-compose.yml` |

There is no Unity/Unreal project. The game canvas is Vite + Phaser; login is a thin HTML page on top of it.

## Rules (implemented)

1. **No classes.** Everyone is the same archetype. You only allocate the ten stats.
2. Ten stats start at **0**: STR, AGI, VIT, INT, WIS, LUK, DEF, SPD, CRIT, FOCUS.
3. **+1 allocable stat point per level.**
4. **Commit XP** = `max(0, lines added − lines removed)` after dropping `node_modules` / `vendor` / lockfile / `dist` noise. GitHub webhook + `POST /api/commits/simulate`.
5. Daily and weekly quests (5 templates each, more than the 3-minimum).
6. **Every 10 levels** you receive a random weapon (random stats + 1–2 effects).
7. **Daily boss** (Null Pointer Phantom) and **weekly boss** (The Great Merge Conflict).
8. Matrix-style generated map + cartoon placeholder sprites (no third-party art).
9. Kills / deaths / highest damage / wins / losses on the profile and leaderboard.
10. Matchmaking modes: **solo / duo / trio**. Solo MVP fills empty slots with **CompileBot**. Duo/trio wait ~8s, then fill with bots.
11. Match history (`/api/matches` and the Matches panel).
12. **Death: −5% of current XP toward the next level** (the progress bar), not lifetime/total XP. You cannot de-level. See below.
13. Duel wins grant XP. Currency is **Bits** from quests, level-ups, and duel wins. Simple shop.

### Death XP: total vs next-level

The database stores **lifetime `totalXp`**. The HUD bar is `currentXp = totalXp − XP required to have reached this level`.

Death subtracts **5% of `currentXp`** (the filled portion of the next-level bar) and never lowers `totalXp` below the floor for the current level. Lifetime total is *not* the penalty basis. Tests in `packages/shared/src/xp.test.ts` lock this down.

Level curve: **XP to go from level L → L+1 is `100 * L`**.

## Extra UX in the MVP

- Commit streak (UTC days)
- Focus Session toggle (+10% commit XP, shown on your nametag)
- Rubber Duck NPC (talk with `E`, completes a daily quest)
- Language affinity from commit languages
- Duel spectator join + emotes (`1` gg, `2` duck, `3` 404; `shipit` is a shop unlock)
- Opt-in org/repo leaderboards
- Weekly boss is merge-conflict themed

## Run locally

Needs Node 20+ and Postgres 16. Docker Compose is the intended database path; a local cluster also works.

```bash
cp .env.example .env
# AUTH_MOCK=true is the default — no GitHub app required

docker compose up -d        # Postgres on :5432
# or: use any Postgres and set DATABASE_URL

npm install
npm run db:migrate
npm run db:seed
npm run test                # XP / death / level / commit / combat math
npm run dev                 # API :3001, Colyseus :2567, Vite :5173
```

Open [http://localhost:5173](http://localhost:5173), click **Play with mock auth**, then:

1. WASD around the plaza. `Space` / click attacks the training dummy or a boss.
2. `E` at the yellow duck.
3. **Simulate commit** in the HUD (or `npm run demo` against the API).
4. Spend the level-up stat point on **C**.
5. **Q** or the Duel portal for a solo fight vs CompileBot.
6. Die or win — check match history and the XP bar (death is 5% of the *current* bar).

### Simulate / bot demo without the browser

With `npm run dev` already up:

```bash
npm run demo
```

That mocks `octocat`, applies filtered commit XP, and prints `/me`, quests, and the leaderboard.

### GitHub OAuth + webhooks

Set in `.env`:

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth app |
| `GITHUB_CALLBACK_URL` | Default `http://localhost:3001/api/auth/github/callback` |
| `GITHUB_WEBHOOK_SECRET` | HMAC for `POST /api/webhooks/github` |
| `GITHUB_TOKEN` | Optional; used to fetch real per-commit line diffs |
| `DATABASE_URL` | Postgres |
| `JWT_SECRET` | Session tokens |
| `INTERNAL_SECRET` | Colyseus → API |
| `AUTH_MOCK` | `true` for local play without OAuth |

Point a GitHub OAuth app at the callback URL and a repo webhook at `http://<host>:3001/api/webhooks/github` (push events). The handler matches `commit.author.username` to a CommitQuest login, filters noise paths, and awards XP. If GitHub does not return file stats, it estimates from added/modified/removed paths.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Space / click | Attack |
| E | Talk / interact |
| 1 2 3 | Emotes |
| C / J / K / L / M | Character, quests, shop, boards, matches |
| Q | Queue solo duel |
| Esc | Close panel / leave duel |

## Post-MVP gaps

- Real duo/trio human matchmaking (ratings, parties, ready-check) — bots currently fill the room
- Dedicated shard / interest management for a large overworld
- Persistent boss HP across Colyseus room restarts
- Full GitHub App installation flow and private-repo diff fetching per user token
- Animation sets, audio, and authored tiles (everything is generated placeholders)
- Anti-cheat / webhook replay protection beyond SHA dedupe
- Mobile controls
- Skill hotbars beyond the basic attack
- Moderation, reports, and chat
- Production deploy (TLS, hosted Postgres, process manager)

## Tests

```bash
npm test
```

Covers the level curve, death penalty basis, weapon-every-10-levels, commit line math + noise skip, Focus bonus, streak, and combat/weapon rolls.
