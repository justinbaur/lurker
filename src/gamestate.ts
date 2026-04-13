// ============================================================
// Game state — level management, game loop, win/death flow
// ============================================================

import type { IEnemy, Particle, Segment, Vec2, Torch, PlayerState, CameraState, InputState } from './types.js';
import { TILE } from './constants.js';
import { loadMap, buildWallSegments, buildTorches } from './map.js';
import { initAudio, playSound, startHeartbeat, stopHeartbeat } from './audio.js';
import { spawnParticles, updateParticles, drawParticles } from './particles.js';
import { hasLOS } from './raycasting.js';
import { createPlayer, updatePlayer, hitPlayer as doHitPlayer } from './player.js';
import { Enemy } from './enemy.js';
import {
  wx, wy,
  camUpdate,
  updateShake, ShakeState,
  drawMap, drawTorches, drawPlayer, drawLighting, drawJoysticks,
} from './renderer.js';

import level1 from './levels/level1.json';
import level2 from './levels/level2.json';
import level3 from './levels/level3.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LEVELS = [level1, level2, level3] as any[];

// ─── Canvas + sizing (injected from main.ts) ────────────────
let canvas!:      HTMLCanvasElement;
let ctx!:         CanvasRenderingContext2D;
let lightCanvas!: HTMLCanvasElement;
let lightCtx!:    CanvasRenderingContext2D;
let canvasW = 800;
let canvasH = 560;

export function setCanvas(
  c: HTMLCanvasElement,
  c2d: CanvasRenderingContext2D,
  lc: HTMLCanvasElement,
  lc2d: CanvasRenderingContext2D,
): void {
  canvas = c; ctx = c2d; lightCanvas = lc; lightCtx = lc2d;
}

export function setCanvasSize(w: number, h: number): void {
  canvasW = w; canvasH = h;
}

// ─── Game state ──────────────────────────────────────────────
const player     = createPlayer();
const camera: CameraState = { x: 0, y: 0 };
const particles: Particle[] = [];
let enemies: IEnemy[]     = [];
let torches: Torch[]      = [];
let wallSegments: Segment[] = [];
// wallCorners currently unused at runtime outside buildWallSegments
let _wallCorners: Vec2[]  = [];

let gameState        = 'title';
let frameCount       = 0;
let currentLevelIndex = 0;
let flashAngle       = 0;
const flashAngleBox  = { value: 0 };
const shake: ShakeState = { mag: 0, x: 0, y: 0 };

let audioCtx:       AudioContext | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ─── Input (injected from main.ts) ───────────────────────────
let inputState!: InputState;
export function setInputState(is: InputState): void { inputState = is; }

// ─── Screen helpers ──────────────────────────────────────────
function toScreenX(worldX: number): number { return wx(camera, worldX); }
function toScreenY(worldY: number): number { return wy(camera, worldY); }

// ─── Audio wrappers ──────────────────────────────────────────
function _playSound(type: Parameters<typeof playSound>[1]): void {
  playSound(audioCtx, type);
}
function _startHeartbeat(fast: boolean): void {
  heartbeatTimer = startHeartbeat(audioCtx, fast);
}
function _stopHeartbeat(): void {
  stopHeartbeat(heartbeatTimer);
  heartbeatTimer = null;
}

// ─── Forward declarations (functions call each other) ────────
function triggerWin(): void {
  gameState = 'win';
  _stopHeartbeat();
  _playSound('win');
  const isLastLevel = currentLevelIndex >= LEVELS.length - 1;
  setTimeout(() => {
    const o = document.getElementById('overlay')!;
    if (isLastLevel) {
      o.innerHTML = `<h1 style="color:#080;text-shadow:0 0 40px #0f0">ESCAPED</h1>
        <p class="sub" style="color:#050">You survived all ${LEVELS.length} levels.</p>
        <p class="sub" style="color:#333">The darkness retreats... for now.</p>
        <button id="replayBtn">PLAY AGAIN</button>`;
      o.style.display = 'flex';
      document.getElementById('replayBtn')!.addEventListener('click', () => {
        currentLevelIndex = 0;
        showLevelIntro(0);
      });
    } else {
      o.innerHTML = `<h1 style="color:#080;text-shadow:0 0 40px #0f0">ESCAPED</h1>
        <p class="sub" style="color:#050">You survived the dark.</p>
        <p class="sub" style="color:#333">...but something stirs deeper below.</p>
        <button id="nextLevelBtn">CONTINUE</button>`;
      o.style.display = 'flex';
      document.getElementById('nextLevelBtn')!.addEventListener('click', () => {
        showLevelIntro(currentLevelIndex + 1);
      });
    }
  }, 400);
}

