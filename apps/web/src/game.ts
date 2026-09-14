import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { OverworldScene } from "./scenes/OverworldScene.js";
import { DuelScene } from "./scenes/DuelScene.js";

export function startGame(characterId: string) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#020805",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: 1280,
      height: 720,
    },
    physics: { default: "arcade" },
    scene: [BootScene, OverworldScene, DuelScene],
    callbacks: {
      preBoot: (game) => {
        game.registry.set("characterId", characterId);
      },
    },
  });
}
