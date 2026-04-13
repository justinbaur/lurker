// ============================================================
// Renderer — camera, world-to-screen helpers, all draw* functions
// ============================================================

import type { PlayerState, CameraState, Torch, Particle, IEnemy, InputState, Segment } from './types.js';
import { TILE, STICK_MAX, FLASH_RANGE, FLASH_HALF_ANGLE, AMBIENT_RADIUS } from './constants.js';
import { tileAt, mapWidthTiles, mapHeightTiles } from './map.js';
import { drawParticles } from './particles.js';
import { computeVisibilityPoly, drawVisibilityPoly } from './raycasting.js';

// ─── World-to-screen conversion ─────────────────────────────
export function wx(camera: CameraState, worldX: number): number { return worldX - camera.x; }
export function wy(camera: CameraState, worldY: number): number { return worldY - camera.y; }

// ─── Camera ──────────────────────────────────────────────────
export function camUpdate(
  camera: CameraState,
  player: PlayerState,
  canvasW: number, canvasH: number,
): void {
  camera.x = player.x - canvasW / 2;
  camera.y = player.y - canvasH / 2;
  camera.x = Math.max(0, Math.min(camera.x, mapWidthTiles()  * TILE - canvasW));
  camera.y = Math.max(0, Math.min(camera.y, mapHeightTiles() * TILE - canvasH));
}

// ─── Screen shake ────────────────────────────────────────────
export interface ShakeState { mag: number; x: number; y: number; }

export function updateShake(shake: ShakeState): void {
  if (shake.mag > 0.5) {
    shake.x    = (Math.random() - 0.5) * shake.mag;
    shake.y    = (Math.random() - 0.5) * shake.mag;
    shake.mag *= 0.82;
  } else {
    shake.x = 0; shake.y = 0; shake.mag = 0;
  }
}

// ─── Map ─────────────────────────────────────────────────────
export function drawMap(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  canvasW: number, canvasH: number,
  frameCount: number,
): void {
  const toSX = (wx: number) => wx - camera.x;
  const toSY = (wy: number) => wy - camera.y;

  const s0x = Math.max(0, Math.floor(camera.x / TILE));
  const e0x = Math.min(mapWidthTiles(),  Math.ceil((camera.x + canvasW) / TILE));
  const s0y = Math.max(0, Math.floor(camera.y / TILE));
  const e0y = Math.min(mapHeightTiles(), Math.ceil((camera.y + canvasH) / TILE));

  for (let ty = s0y; ty < e0y; ty++) {
    for (let tx = s0x; tx < e0x; tx++) {
      const tile = tileAt(tx, ty);
      const sx   = toSX(tx * TILE), sy = toSY(ty * TILE);

      if (tile === 1) {
        ctx.fillStyle = '#0f0d14';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = '#171320';
        ctx.fillRect(sx + 3, sy + 3, TILE / 2 - 4, TILE / 3 - 2);
        ctx.fillRect(sx + TILE / 2 + 2, sy + TILE / 3 + 2, TILE / 2 - 6, TILE / 3 - 2);
        ctx.strokeStyle = 'rgba(180,150,220,0.28)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy + TILE); ctx.lineTo(sx, sy); ctx.lineTo(sx + TILE, sy);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.moveTo(sx + TILE, sy); ctx.lineTo(sx + TILE, sy + TILE); ctx.lineTo(sx, sy + TILE);
        ctx.stroke();
      } else if (tile === 0) {
        ctx.fillStyle   = '#271d38';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = 'rgba(90,65,130,0.45)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      } else if (tile === 2) {
        ctx.fillStyle = '#081508';
        ctx.fillRect(sx, sy, TILE, TILE);
        const pulse = 0.5 + Math.sin(frameCount * 0.06) * 0.5;
        ctx.fillStyle = `rgba(0,${Math.floor(160 * pulse)},0,0.35)`;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle   = `rgba(0,255,80,${0.6 * pulse + 0.2})`;
        ctx.font        = 'bold 11px monospace';
        ctx.textAlign   = 'center';
        ctx.fillText('EXIT', sx + TILE / 2, sy + TILE / 2 + 4);
      }
    }
  }
}

