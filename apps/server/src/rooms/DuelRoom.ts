import { Room, type Client } from "colyseus";
import {
  DUEL,
  botThink,
  emptyStats,
  maxHp,
  moveSpeed,
  parseStats,
  rollAttack,
  type Combatant,
  type MatchMode,
} from "@commitquest/shared";
import { DuelFighter, DuelState } from "../schema/DuelState.js";
import { loadCharacter, reportDuel } from "../api.js";

type Input = { up?: boolean; down?: boolean; left?: boolean; right?: boolean };

export class DuelRoom extends Room<DuelState> {
  state = new DuelState();
  inputs = new Map<string, Input>();
  combatants = new Map<string, Combatant>();
  attackCd = new Map<string, number>();
  reported = false;
  fillTimer: ReturnType<Room["clock"]["setTimeout"]> | null = null;

  onCreate(options: { mode?: MatchMode }) {
    this.maxClients = 8;
    this.state.mode = options?.mode ?? "solo";
    this.state.phase = "waiting";

    this.onMessage("input", (client, data: Input) => this.inputs.set(client.sessionId, data ?? {}));
    this.onMessage("attack", (client) => this.handleAttack(client.sessionId));
    this.onMessage("emote", (client, data: { text?: string }) => {
      const unit = this.state.units.get(client.sessionId);
      if (!unit || unit.spectator) return;
      unit.emote = String(data?.text ?? "gg").slice(0, 12);
      this.state.lastEmote = `${unit.name}: ${unit.emote}`;
      this.clock.setTimeout(() => {
        if (unit.emote) unit.emote = "";
      }, 2200);
    });

    this.setSimulationInterval((dt) => this.tick(dt), 50);
    this.fillTimer = this.clock.setTimeout(() => this.fillBots(), this.state.mode === "solo" ? 400 : 8000);
  }

  async onJoin(client: Client, options: { characterId?: string; spectate?: boolean; mode?: MatchMode }) {
    if (options?.mode) this.state.mode = options.mode;
    const unit = new DuelFighter();
    unit.sessionId = client.sessionId;
    unit.characterId = String(options?.characterId ?? "");
    unit.spectator = Boolean(options?.spectate);
    unit.name = unit.spectator ? "spectator" : "fighter";
    unit.side = this.nextSide(unit.spectator);
    unit.x = unit.side === 0 ? 220 : 740;
    unit.y = 270;
    this.state.units.set(client.sessionId, unit);
    this.inputs.set(client.sessionId, {});
    this.combatants.set(client.sessionId, { level: 1, stats: emptyStats(), weapons: [] });

    if (unit.characterId) {
      try {
        const { character } = await loadCharacter(unit.characterId);
        unit.name = character.displayName;
        unit.color = character.color;
        unit.level = character.level;
        const combatant = {
          level: character.level,
          stats: parseStats(character.stats),
          weapons: character.weapons as Combatant["weapons"],
        };
        this.combatants.set(client.sessionId, combatant);
        unit.maxHp = maxHp(combatant);
        unit.hp = unit.maxHp;
      } catch (error) {
        console.warn("duel character load failed", error);
      }
    }

    if (!unit.spectator && this.neededHumans() <= this.humanFighters() && this.state.mode === "solo") {
      this.fillBots();
    }
    if (!unit.spectator && this.humanFighters() >= this.neededHumans()) {
      this.startFight();
    }
  }

  onLeave(client: Client) {
    this.state.units.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.combatants.delete(client.sessionId);
  }

  neededHumans() {
    if (this.state.mode === "trio") return 3;
    if (this.state.mode === "duo") return 2;
    return 1;
  }

  neededPerSide() {
    if (this.state.mode === "trio") return 3;
    if (this.state.mode === "duo") return 2;
    return 1;
  }

  humanFighters() {
    return [...this.state.units.values()].filter((u) => !u.isBot && !u.spectator).length;
  }

  nextSide(spectator: boolean) {
    if (spectator) return -1;
    const side0 = [...this.state.units.values()].filter((u) => u.side === 0 && !u.spectator).length;
    const cap = this.neededPerSide();
    return side0 < cap ? 0 : 1;
  }

