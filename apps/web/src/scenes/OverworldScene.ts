import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import { LANDMARKS, TILE, WORLD, blocked, buildWorldGrid, moveSpeed, emptyStats } from "@commitquest/shared";
import { currentCharacter, refreshHud, setHp, setPrompt, toast } from "../hud.js";
import { gameClient } from "../net.js";

type WorldMsg = { kind?: string; x?: number; y?: number; text?: string; line?: string };

export class OverworldScene extends Phaser.Scene {
  room: Room | null = null;
  sprites = new Map<string, Phaser.GameObjects.Container>();
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  lastSent = "";
  grid = buildWorldGrid();
  localHero?: Phaser.GameObjects.Container;

  constructor() {
    super("overworld");
  }

  async create() {
    this.drawMap();
    this.drawRain();
    this.placeProps();
    this.input.keyboard?.on("keydown-SPACE", () => {
      if (!this.room && this.localHero) {
        this.floatText(this.localHero.x, this.localHero.y - 10, "HIT");
      }
    });
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setZoom(1.15);

    const keys = this.input.keyboard!;
    this.cursors = keys.createCursorKeys();
    this.wasd = keys.addKeys("W,A,S,D") as typeof this.wasd;
    keys.on("keydown-SPACE", () => this.room?.send("attack"));
    keys.on("keydown-E", () => this.tryInteract());
    keys.on("keydown-ONE", () => this.room?.send("emote", { text: "gg" }));
    keys.on("keydown-TWO", () => this.room?.send("emote", { text: "duck" }));
    keys.on("keydown-THREE", () => this.room?.send("emote", { text: "404" }));
    this.input.on("pointerdown", () => this.room?.send("attack"));

    this.spawnLocalHero();
    const characterId = this.registry.get("characterId") as string;
    try {
      const client = gameClient();
      this.room = await client.joinOrCreate("world", { characterId });
      try {
        const $ = getStateCallbacks(this.room);
        $(this.room.state).players.onAdd((player: WorldPlayer, id: string) => {
          this.upsert(id, player, id === this.room?.sessionId);
          $(player).onChange(() => this.upsert(id, player, false));
        });
        $(this.room.state).players.onRemove((_p: WorldPlayer, id: string) => {
          this.sprites.get(id)?.destroy();
          this.sprites.delete(id);
        });
        $(this.room.state).bosses.onAdd((boss: WorldBoss) => {
          this.drawBoss(boss);
          $(boss).onChange(() => this.drawBoss(boss));
        });
      } catch (callbackError) {
        console.warn("state callbacks", callbackError);
      }
      this.room.onMessage("fx", (msg: WorldMsg) => this.floatText(msg.x ?? 0, msg.y ?? 0, msg.text ?? "hit"));
      this.room.onMessage("duck", (msg: WorldMsg) => {
        setPrompt(msg.line ?? "");
        toast(msg.line ?? "");
        refreshHud().catch(() => undefined);
      });
      this.events.on("duel", (opts: { spectate?: boolean }) => this.enterDuel(opts.spectate));
      setPrompt("Connected to the overworld.");
    } catch (error) {
      setPrompt("Playing locally — Colyseus not reached. WASD still works.");
      toast(error instanceof Error ? error.message : "Colyseus offline");
    }
  }

  tryInteract() {
    const me = this.mySprite() ?? this.localHero;
    if (!me) return;
    if (!this.room) {
      if (Phaser.Math.Distance.Between(me.x, me.y, LANDMARKS.duck.x, LANDMARKS.duck.y) < 70) {
        setPrompt("Quack. (offline) Try the duck again when Colyseus is up.");
      }
      if (Phaser.Math.Distance.Between(me.x, me.y, LANDMARKS.duel.x, LANDMARKS.duel.y) < 70) {
        this.enterDuel(false);
      }
      return;
    }
    const d = Phaser.Math.Distance.Between(me.x, me.y, LANDMARKS.duck.x, LANDMARKS.duck.y);
    if (d < 70) {
      this.room.send("talk");
      return;
    }
    if (Phaser.Math.Distance.Between(me.x, me.y, LANDMARKS.duel.x, LANDMARKS.duel.y) < 70) {
      this.enterDuel(false);
      return;
    }
    if (Phaser.Math.Distance.Between(me.x, me.y, LANDMARKS.shop.x, LANDMARKS.shop.y) < 70) {
      setPrompt("Open the shop with K — Bits only.");
    }
  }