// ─── Torches ─────────────────────────────────────────────────
export function drawTorches(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  torches: Torch[],
  canvasW: number, canvasH: number,
): void {
  for (const t of torches) {
    const tsx = t.x - camera.x, tsy = t.y - camera.y;
    if (tsx < -60 || tsx > canvasW + 60 || tsy < -60 || tsy > canvasH + 60) continue;
    const fl    = t.intensity + Math.sin(t.phase) * 0.3;
    const alpha = 0.65 + Math.sin(t.phase * 1.5) * 0.3;
    ctx.fillStyle = '#4a3010';
    ctx.fillRect(tsx - 2, tsy - 2, 5, 8);
    ctx.fillStyle = `rgba(255,${Math.floor(80 + fl * 100)},0,${alpha})`;
    ctx.beginPath(); ctx.arc(tsx, tsy - 5, 5 * fl, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,210,60,${alpha * 0.55})`;
    ctx.beginPath(); ctx.arc(tsx, tsy - 6, 2.5 * fl, 0, Math.PI * 2); ctx.fill();
  }
}

// ─── Player ──────────────────────────────────────────────────
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  player: PlayerState,
  frameCount: number,
): void {
  // Invincibility flicker
  if (player.invincible > 0 && frameCount % 6 < 3) return;

  const sx = player.x - camera.x;
  const sy = player.y - camera.y;

  // Low-health tremor: positional jitter increases as sanity drains
  const healthFrac = player.health / player.maxHealth;
  const tremorAmt  = healthFrac < 0.5 ? (1 - healthFrac * 2) * 1.6 : 0;
  const jx = (Math.random() - 0.5) * tremorAmt;
  const jy = (Math.random() - 0.5) * tremorAmt;

  // Idle breathing (subtle scale pulse)
  const breathe = 1 + Math.sin(frameCount * 0.07) * 0.025;

  // Lantern flicker — two overlapping sine waves for organic feel
  const lanternBright = 0.82 + Math.sin(frameCount * 0.13) * 0.14 + Math.sin(frameCount * 0.29) * 0.04;

  // Body tint desaturates slightly toward pale gray at low health
  const bodyHi = healthFrac > 0.5 ? '#9a7048' : '#8a6858';
  const bodyLo = healthFrac > 0.5 ? '#5a3a20' : '#3d2828';
  const headCol = healthFrac > 0.5 ? '#c09060' : '#a07870';

  ctx.save();
  ctx.translate(sx + jx, sy + jy);
  ctx.rotate(player.angle + Math.PI / 2); // flashlight direction → -Y axis in local space
  ctx.scale(breathe, breathe);

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 7, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body — egg silhouette: narrow at head-end (-Y), wide at shoulders (+Y)
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.bezierCurveTo( 5.5, -3,  6.2,  4,  4.5,  8);
  ctx.bezierCurveTo( 2.5, 10.5, -2.5, 10.5, -4.5, 8);
  ctx.bezierCurveTo(-6.2,  4, -5.5, -3,  0,  -5);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(0, -5, 0, 10);
  bodyGrad.addColorStop(0, bodyHi);
  bodyGrad.addColorStop(1, bodyLo);
  ctx.fillStyle   = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,8,2,0.65)';
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  // Arm — right shoulder curving forward to lantern hand
  ctx.strokeStyle = '#7a5030';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(3.5, -1.5);
  ctx.quadraticCurveTo(2, -7, 0.5, -14);
  ctx.stroke();

  // Lantern body
  ctx.fillStyle   = '#2e1a06';
  ctx.fillRect(-2.5, -17, 5, 5);
  ctx.strokeStyle = '#5a3a14';
  ctx.lineWidth   = 0.8;
  ctx.strokeRect(-2.5, -17, 5, 5);

  // Lantern warm halo
  const glowR = 9 * lanternBright;
  const lg    = ctx.createRadialGradient(0, -14.5, 0, 0, -14.5, glowR);
  lg.addColorStop(0,    `rgba(255,215,70,${0.9  * lanternBright})`);
  lg.addColorStop(0.35, `rgba(255,130,20,${0.45 * lanternBright})`);
  lg.addColorStop(1,    'rgba(255,60,0,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(0, -14.5, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Lantern core hotspot
  ctx.fillStyle = `rgba(255,245,180,${lanternBright})`;
  ctx.beginPath();
  ctx.arc(0, -14.5, 2, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle   = headCol;
  ctx.beginPath();
  ctx.arc(0, -8.5, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,18,5,0.6)';
  ctx.lineWidth   = 0.7;
  ctx.stroke();

  ctx.restore();
}

// ─── Lighting ────────────────────────────────────────────────
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  lightCtx: CanvasRenderingContext2D,
  lightCanvas: HTMLCanvasElement,
  camera: CameraState,
  player: PlayerState,
  torches: Torch[],
  enemies: IEnemy[],
  wallSegments: Segment[],
  flashAngle: number,
  canvasW: number, canvasH: number,
): void {
  lightCtx.clearRect(0, 0, canvasW, canvasH);
  lightCtx.fillStyle = 'rgba(0,0,0,0.91)';
  lightCtx.fillRect(0, 0, canvasW, canvasH);
  lightCtx.globalCompositeOperation = 'destination-out';

  const psx = player.x - camera.x, psy = player.y - camera.y;
  const toSX = (wx: number) => wx - camera.x;
  const toSY = (wy: number) => wy - camera.y;

  // Ambient glow
  const ag = lightCtx.createRadialGradient(psx, psy, 0, psx, psy, AMBIENT_RADIUS);
  ag.addColorStop(0,   'rgba(0,0,0,0.7)');
  ag.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  ag.addColorStop(1,   'rgba(0,0,0,0)');
  lightCtx.fillStyle = ag;
  lightCtx.fillRect(psx - AMBIENT_RADIUS, psy - AMBIENT_RADIUS, AMBIENT_RADIUS * 2, AMBIENT_RADIUS * 2);

  // Flashlight cone
  const cl        = FLASH_RANGE * (1 + (Math.random() - 0.5) * 0.04);
  const flashPoly = computeVisibilityPoly(wallSegments, player.x, player.y, cl, true, flashAngle, FLASH_HALF_ANGLE);
  const cg        = lightCtx.createRadialGradient(psx, psy, 0, psx, psy, cl);
  cg.addColorStop(0,    'rgba(0,0,0,1)');
  cg.addColorStop(0.55, 'rgba(0,0,0,0.95)');
  cg.addColorStop(0.82, 'rgba(0,0,0,0.55)');
  cg.addColorStop(1,    'rgba(0,0,0,0)');
  drawVisibilityPoly(lightCtx, flashPoly, cl, psx, psy, cg, toSX, toSY);

  // Torches
  for (const t of torches) {
    const tsx = toSX(t.x), tsy = toSY(t.y);
    if (tsx < -120 || tsx > canvasW + 120 || tsy < -120 || tsy > canvasH + 120) continue;
    t.phase += 0.09;
    const fl  = t.intensity + Math.sin(t.phase) * 0.15 + Math.sin(t.phase * 2.3) * 0.08;
    const rad = 58 * fl;
    const tg  = lightCtx.createRadialGradient(tsx, tsy, 0, tsx, tsy, rad);
    tg.addColorStop(0,   'rgba(0,0,0,0.55)');
    tg.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    tg.addColorStop(1,   'rgba(0,0,0,0)');
    lightCtx.fillStyle = tg;
    lightCtx.fillRect(tsx - rad, tsy - rad, rad * 2, rad * 2);
  }

  // Enemy eye glow bleeds through darkness
  for (const e of enemies) {
    if (e.state === 'frozen') continue;
    const sx = e.sx, sy = e.sy;
    if (sx < -40 || sx > canvasW + 40 || sy < -40 || sy > canvasH + 40) continue;
    const eg = lightCtx.createRadialGradient(sx, sy, 0, sx, sy, 14);
    eg.addColorStop(0, 'rgba(0,0,0,0.18)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = eg;
    lightCtx.beginPath(); lightCtx.arc(sx, sy, 14, 0, Math.PI * 2); lightCtx.fill();
  }

  lightCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCanvas, 0, 0);
}

// ─── Joystick HUD ────────────────────────────────────────────
export function drawJoysticks(
  ctx: CanvasRenderingContext2D,
  input: InputState,
): void {
  for (const side of ['left', 'right'] as const) {
    const stick = input.sticks[side];
    if (stick.id === null) continue;
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, STICK_MAX, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    const tx = stick.ox + stick.dx * STICK_MAX;
    const ty = stick.oy + stick.dy * STICK_MAX;
    ctx.beginPath();
    ctx.arc(tx, ty, 22, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }
}