function triggerDeath(): void {
  gameState = 'gameover';
  _stopHeartbeat();
  setTimeout(() => {
    const o = document.getElementById('overlay')!;
    o.innerHTML = `<h1 style="color:#800">YOU DIED</h1>
      <p class="sub" style="color:#600">They found you in the dark.</p>
      <p class="sub" style="color:#444">Level ${currentLevelIndex + 1} — ${LEVELS[currentLevelIndex].name}</p>
      <button id="retryBtn">TRY AGAIN</button>`;
    o.style.display = 'flex';
    document.getElementById('retryBtn')!.addEventListener('click', () => {
      document.getElementById('overlay')!.style.display = 'none';
      startLevel(currentLevelIndex);
    });
  }, 700);
}

function hitPlayer(): void {
  doHitPlayer(
    player,
    _playSound,
    _startHeartbeat,
    triggerDeath,
    (mag) => { shake.mag = mag; },
  );
}

// ─── Enemy context ───────────────────────────────────────────
// Use a proxy object so enemies always read the live wallSegments array
const enemyCtx = {
  get ctx():          CanvasRenderingContext2D  { return ctx; },
  get canvasW():      number                   { return canvasW; },
  get canvasH():      number                   { return canvasH; },
  get player():       PlayerState              { return player; },
  get wallSegments(): Segment[]                { return wallSegments; },
  get particles():    Particle[]               { return particles; },
  flashAngle: () => flashAngle,
  toScreenX,
  toScreenY,
  playSound:  _playSound,
  hitPlayer,
};

function makeEnemy(x: number, y: number, type: string): IEnemy {
  return new Enemy(x, y, type as 'stalker' | 'rusher', enemyCtx);
}

// ─── Level management ─────────────────────────────────────────
function startLevel(levelIndex: number): void {
  const levelData = LEVELS[levelIndex];
  currentLevelIndex = levelIndex;

  loadMap(levelData);

  player.x = levelData.playerStart[0] * TILE;
  player.y = levelData.playerStart[1] * TILE;
  player.health = 100;
  player.invincible = 0;

  const healthBar = document.getElementById('health-fill');
  if (healthBar) healthBar.style.width = '100%';
  particles.length = 0;

  enemies = levelData.enemies.map(
    (e: { type: string; tile: [number, number] }) =>
      makeEnemy(e.tile[0] * TILE + TILE / 2, e.tile[1] * TILE + TILE / 2, e.type),
  );

  torches = buildTorches();
  const ws = buildWallSegments();
  wallSegments = ws.segments;
  _wallCorners = ws.corners;

  const label = document.getElementById('level-label');
  if (label) label.textContent = 'LEVEL ' + (levelIndex + 1);

  gameState = 'playing';
  _startHeartbeat(false);
  requestAnimationFrame(gameLoop);
}

function showLevelIntro(levelIndex: number): void {
  const levelData = LEVELS[levelIndex];
  const o = document.getElementById('overlay')!;
  o.innerHTML = `<h1 style="color:#609;text-shadow:0 0 40px #90f,0 0 80px #306">${levelData.name.toUpperCase()}</h1>
    <p class="sub" style="color:#555">Level ${levelIndex + 1} of ${LEVELS.length}</p>
    <p class="sub" style="color:#444;max-width:400px;text-align:center">${levelData.narrative}</p>
    <button id="levelStartBtn">ENTER THE DARK</button>`;
  o.style.display = 'flex';
  document.getElementById('levelStartBtn')!.addEventListener('click', () => {
    document.getElementById('overlay')!.style.display = 'none';
    startLevel(levelIndex);
  });
}

export function startGame(): void {
  audioCtx = initAudio();
  currentLevelIndex = 0;
  showLevelIntro(0);
}

// ─── Game loop ───────────────────────────────────────────────
function gameLoop(): void {
  if (gameState !== 'playing') return;
  frameCount++;

  updatePlayer(player, inputState, flashAngleBox, _playSound, toScreenX, toScreenY, triggerWin, gameState);
  flashAngle = flashAngleBox.value;

  camUpdate(camera, player, canvasW, canvasH);
  enemies.forEach(e => e.update());
  updateParticles(particles);
  updateShake(shake);

  ctx.save();
  ctx.translate(shake.x, shake.y);

  ctx.fillStyle = '#040208';
  ctx.fillRect(-10, -10, canvasW + 20, canvasH + 20);

  drawMap(ctx, camera, canvasW, canvasH, frameCount);
  drawTorches(ctx, camera, torches, canvasW, canvasH);
  drawParticles(ctx, particles, toScreenX, toScreenY);
  drawPlayer(ctx, camera, player, frameCount);
  enemies.forEach(e => e.draw());
  drawLighting(ctx, lightCtx, lightCanvas, camera, player, torches, enemies, wallSegments, flashAngle, canvasW, canvasH);

  ctx.restore();

  drawJoysticks(ctx, inputState);

  // Edge vignette
  const vig = ctx.createRadialGradient(canvasW / 2, canvasH / 2, canvasH * 0.28, canvasW / 2, canvasH / 2, canvasH * 0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, canvasW, canvasH);

  requestAnimationFrame(gameLoop);
}
