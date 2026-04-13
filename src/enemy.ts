// ============================================================
// Enemy — AI, movement, rendering
// ============================================================

import type { EnemyState, EnemyType, IEnemy, SoundType, Segment, PlayerState, Particle } from './types.js';
import { TILE, FLASH_RANGE, FLASH_HALF_ANGLE } from './constants.js';
import { isSolid } from './map.js';
import { hasLOS } from './raycasting.js';
import { spawnParticles } from './particles.js';

// Everything Enemy needs from the outside world — wired at construction time.
// Using an interface (not a full GameContext import) to keep this module lean.
export interface EnemyContext {
  // Canvas
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  // Live state
  player: PlayerState;
  wallSegments: Segment[];
  particles: Particle[];
  flashAngle: () => number; // getter so Enemy always reads the current value
  // Screen-space helpers
  toScreenX: (wx: number) => number;
  toScreenY: (wy: number) => number;
  // Service callbacks
  playSound: (type: SoundType) => void;
  hitPlayer: () => void;
}

export class Enemy implements IEnemy {
  x: number;
  y: number;
  type: EnemyType;
  radius: number;
  speed: number;
  state: EnemyState;
  angle: number;
  roamTimer: number;
  frozenCD: number;
  glowPhase: number;

  private ec: EnemyContext;

  constructor(x: number, y: number, type: EnemyType, ec: EnemyContext) {
    this.x = x; this.y = y; this.type = type;
    this.ec       = ec;
    this.radius   = 15;
    this.speed    = type === 'rusher' ? 3.8 : 2.0;
    this.state    = 'roaming';
    this.angle    = Math.random() * Math.PI * 2;
    this.roamTimer = 60 + Math.random() * 120;
    this.frozenCD  = 0;
    this.glowPhase = Math.random() * Math.PI * 2;
  }

  get sx(): number { return this.ec.toScreenX(this.x); }
  get sy(): number { return this.ec.toScreenY(this.y); }

  private isIlluminated(): boolean {
    const { player, flashAngle } = this.ec;
    const psx = this.ec.toScreenX(player.x), psy = this.ec.toScreenY(player.y);
    const dx = this.sx - psx, dy = this.sy - psy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Flashlight cone check
    const ang  = Math.atan2(dy, dx);
    let diff   = ang - flashAngle();
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (dist < FLASH_RANGE && Math.abs(diff) < FLASH_HALF_ANGLE) {
      return hasLOS(this.ec.wallSegments, player.x, player.y, this.x, this.y);
    }
    return false;
  }

  update(): void {
    this.glowPhase += 0.06;
    this.frozenCD = Math.max(0, this.frozenCD - 1);

    if (this.isIlluminated()) {
      this.state    = 'frozen';
      this.frozenCD = 50;
    } else if (this.frozenCD > 0) {
      this.state = 'frozen'; // grace period
    } else {
      if (this.state === 'frozen') {
        this.state = 'rushing';
        this.ec.playSound('growl');
      }
      const { player } = this.ec;
      if (this.state === 'rushing') {
        this.moveTo(player.x, player.y, this.speed * 1.7);
      } else {
        this.roamTimer--;
        if (this.roamTimer <= 0) {
          this.angle     = Math.random() * Math.PI * 2;
          this.roamTimer = 60 + Math.random() * 120;
        }
        this.moveDir(this.angle, this.speed * 0.65);
        const ddx = player.x - this.x, ddy = player.y - this.y;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < 280) {
          this.moveTo(player.x, player.y, this.speed * 0.35);
        }
      }
    }

    // Hit player
    const { player } = this.ec;
    const dx = player.x - this.x, dy = player.y - this.y;
    if (Math.sqrt(dx * dx + dy * dy) < this.radius + player.radius) {
      spawnParticles(this.ec.particles, player.x, player.y, '#ff2200', 10);
      this.ec.hitPlayer();
    }
  }

  private moveTo(tx: number, ty: number, sp: number): void {
    const dx = tx - this.x, dy = ty - this.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) this.tryMove(dx / d * sp, dy / d * sp);
  }

  private moveDir(ang: number, sp: number): void {
    this.tryMove(Math.cos(ang) * sp, Math.sin(ang) * sp);
  }

  private tryMove(dx: number, dy: number): void {
    const r  = this.radius;
    const nx = this.x + dx, ny = this.y + dy;
    if (!isSolid(Math.floor((nx + r) / TILE), Math.floor(ny / TILE)) &&
        !isSolid(Math.floor((nx - r) / TILE), Math.floor(ny / TILE))) {
      this.x = nx;
    } else {
      this.angle += Math.PI / 2 + (Math.random() - 0.5);
    }
    if (!isSolid(Math.floor(nx / TILE), Math.floor((ny + r) / TILE)) &&
        !isSolid(Math.floor(nx / TILE), Math.floor((ny - r) / TILE))) {
      this.y = ny;
    } else {
      this.angle += Math.PI / 2 + (Math.random() - 0.5);
    }
  }

  draw(): void {
    const sx = this.sx, sy = this.sy;
    const { ctx, canvasW, canvasH } = this.ec;
    if (sx < -40 || sx > canvasW + 40 || sy < -40 || sy > canvasH + 40) return;
    const glow   = 0.65 + Math.sin(this.glowPhase) * 0.35;
    const eyeCol = this.type === 'rusher' ? '#ff4400' : '#bb00ff';

    ctx.save();
    ctx.translate(sx, sy);

    if (this.state === 'frozen') {
      ctx.beginPath(); ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = eyeCol + '66'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#e2d8f5';
      ctx.fill();
      ctx.strokeStyle = eyeCol; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = '#445'; ctx.lineWidth = 1.8;
      for (const [ex, ey] of [[-6, -3], [6, -3]] as [number, number][]) {
        ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke();
      }
    } else {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 2.5);
      gr.addColorStop(0, eyeCol + '55'); gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 2.5, 0, Math.PI * 2); ctx.fill();

      if (this.type === 'rusher' && this.state === 'rushing') {
        const spikes = 8;
        ctx.beginPath();
        for (let i = 0; i < spikes; i++) {
          const a     = (i / spikes) * Math.PI * 2;
          const inner = this.radius - 1;
          const outer = this.radius + 7 + Math.sin(this.glowPhase + i) * 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * outer, Math.sin(a) * outer);
          else         ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          const mid = a + Math.PI / spikes;
          ctx.lineTo(Math.cos(mid) * inner, Math.sin(mid) * inner);
        }
        ctx.closePath();
        ctx.fillStyle = eyeCol + '99';
        ctx.fill();
      }

      ctx.fillStyle = this.type === 'rusher' ? '#1f0800' : '#0d0020';
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = eyeCol; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle   = eyeCol;
      ctx.shadowColor = eyeCol;
      ctx.shadowBlur  = 12 * glow;
      ctx.beginPath();
      ctx.arc(-5, -2, this.type === 'rusher' ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.arc( 5, -2, this.type === 'rusher' ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
