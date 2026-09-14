# CommitQuest

A 2D browser MMO for developers. You walk a shared Matrix-green overworld, duel with WASD + hotkeys, and gain XP from real GitHub line diffs.

This repo is a playable MVP: **GitHub OAuth login** (mock auth only when `AUTH_MOCK=true`), character + ten stats (no classes), overworld combat, GitHub commit XP, daily/weekly quests, level curve with a random weapon every 10 levels, solo duel vs a bot, death XP penalty, match history, Bits shop, daily + weekly bosses, and a HUD.

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
# AUTH_MOCK=false — Sign in with GitHub is the default. Create an OAuth App first
# (steps below). For a no-OAuth sandbox only, set AUTH_MOCK=true.

docker compose up -d        # Postgres on :5432
# or: use any Postgres and set DATABASE_URL

npm install
npm run db:migrate
npm run db:seed
npm run test                # XP / death / level / commit / combat / OAuth helper math
npm run dev                 # API :3001, Colyseus :2567, Vite :5173
```

Open [http://localhost:5173](http://localhost:5173), click **Sign in with GitHub**, then:

1. WASD around the plaza. `Space` / click attacks the training dummy or a boss.
2. `E` at the yellow duck.
3. **Simulate commit** in the HUD (or `npm run demo` against the API).
4. Spend the level-up stat point on **C**.
5. **Q** or the Duel portal for a solo fight vs CompileBot.
6. Die or win — check match history and the XP bar (death is 5% of the *current* bar).

### Simulate / bot demo without the browser

`npm run demo` uses mock login and the simulate-commit endpoint. Both are **dev-only** (`AUTH_MOCK=true`). With `npm run dev` already up:

```bash
# in .env
AUTH_MOCK=true
# restart the API, then:
npm run demo
```

That mocks `octocat`, applies filtered commit XP, and prints `/me`, quests, and the leaderboard. The HUD **Simulate commit** button is hidden unless mock auth is on.

## GitHub OAuth (primary login)

Players sign in with GitHub so the game can use their GitHub identity (`githubId`, `githubLogin`, name, email, avatar) and public commit activity for XP and quests.

The browser hits `GET /api/auth/github` → GitHub → `GET /api/auth/github/callback` → JWT session cookie `cq_token` (also returned as `?token=` for the Vite origin). The same JWT is sent as `Authorization: Bearer` on API calls and as the Colyseus join `token`. The authorize `state` is HMAC-signed so CSRF checks still work when Vite proxies `/api` on `:5173` and GitHub returns to `:3001`.

### 1. Create a GitHub OAuth App (local)

Kent (or anyone running locally):

1. Open [GitHub Developer settings → OAuth Apps](https://github.com/settings/developers) → **New OAuth App**.
2. **Application name:** `CommitQuest (local)` (any name is fine).
3. **Homepage URL:** `http://localhost:5173`
4. **Authorization callback URL:** `http://localhost:3001/api/auth/github/callback`
5. Register the application.
6. Copy the **Client ID**. Click **Generate a new client secret** and copy the secret once.

Do not commit the client secret. Keep it in `.env` only (`.env` is gitignored).

### 2. Set environment variables

```bash
cp .env.example .env
```

In `.env`:

```bash
AUTH_MOCK=false
GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/github/callback
WEB_ORIGIN=http://localhost:5173
JWT_SECRET=pick-a-long-random-string
```

Restart `npm run dev`. Open [http://localhost:5173](http://localhost:5173) and click **Sign in with GitHub**.

On first login the API upserts a player from the GitHub profile (`githubId`, `githubLogin`, name, email, avatar) and creates a character if needed. After that, `/api/me`, quests, shop, boards, and match history work with the session.

### 3. OAuth scopes

| Scope | Why |
| --- | --- |
| `read:user` | GitHub id, login, name, avatar |
| `user:email` | Email when it is not public on the profile (`GET /user/emails`) |

Those two are requested by default. They are enough to identify the player and to attribute **public** commit activity (webhooks on public repos, or the public Events API). No extra user scope is required for public stats.

**Private repositories** are out of scope for the default OAuth app:

- **Preferred:** a [GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps) installed on the org/repo, with contents/metadata permissions and a `push` webhook to `POST /api/webhooks/github`. Store the webhook secret in `GITHUB_WEBHOOK_SECRET`. Use an installation token (or `GITHUB_TOKEN`) when the handler needs per-commit line diffs.
- **Advanced / classic OAuth:** set `GITHUB_REQUEST_REPO_SCOPE=true` so the login prompt also asks for `repo`. That lets the stored user token read private diffs, but it is a broad user-to-server grant — prefer the App.

Optional extra scopes: `GITHUB_OAUTH_SCOPES=read:org` (space or comma separated).

### 4. Webhooks (commit XP)

Point a repo or GitHub App webhook at `http://<host>:3001/api/webhooks/github` (push events). The handler matches `commit.author.username` to `githubLogin` / `login`, filters noise paths, and awards XP. If GitHub does not return file stats, it estimates from added/modified/removed paths.

### Other env vars

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth App credentials |
| `GITHUB_CALLBACK_URL` | Must match the App callback exactly |
| `GITHUB_REQUEST_REPO_SCOPE` | `true` to also request `repo` (optional, private) |
| `GITHUB_OAUTH_SCOPES` | Extra scopes appended to the identity defaults |
| `GITHUB_WEBHOOK_SECRET` | HMAC for `POST /api/webhooks/github` |
| `GITHUB_TOKEN` | Optional; used to fetch real per-commit line diffs |
| `DATABASE_URL` | Postgres |
| `JWT_SECRET` | Session tokens (web cookie + Colyseus join) |
| `INTERNAL_SECRET` | Colyseus → API server-to-server |
| `AUTH_MOCK` | `true` only for local Dev login / `npm run demo` |

### Mock auth (local only)

Set `AUTH_MOCK=true` and restart the API. The login card shows a small **Dev login** link that reveals the mock handle form. `/api/auth/mock` and `/api/commits/simulate` return 403 when mock auth is off.

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
- Full GitHub App installation flow and private-repo diff fetching per installation token
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