  enterDuel(spectate = false) {
    if (this.room) this.room.leave();
    this.scene.start("duel", { spectate });
  }

  spawnLocalHero() {
    const me = currentCharacter();
    const color = Phaser.Display.Color.HexStringToColor(me?.color || "#33ff88").color;
    const body = this.add.image(0, 0, "hero").setTint(color);
    const label = this.add.text(0, -28, me?.displayName ?? "you", { fontSize: "11px", color: "#9affc4" }).setOrigin(0.5);
    this.localHero = this.add.container(LANDMARKS.spawn.x, LANDMARKS.spawn.y, [body, label]);
    this.cameras.main.startFollow(this.localHero, true, 0.12, 0.12);
    setHp(55, 55);
  }

  update(_t: number, dt: number) {
    const input = {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    };
    const packed = JSON.stringify(input);
    if (packed !== this.lastSent) {
      this.lastSent = packed;
      this.room?.send("input", input);
    }

    const mine = this.room?.sessionId ? this.room.state.players?.get?.(this.room.sessionId) : undefined;
    if (mine && this.localHero) {
      this.localHero.setVisible(false);
    } else if (this.localHero) {
      this.stepLocal(input, dt);
    }

    if (mine) {
      setHp(mine.hp, mine.maxHp);
      this.hintAt(mine.x, mine.y);
    } else if (this.localHero) {
      this.hintAt(this.localHero.x, this.localHero.y);
    }
  }

  stepLocal(input: { up: boolean; down: boolean; left: boolean; right: boolean }, dt: number) {
    if (!this.localHero) return;
    let vx = 0;
    let vy = 0;
    if (input.up) vy -= 1;
    if (input.down) vy += 1;
    if (input.left) vx -= 1;
    if (input.right) vx += 1;
    const len = Math.hypot(vx, vy) || 1;
    const speed = moveSpeed(emptyStats());
    const nx = this.localHero.x + (vx / len) * speed * (dt / 1000);
    const ny = this.localHero.y + (vy / len) * speed * (dt / 1000);
    if (!blocked(this.grid, nx, this.localHero.y)) this.localHero.x = nx;
    if (!blocked(this.grid, this.localHero.x, ny)) this.localHero.y = ny;
  }

  hintAt(x: number, y: number) {
    const nearDuck = Phaser.Math.Distance.Between(x, y, LANDMARKS.duck.x, LANDMARKS.duck.y) < 70;
    const nearDuel = Phaser.Math.Distance.Between(x, y, LANDMARKS.duel.x, LANDMARKS.duel.y) < 70;
    const nearDaily = Phaser.Math.Distance.Between(x, y, LANDMARKS.daily.x, LANDMARKS.daily.y) < 90;
    const nearWeekly = Phaser.Math.Distance.Between(x, y, LANDMARKS.weekly.x, LANDMARKS.weekly.y) < 90;
    if (nearDuck) setPrompt("E: talk to the Rubber Duck");
    else if (nearDuel) setPrompt("E or Q: enter a solo duel vs CompileBot");
    else if (nearDaily) setPrompt("Daily boss: Null Pointer Phantom — Space to attack");
    else if (nearWeekly) setPrompt("Weekly boss: The Great Merge Conflict");
  }

  upsert(id: string, player: WorldPlayer, follow: boolean) {
    let sprite = this.sprites.get(id);
    if (!sprite) {
      const body = this.add.image(0, 0, "hero");
      const color = Phaser.Display.Color.HexStringToColor(player.color || "#33ff88").color;
      body.setTint(color);
      const label = this.add.text(0, -28, player.name, { fontSize: "11px", color: "#9affc4" }).setOrigin(0.5);
      const emote = this.add.text(0, -42, "", { fontSize: "12px", color: "#d6ff4a" }).setOrigin(0.5);
      sprite = this.add.container(player.x, player.y, [body, label, emote]);
      this.sprites.set(id, sprite);
      if (follow && id === this.room?.sessionId) this.cameras.main.startFollow(sprite, true, 0.12, 0.12);
    }
    sprite.x = player.x;
    sprite.y = player.y;
    const label = sprite.getAt(1) as Phaser.GameObjects.Text;
    const emote = sprite.getAt(2) as Phaser.GameObjects.Text;
    label.setText(`${player.name} L${player.level}${player.focus ? " ●" : ""}`);
    emote.setText(player.emote ?? "");
    if (player.attacking) this.tweens.add({ targets: sprite, scale: 1.12, yoyo: true, duration: 80 });
  }

