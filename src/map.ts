// ============================================================
// Tile map — owns MAP state, exports query functions
// ============================================================

import type { Segment, Vec2, Torch, LevelData } from './types.js';
import { TILE } from './constants.js';

// Module-private map state
let MAP: number[][] = [];
let MAP_W_TILES = 0;
let MAP_H_TILES = 0;

export function loadMap(levelData: LevelData): void {
  const rows = levelData.tiles;
  MAP_H_TILES = rows.length;
  MAP_W_TILES = rows[0].length;
  MAP = rows.map(row => row.split('').map(Number));
}

export function tileAt(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= MAP_W_TILES || ty >= MAP_H_TILES) return 1;
  return MAP[ty][tx];
}

export function isSolid(tx: number, ty: number): boolean {
  return tileAt(tx, ty) === 1;
}

export function mapWidthTiles():  number { return MAP_W_TILES; }
export function mapHeightTiles(): number { return MAP_H_TILES; }

export function buildWallSegments(): { segments: Segment[]; corners: Vec2[] } {
  const wallSegments: Segment[] = [];

  // Horizontal segments: top-face and bottom-face runs
  for (let ty = 0; ty < MAP_H_TILES; ty++) {
    let runStart = -1;
    for (let tx = 0; tx <= MAP_W_TILES; tx++) {
      const active = tx < MAP_W_TILES && isSolid(tx, ty) && !isSolid(tx, ty - 1);
      if (active && runStart < 0) { runStart = tx; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: runStart * TILE, y1: ty * TILE, x2: tx * TILE, y2: ty * TILE });
        runStart = -1;
      }
    }
    runStart = -1;
    for (let tx = 0; tx <= MAP_W_TILES; tx++) {
      const active = tx < MAP_W_TILES && isSolid(tx, ty) && !isSolid(tx, ty + 1);
      if (active && runStart < 0) { runStart = tx; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: runStart * TILE, y1: (ty + 1) * TILE, x2: tx * TILE, y2: (ty + 1) * TILE });
        runStart = -1;
      }
    }
  }

  // Vertical segments: left-face and right-face runs
  for (let tx = 0; tx < MAP_W_TILES; tx++) {
    let runStart = -1;
    for (let ty = 0; ty <= MAP_H_TILES; ty++) {
      const active = ty < MAP_H_TILES && isSolid(tx, ty) && !isSolid(tx - 1, ty);
      if (active && runStart < 0) { runStart = ty; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: tx * TILE, y1: runStart * TILE, x2: tx * TILE, y2: ty * TILE });
        runStart = -1;
      }
    }
    runStart = -1;
    for (let ty = 0; ty <= MAP_H_TILES; ty++) {
      const active = ty < MAP_H_TILES && isSolid(tx, ty) && !isSolid(tx + 1, ty);
      if (active && runStart < 0) { runStart = ty; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: (tx + 1) * TILE, y1: runStart * TILE, x2: (tx + 1) * TILE, y2: ty * TILE });
        runStart = -1;
      }
    }
  }

  // Collect unique corners from all segments
  const wallCorners: Vec2[] = [];
  const seen = new Map<string, true>();
  for (const s of wallSegments) {
    const k1 = s.x1 + ',' + s.y1, k2 = s.x2 + ',' + s.y2;
    if (!seen.has(k1)) { seen.set(k1, true); wallCorners.push({ x: s.x1, y: s.y1 }); }
    if (!seen.has(k2)) { seen.set(k2, true); wallCorners.push({ x: s.x2, y: s.y2 }); }
  }

  return { segments: wallSegments, corners: wallCorners };
}

export function buildTorches(): Torch[] {
  const torches: Torch[] = [];
  for (let ty = 0; ty < MAP_H_TILES; ty++) {
    for (let tx = 0; tx < MAP_W_TILES; tx++) {
      if (MAP[ty][tx] === 1) {
        const adj = [tileAt(tx - 1, ty), tileAt(tx + 1, ty), tileAt(tx, ty - 1), tileAt(tx, ty + 1)];
        if (adj.some(t => t === 0 || t === 2) && Math.random() < 0.07) {
          torches.push({
            x: tx * TILE + TILE / 2,
            y: ty * TILE + TILE / 2,
            phase: Math.random() * Math.PI * 2,
            intensity: 0.6 + Math.random() * 0.4,
          });
        }
      }
    }
  }
  return torches;
}
