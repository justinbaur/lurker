// ============================================================
// Player — state factory, movement, hit detection
// ============================================================

import type { PlayerState, InputState, SoundType } from './types.js';
import { TILE } from './constants.js';
import { tileAt, isSolid } from './map.js';
import { updateFlashAngle } from './input.js';

export function createPlayer(): PlayerState {
  return {
    x: 72, y: 72,
    speed: 3, radius: 17,
    health: 100, maxHealth: 100,
    angle: 0,
    invincible: 0,
    stepTimer: 0,
  };
}

export function updatePlayer(
  player: PlayerState,
  input: InputState,
  flashAngle: { value: number }, // boxed so caller can read the updated value
  playSound: (type: SoundType) => void,
  toScreenX: (wx: number) => number,
  toScreenY: (wy: number) => number,
  onWin: () => void,
  gameState: string,
): void {
  let dx = 0, dy = 0;
  if (input.sticks.left.id !== null) {
    dx = input.sticks.left.dx;
    dy = input.sticks.left.dy;
  } else {
    if (input.keys['KeyW'] || input.keys['ArrowUp'])    dy = -1;
    if (input.keys['KeyS'] || input.keys['ArrowDown'])  dy =  1;
    if (input.keys['KeyA'] || input.keys['ArrowLeft'])  dx = -1;
    if (input.keys['KeyD'] || input.keys['ArrowRight']) dx =  1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  }

  const sp = player.speed;
  const r  = player.radius;

  // Horizontal
  if (dx) {
    const nx = player.x + dx * sp;
    const ex = dx > 0 ? nx + r : nx - r;
    if (!isSolid(Math.floor(ex / TILE), Math.floor((player.y - r + 1) / TILE)) &&
        !isSolid(Math.floor(ex / TILE), Math.floor((player.y + r - 1) / TILE))) {
      player.x = nx;
    }
  }
  // Vertical
  if (dy) {
    const ny = player.y + dy * sp;
    const ey = dy > 0 ? ny + r : ny - r;
    if (!isSolid(Math.floor((player.x - r + 1) / TILE), Math.floor(ey / TILE)) &&
        !isSolid(Math.floor((player.x + r - 1) / TILE), Math.floor(ey / TILE))) {
      player.y = ny;
    }
  }

  updateFlashAngle(input, toScreenX(player.x), toScreenY(player.y));
  flashAngle.value = input.flashAngle;
  player.angle     = input.flashAngle;

  if (player.invincible > 0) player.invincible--;

  if (dx || dy) {
    player.stepTimer++;
    if (player.stepTimer >= 22) { playSound('footstep'); player.stepTimer = 0; }
  }

  // Win check
  if (tileAt(Math.floor(player.x / TILE), Math.floor(player.y / TILE)) === 2 && gameState === 'playing') {
    onWin();
  }
}

export function hitPlayer(
  player: PlayerState,
  playSound: (type: SoundType) => void,
  onStartHeartbeat: (fast: boolean) => void,
  onDeath: () => void,
  onShake: (mag: number) => void,
): void {
  if (player.invincible > 0) return;
  player.health     = Math.max(0, player.health - 25);
  player.invincible = 90;
  onShake(14);
  playSound('jumpscare');

  const fl = document.getElementById('flash');
  if (fl) { fl.style.opacity = '0.75'; setTimeout(() => { fl.style.opacity = '0'; }, 180); }

  const bar = document.getElementById('health-fill');
  if (bar) bar.style.width = (player.health / player.maxHealth * 100) + '%';

  if (player.health <= 50) onStartHeartbeat(true);
  if (player.health <= 0)  onDeath();
}
