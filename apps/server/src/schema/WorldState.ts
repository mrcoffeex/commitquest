import { Schema, MapSchema, type } from "@colyseus/schema";

export class WorldPlayer extends Schema {
  @type("string") sessionId = "";
  @type("string") characterId = "";
  @type("string") name = "";
  @type("string") color = "#33ff88";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 55;
  @type("number") maxHp = 55;
  @type("number") level = 1;
  @type("boolean") focus = false;
  @type("string") emote = "";
  @type("number") emoteUntil = 0;
  @type("boolean") attacking = false;
}

export class WorldBoss extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 1;
  @type("number") maxHp = 1;
  @type("boolean") alive = true;
}

export class WorldState extends Schema {
  @type({ map: WorldPlayer }) players = new MapSchema<WorldPlayer>();
  @type({ map: WorldBoss }) bosses = new MapSchema<WorldBoss>();
  @type("string") duckLine = "Quack. Walk me through the bug.";
}
