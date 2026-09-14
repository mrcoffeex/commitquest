import { Room, type Client } from "colyseus";
import {
  DAILY_BOSS,
  LANDMARKS,
  WEEKLY_BOSS,
  WORLD,
  blocked,
  botThink,
  buildWorldGrid,
  emptyStats,
  maxHp,
  moveSpeed,
  parseStats,
  rollAttack,
  type Combatant,
} from "@commitquest/shared";
import { WorldBoss, WorldPlayer, WorldState } from "../schema/WorldState.js";
import { loadCharacter, reportBossHit, reportDeath, reportDuck } from "../api.js";
import { authenticateJoin } from "../auth.js";

type Input = { up?: boolean; down?: boolean; left?: boolean; right?: boolean };

const DUCK_LINES = [
  "Quack. Have you tried turning it off and on again?",
  "Walk me through the reproduction. Slowly.",
  "Is it a race? A null? A leftover console.log?",
  "The tests are the map. Follow the failing square.",
  "Rubber-duck debugging: 30% of bugs fix themselves out of shame.",
];

export class WorldRoom extends Room<WorldState> {
  state = new WorldState();
  grid = buildWorldGrid();
  inputs = new Map<string, Input>();
  combatants = new Map<string, Combatant>();
  attackCd = new Map<string, number>();
  dummyHp = 200;

