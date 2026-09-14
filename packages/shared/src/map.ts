import { WORLD } from "./constants.js";

/** 0 path, 1 data-pillar wall, 2 spawn, 3 duck, 4 shop, 5 duel, 6 daily boss, 7 weekly boss, 8 dummy */
export const TILE = {
  PATH: 0,
  WALL: 1,
  SPAWN: 2,
  DUCK: 3,
  SHOP: 4,
  DUEL: 5,
  DAILY: 6,
  WEEKLY: 7,
  DUMMY: 8,
} as const;

export function buildWorldGrid(): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < WORLD.rows; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < WORLD.cols; x += 1) {
      const border = x === 0 || y === 0 || x === WORLD.cols - 1 || y === WORLD.rows - 1;
      const pillar = x % 7 === 0 && y % 5 === 0 && x > 3 && y > 3 && x < WORLD.cols - 3 && y < WORLD.rows - 3;
      row.push(border || pillar ? TILE.WALL : TILE.PATH);
    }
    grid.push(row);
  }

  const mark = (x: number, y: number, tile: number) => {
    const row = grid[y];
    if (row) row[x] = tile;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const n = grid[y + dy];
        if (n && n[x + dx] === TILE.WALL) n[x + dx] = TILE.PATH;
      }
    }
  };

  mark(8, 8, TILE.SPAWN);
  mark(12, 12, TILE.DUMMY);
  mark(24, 18, TILE.DUCK);
  mark(20, 16, TILE.SHOP);
  mark(28, 16, TILE.DUEL);
  mark(10, 28, TILE.DAILY);
  mark(38, 28, TILE.WEEKLY);
  return grid;
}

export function tileAt(grid: number[][], px: number, py: number): number {
  const x = Math.floor(px / WORLD.tile);
  const y = Math.floor(py / WORLD.tile);
  return grid[y]?.[x] ?? TILE.WALL;
}

export function blocked(grid: number[][], px: number, py: number): boolean {
  return tileAt(grid, px, py) === TILE.WALL;
}

export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * WORLD.tile + WORLD.tile / 2, y: ty * WORLD.tile + WORLD.tile / 2 };
}

export const LANDMARKS = {
  spawn: tileCenter(8, 8),
  dummy: tileCenter(12, 12),
  duck: tileCenter(24, 18),
  shop: tileCenter(20, 16),
  duel: tileCenter(28, 16),
  daily: tileCenter(10, 28),
  weekly: tileCenter(38, 28),
};