  drawBoss(boss: WorldBoss) {
    if (!boss?.id || !this.sys.isActive()) return;
    const key = `boss-${boss.id}`;
    let sprite = this.sprites.get(key);
    if (!sprite) {
      const img = this.add.image(0, 0, boss.id.includes("merge") ? "conflict" : "boss");
      const label = this.add.text(0, -30, boss.name || "boss", { fontSize: "11px", color: "#ffb3c1" }).setOrigin(0.5);
      sprite = this.add.container(boss.x, boss.y, [img, label]);
      this.sprites.set(key, sprite);
    }
    sprite.x = boss.x;
    sprite.y = boss.y;
    sprite.setVisible(boss.alive !== false);
    const label = sprite.getAt(1);
    if (label && "setText" in label) {
      (label as Phaser.GameObjects.Text).setText(`${boss.name} ${boss.hp}/${boss.maxHp}`);
    }
  }

  drawMap() {
    const grid = buildWorldGrid();
    for (let y = 0; y < WORLD.rows; y += 1) {
      for (let x = 0; x < WORLD.cols; x += 1) {
        const tile = grid[y]?.[x] ?? TILE.PATH;
        const img = this.add.image(x * WORLD.tile + 16, y * WORLD.tile + 16, tile === TILE.WALL ? "tile-wall" : "tile-path");
        img.setAlpha(tile === TILE.WALL ? 0.95 : 0.85);
      }
    }
  }

  drawRain() {
    const chars = "01アイウエオ<>/;$#";
    for (let i = 0; i < 40; i += 1) {
      const text = this.add
        .text(Math.random() * WORLD.width, Math.random() * WORLD.height, chars[i % chars.length] ?? "0", {
          fontSize: "14px",
          color: "#145c38",
        })
        .setAlpha(0.45);
      this.tweens.add({
        targets: text,
        y: WORLD.height + 20,
        duration: 6000 + Math.random() * 8000,
        repeat: -1,
        onRepeat: () => {
          text.x = Math.random() * WORLD.width;
          text.y = -20;
        },
      });
    }
  }

  placeProps() {
    this.add.image(LANDMARKS.duck.x, LANDMARKS.duck.y, "duck");
    this.add.text(LANDMARKS.duck.x, LANDMARKS.duck.y + 22, "Rubber Duck", { fontSize: "11px", color: "#ffd84d" }).setOrigin(0.5);
    this.add.image(LANDMARKS.dummy.x, LANDMARKS.dummy.y, "dummy");
    this.add.text(LANDMARKS.dummy.x, LANDMARKS.dummy.y + 22, "Training Dummy", { fontSize: "11px", color: "#8aa3ff" }).setOrigin(0.5);
    labelAt(this, LANDMARKS.shop.x, LANDMARKS.shop.y, "SHOP", "#39ff88");
    labelAt(this, LANDMARKS.duel.x, LANDMARKS.duel.y, "DUEL", "#d6ff4a");
    labelAt(this, LANDMARKS.spawn.x, LANDMARKS.spawn.y - 28, "SPAWN", "#6f9d82");
  }

  floatText(x: number, y: number, text: string) {
    const label = this.add.text(x, y, text, { fontSize: "14px", color: "#d6ff4a" }).setOrigin(0.5);
    this.tweens.add({ targets: label, y: y - 28, alpha: 0, duration: 500, onComplete: () => label.destroy() });
  }

  mySprite() {
    return this.room ? this.sprites.get(this.room.sessionId) : undefined;
  }
}

function labelAt(scene: Phaser.Scene, x: number, y: number, text: string, color: string) {
  scene.add.rectangle(x, y, 54, 20, 0x03160d, 0.8).setStrokeStyle(1, 0x145c38);
  scene.add.text(x, y, text, { fontSize: "11px", color }).setOrigin(0.5);
}

type WorldPlayer = {
  x: number;
  y: number;
  name: string;
  color: string;
  level: number;
  hp: number;
  maxHp: number;
  emote: string;
  focus: boolean;
  attacking: boolean;
};

type WorldBoss = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
};

void currentCharacter;
