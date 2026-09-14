import { Schema, MapSchema, type } from "@colyseus/schema";

export class DuelFighter extends Schema {
  @type("string") sessionId = "";
  @type("string") characterId = "";
  @type("string") name = "";
  @type("string") color = "#33ff88";
  @type("number") side = 0;
  @type("boolean") isBot = false;
  @type("boolean") spectator = false;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 55;
  @type("number") maxHp = 55;
  @type("number") level = 1;
  @type("number") damageDealt = 0;
  @type("string") emote = "";
  @type("boolean") alive = true;
}

export class DuelState extends Schema {
  @type({ map: DuelFighter }) units = new MapSchema<DuelFighter>();
  @type("string") mode = "solo";
  @type("string") phase = "waiting";
  @type("number") winnerSide = -1;
  @type("string") lastEmote = "";
}
