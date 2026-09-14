import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create() {
    paint(this, "tile-path", 32, 32, (g) => {
      g.fillStyle(0x03160d, 1);
      g.fillRect(0, 0, 32, 32);
      g.lineStyle(1, 0x0b3d24, 0.7);
      g.strokeRect(0.5, 0.5, 31, 31);
      g.fillStyle(0x0a2c1a, 1);
      for (let i = 0; i < 6; i += 1) g.fillRect(3 + (i * 5) % 26, 4 + i * 4, 2, 2);
    });
    paint(this, "tile-wall", 32, 32, (g) => {
      g.fillStyle(0x051f14, 1);
      g.fillRect(0, 0, 32, 32);
      g.lineStyle(2, 0x39ff88, 0.55);
      g.strokeRect(3, 3, 26, 26);
      g.fillStyle(0x39ff88, 0.8);
      g.fillRect(14, 8, 4, 16);
    });
    paint(this, "hero", 28, 36, (g) => {
      g.fillStyle(0x39ff88, 1);
      g.fillRoundedRect(4, 10, 20, 22, 6);
      g.fillStyle(0xffe7b8, 1);
      g.fillCircle(14, 10, 8);
      g.fillStyle(0x111111, 1);
      g.fillCircle(11, 9, 1.6);
      g.fillCircle(17, 9, 1.6);
      g.lineStyle(1, 0x111111, 1);
      g.strokeCircle(14, 12, 2);
    });
    paint(this, "duck", 28, 28, (g) => {
      g.fillStyle(0xffd84d, 1);
      g.fillCircle(14, 16, 10);
      g.fillCircle(18, 8, 6);
      g.fillStyle(0xff8a1d, 1);
      g.fillTriangle(23, 8, 32, 10, 23, 13);
      g.fillStyle(0x111111, 1);
      g.fillCircle(20, 7, 1.4);
    });
    paint(this, "dummy", 24, 32, (g) => {
      g.fillStyle(0x8aa3ff, 1);
      g.fillRoundedRect(4, 8, 16, 20, 4);
      g.fillCircle(12, 8, 7);
      g.fillStyle(0xffffff, 1);
      g.fillRect(6, 14, 12, 3);
    });
    paint(this, "boss", 40, 40, (g) => {
      g.fillStyle(0x39ff88, 0.25);
      g.fillCircle(20, 20, 18);
      g.lineStyle(2, 0x39ff88, 1);
      g.strokeCircle(20, 20, 16);
      g.fillStyle(0x39ff88, 1);
      g.fillRect(10, 12, 4, 10);
      g.fillRect(26, 12, 4, 10);
    });
    paint(this, "conflict", 44, 44, (g) => {
      g.fillStyle(0xff4d6d, 0.3);
      g.fillCircle(22, 22, 20);
      g.lineStyle(2, 0xff4d6d, 1);
      g.strokeRect(6, 6, 32, 32);
      g.fillStyle(0xff4d6d, 1);
      g.fillTriangle(22, 10, 34, 32, 10, 32);
    });
    this.scene.start("overworld");
  }
}

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}
