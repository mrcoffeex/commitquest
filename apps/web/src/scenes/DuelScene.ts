import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import { DUEL } from "@commitquest/shared";
import { refreshHud, setHp, setPrompt, toast } from "../hud.js";

type DuelUnit = {
  sessionId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  side: number;
  isBot: boolean;
  spectator: boolean;
  alive: boolean;
  emote: string;
  damageDealt: number;
};

export class DuelScene extends Phaser.Scene {
  room: Room | null = null;
  sprites = new Map<string, Phaser.GameObjects.Container>();
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("duel");
  }

  async create(data: { spectate?: boolean }) {
    this.add.rectangle(DUEL.width / 2, DUEL.height / 2, DUEL.width, DUEL.height, 0x04110a);
    this.add.rectangle(DUEL.width / 2, DUEL.height / 2, DUEL.width - 40, DUEL.height - 40, 0x020805).setStrokeStyle(2, 0x39ff88);
    this.add.text(24, 16, data.spectate ? "SPECTATING" : "SOLO DUEL", { fontSize: "16px", color: "#39ff88" });
    this.cameras.main.setBounds(0, 0, DUEL.width, DUEL.height);
    this.cameras.main.centerOn(DUEL.width / 2, DUEL.height / 2);

    const keys = this.input.keyboard!;
    this.cursors = keys.createCursorKeys();
    this.wasd = keys.addKeys("W,A,S,D") as typeof this.wasd;
    keys.on("keydown-SPACE", () => this.room?.send("attack"));
    keys.on("keydown-ONE", () => this.room?.send("emote", { text: "gg" }));
    keys.on("keydown-TWO", () => this.room?.send("emote", { text: "duck" }));
    keys.on("keydown-THREE", () => this.room?.send("emote", { text: "404" }));
    keys.on("keydown-ESC", () => this.leave());
    this.input.on("pointerdown", () => this.room?.send("attack"));
    setPrompt("Duel: WASD + Space. Esc returns to the overworld.");

    const characterId = this.registry.get("characterId") as string;
    const ws = import.meta.env.VITE_COLYSEUS_URL ?? "ws://localhost:2567";
    const client = new Client(ws);
    this.room = await client.joinOrCreate("duel", { characterId, spectate: Boolean(data.spectate), mode: "solo" });
    this.room.onMessage("fx", (msg: { x: number; y: number; text: string }) => {
      const label = this.add.text(msg.x, msg.y, msg.text, { fontSize: "14px", color: "#d6ff4a" }).setOrigin(0.5);
      this.tweens.add({ targets: label, y: msg.y - 24, alpha: 0, duration: 450, onComplete: () => label.destroy() });
    });
    this.room.onMessage("ended", (msg: { winnerSide: number }) => {
      const mine = this.room?.state.units.get(this.room.sessionId) as DuelUnit | undefined;
      const won = mine && mine.side === msg.winnerSide;
      toast(won ? "Victory. XP and Bits inbound." : "Defeat. 5% of current-bar XP lost.");
      refreshHud().catch(() => undefined);
    });
  }

  update() {
    if (!this.room) return;
    this.room.send("input", {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    });
    this.room.state.units.forEach((unit: DuelUnit, id: string) => {
      if (unit.spectator) return;
      let sprite = this.sprites.get(id);
      if (!sprite) {
        const body = this.add.image(0, 0, "hero").setTint(Phaser.Display.Color.HexStringToColor(unit.color || "#33ff88").color);
        const label = this.add.text(0, -28, unit.name, { fontSize: "11px", color: "#9affc4" }).setOrigin(0.5);
        sprite = this.add.container(unit.x, unit.y, [body, label]);
        this.sprites.set(id, sprite);
      }
      sprite.x = unit.x;
      sprite.y = unit.y;
      sprite.setAlpha(unit.alive ? 1 : 0.3);
      (sprite.getAt(1) as Phaser.GameObjects.Text).setText(
        `${unit.name}${unit.isBot ? " [BOT]" : ""} ${Math.ceil(unit.hp)}`,
      );
    });
    const mine = this.room.state.units.get(this.room.sessionId) as DuelUnit | undefined;
    if (mine) setHp(mine.hp, mine.maxHp);
    setPrompt(`Phase ${this.room.state.phase} · ${this.room.state.lastEmote || "1/2/3 emotes"}`);
  }

  leave() {
    this.room?.leave();
    this.scene.start("overworld");
    refreshHud().catch(() => undefined);
    setPrompt("Back in the overworld.");
  }
}