  onCreate() {
    this.maxClients = 40;
    const daily = new WorldBoss();
    daily.id = DAILY_BOSS.id;
    daily.name = DAILY_BOSS.name;
    daily.x = LANDMARKS.daily.x;
    daily.y = LANDMARKS.daily.y;
    daily.hp = DAILY_BOSS.maxHp;
    daily.maxHp = DAILY_BOSS.maxHp;
    this.state.bosses.set(daily.id, daily);

    const weekly = new WorldBoss();
    weekly.id = WEEKLY_BOSS.id;
    weekly.name = WEEKLY_BOSS.name;
    weekly.x = LANDMARKS.weekly.x;
    weekly.y = LANDMARKS.weekly.y;
    weekly.hp = WEEKLY_BOSS.maxHp;
    weekly.maxHp = WEEKLY_BOSS.maxHp;
    this.state.bosses.set(weekly.id, weekly);

    this.onMessage("input", (client, data: Input) => {
      this.inputs.set(client.sessionId, data ?? {});
    });
    this.onMessage("attack", (client) => this.handleAttack(client));
    this.onMessage("emote", (client, data: { text?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.emote = String(data?.text ?? "gg").slice(0, 12);
      player.emoteUntil = Date.now() + 2500;
    });
    this.onMessage("talk", (client) => this.handleTalk(client));

    this.setSimulationInterval((dt) => this.tick(dt), 50);
  }

  async onAuth(_client: Client, options: { token?: string; characterId?: string }) {
    return authenticateJoin(options);
  }

  async onJoin(client: Client, options: { characterId?: string }) {
    const player = new WorldPlayer();
    player.sessionId = client.sessionId;
    const session = client.auth as { character?: { id?: string } } | undefined;
    player.characterId = String(session?.character?.id ?? options?.characterId ?? "");
    player.name = "anon";
    player.x = LANDMARKS.spawn.x;
    player.y = LANDMARKS.spawn.y;
    player.color = "#33ff88";
    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, {});
    this.combatants.set(client.sessionId, { level: 1, stats: emptyStats(), weapons: [] });

    if (player.characterId) {
      try {
        const { character } = await loadCharacter(player.characterId);
        player.name = character.displayName;
        player.color = character.color;
        player.level = character.level;
        player.focus = character.focusSession;
        const combatant = {
          level: character.level,
          stats: parseStats(character.stats),
          weapons: character.weapons as Combatant["weapons"],
        };
        this.combatants.set(client.sessionId, combatant);
        player.maxHp = maxHp(combatant);
        player.hp = player.maxHp;
      } catch (error) {
        console.warn("character load failed", error);
      }
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.combatants.delete(client.sessionId);
  }

  tick(dt: number) {
    const seconds = dt / 1000;
    for (const [id, player] of this.state.players) {
      const input = this.inputs.get(id) ?? {};
      const combatant = this.combatants.get(id);
      const speed = moveSpeed(combatant?.stats ?? emptyStats());
      let vx = 0;
      let vy = 0;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      const len = Math.hypot(vx, vy) || 1;
      const nx = player.x + (vx / len) * speed * seconds;
      const ny = player.y + (vy / len) * speed * seconds;
      if (!blocked(this.grid, nx, player.y)) player.x = clamp(nx, 16, WORLD.width - 16);
      if (!blocked(this.grid, player.x, ny)) player.y = clamp(ny, 16, WORLD.height - 16);
      if (player.emote && Date.now() > player.emoteUntil) player.emote = "";
      player.attacking = false;

      if (player.hp <= 0) {
        player.x = LANDMARKS.spawn.x;
        player.y = LANDMARKS.spawn.y;
        player.hp = player.maxHp;
        if (player.characterId) {
          reportDeath(player.characterId).catch((err) => console.warn(err));
        }
      }
    }

    this.tickBoss("null_pointer_phantom", seconds);
    this.tickBoss("great_merge_conflict", seconds);
  }

  tickBoss(id: string, seconds: number) {
    const boss = this.state.bosses.get(id);
    if (!boss?.alive) return;
    const nearest = closestPlayer(this.state, boss.x, boss.y, 90);
    if (!nearest) return;
    const think = botThink({ x: boss.x, y: boss.y }, { x: nearest.x, y: nearest.y }, 52);
    boss.x += think.vx * 40 * seconds;
    boss.y += think.vy * 40 * seconds;
    if (think.attack && Math.random() < 0.04) {
      nearest.hp = Math.max(0, nearest.hp - (id.includes("merge") ? 12 : 8));
    }
  }

  handleAttack(client: Client) {
    const player = this.state.players.get(client.sessionId);
    const combatant = this.combatants.get(client.sessionId);
    if (!player || !combatant) return;
    const now = Date.now();
    if ((this.attackCd.get(client.sessionId) ?? 0) > now) return;
    this.attackCd.set(client.sessionId, now + 420);
    player.attacking = true;

    const dummyDist = Math.hypot(player.x - LANDMARKS.dummy.x, player.y - LANDMARKS.dummy.y);
    if (dummyDist < 56) {
      const hit = rollAttack(combatant, { level: 1, stats: emptyStats() });
      this.dummyHp = Math.max(0, this.dummyHp - hit.damage);
      if (this.dummyHp === 0) this.dummyHp = 200;
      this.broadcast("fx", { kind: "hit", x: LANDMARKS.dummy.x, y: LANDMARKS.dummy.y, text: `${hit.damage}` });
      return;
    }

    for (const boss of this.state.bosses.values()) {
      if (!boss.alive) continue;
      if (Math.hypot(player.x - boss.x, player.y - boss.y) > 64) continue;
      const hit = rollAttack(combatant, { level: 8, stats: emptyStats() });
      boss.hp = Math.max(0, boss.hp - hit.damage);
      this.broadcast("fx", { kind: "hit", x: boss.x, y: boss.y, text: `${hit.damage}` });
      const killed = boss.hp <= 0;
      if (killed) {
        boss.alive = false;
        this.clock.setTimeout(() => {
          boss.hp = boss.maxHp;
          boss.alive = true;
          boss.x = boss.id.includes("merge") ? LANDMARKS.weekly.x : LANDMARKS.daily.x;
          boss.y = boss.id.includes("merge") ? LANDMARKS.weekly.y : LANDMARKS.daily.y;
        }, boss.id.includes("merge") ? 60_000 : 20_000);
      }
      if (player.characterId) {
        reportBossHit({
          characterId: player.characterId,
          bossId: boss.id,
          damage: hit.damage,
          killed,
        }).catch((err) => console.warn(err));
      }
      return;
    }
  }

  handleTalk(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (Math.hypot(player.x - LANDMARKS.duck.x, player.y - LANDMARKS.duck.y) > 64) return;
    this.state.duckLine = DUCK_LINES[Math.floor(Math.random() * DUCK_LINES.length)] ?? DUCK_LINES[0]!;
    this.broadcast("duck", { line: this.state.duckLine, from: player.name });
    if (player.characterId) {
      reportDuck(player.characterId).catch((err) => console.warn(err));
    }
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function closestPlayer(state: WorldState, x: number, y: number, range: number) {
  let best: WorldPlayer | undefined;
  let bestDist = range;
  for (const player of state.players.values()) {
    const dist = Math.hypot(player.x - x, player.y - y);
    if (dist < bestDist) {
      best = player;
      bestDist = dist;
    }
  }
  return best;
}