  fillBots() {
    if (this.state.phase !== "waiting") return;
    const cap = this.neededPerSide();
    for (const side of [0, 1]) {
      const count = [...this.state.units.values()].filter((u) => u.side === side && !u.spectator).length;
      for (let i = count; i < cap; i += 1) {
        const bot = new DuelFighter();
        bot.sessionId = `bot-${side}-${i}`;
        bot.name = side === 1 && this.state.mode === "solo" ? "CompileBot" : `Bot-${side}-${i}`;
        bot.isBot = true;
        bot.side = side;
        bot.color = "#88aaff";
        bot.x = side === 0 ? 220 : 740;
        bot.y = 200 + i * 70;
        bot.level = 1;
        bot.maxHp = maxHp({ level: 1, stats: emptyStats() });
        bot.hp = bot.maxHp;
        this.state.units.set(bot.sessionId, bot);
        this.combatants.set(bot.sessionId, { level: 1, stats: emptyStats(), weapons: [] });
      }
    }
    this.startFight();
  }

  startFight() {
    if (this.state.phase === "fighting" || this.state.phase === "ended") return;
    this.state.phase = "fighting";
  }

  tick(dt: number) {
    if (this.state.phase !== "fighting") return;
    const seconds = dt / 1000;
    for (const [id, unit] of this.state.units) {
      if (unit.spectator || !unit.alive) continue;
      const combatant = this.combatants.get(id);
      const speed = moveSpeed(combatant?.stats ?? emptyStats());
      if (unit.isBot) {
        const enemy = this.nearestEnemy(unit);
        const think = botThink({ x: unit.x, y: unit.y }, enemy, 52);
        unit.x = clamp(unit.x + think.vx * speed * seconds, 40, DUEL.width - 40);
        unit.y = clamp(unit.y + think.vy * speed * seconds, 40, DUEL.height - 40);
        if (think.attack) this.handleAttack(id);
        continue;
      }
      const input = this.inputs.get(id) ?? {};
      let vx = 0;
      let vy = 0;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      const len = Math.hypot(vx, vy) || 1;
      unit.x = clamp(unit.x + (vx / len) * speed * seconds, 40, DUEL.width - 40);
      unit.y = clamp(unit.y + (vy / len) * speed * seconds, 40, DUEL.height - 40);
    }
    this.checkWinner();
  }

  handleAttack(id: string) {
    const unit = this.state.units.get(id);
    const combatant = this.combatants.get(id);
    if (!unit || !combatant || !unit.alive || unit.spectator || this.state.phase !== "fighting") return;
    const now = Date.now();
    if ((this.attackCd.get(id) ?? 0) > now) return;
    this.attackCd.set(id, now + 400);
    const enemy = this.nearestEnemy(unit);
    if (!enemy || Math.hypot(unit.x - enemy.x, unit.y - enemy.y) > 58) return;
    const def = this.combatants.get(enemy.sessionId) ?? { level: 1, stats: emptyStats() };
    const hit = rollAttack(combatant, def);
    enemy.hp = Math.max(0, enemy.hp - hit.damage);
    unit.damageDealt += hit.damage;
    unit.hp = Math.min(unit.maxHp, unit.hp + hit.lifesteal);
    this.broadcast("fx", { kind: "hit", x: enemy.x, y: enemy.y, text: `${hit.flavor} ${hit.damage}` });
    if (enemy.hp <= 0) enemy.alive = false;
  }

  nearestEnemy(unit: DuelFighter) {
    let best: DuelFighter | undefined;
    let bestDist = 9999;
    for (const other of this.state.units.values()) {
      if (other.sessionId === unit.sessionId || other.spectator || !other.alive || other.side === unit.side) continue;
      const dist = Math.hypot(other.x - unit.x, other.y - unit.y);
      if (dist < bestDist) {
        best = other;
        bestDist = dist;
      }
    }
    return best;
  }

  checkWinner() {
    if (this.reported) return;
    const alive0 = [...this.state.units.values()].some((u) => u.side === 0 && u.alive && !u.spectator);
    const alive1 = [...this.state.units.values()].some((u) => u.side === 1 && u.alive && !u.spectator);
    if (alive0 && alive1) return;
    this.reported = true;
    this.state.phase = "ended";
    this.state.winnerSide = alive0 ? 0 : 1;
    const participants = [...this.state.units.values()]
      .filter((u) => !u.spectator)
      .map((u) => ({
        characterId: u.characterId || undefined,
        displayName: u.name,
        side: u.side,
        isBot: u.isBot,
        damageDealt: u.damageDealt,
      }));
    reportDuel({
      mode: this.state.mode,
      winnerSide: this.state.winnerSide,
      participants,
    }).catch((err) => console.warn(err));
    this.broadcast("ended", { winnerSide: this.state.winnerSide });
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
