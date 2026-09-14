import { createServer } from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { config } from "dotenv";
import { resolve } from "node:path";
import { WorldRoom } from "./rooms/WorldRoom.js";
import { DuelRoom } from "./rooms/DuelRoom.js";

config({ path: resolve(process.cwd(), "../../.env") });

const port = Number(process.env.COLYSEUS_PORT ?? 2567);
const app = express();
app.get("/health", (_req, res) => res.json({ ok: true, name: "commitquest-colyseus" }));

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("world", WorldRoom);
gameServer.define("duel", DuelRoom);

httpServer.listen(port, () => {
  console.log(`CommitQuest Colyseus on ws://localhost:${port}`);
});
