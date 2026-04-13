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

    const glow = 0.65 + Math.sin(this.glowPhase) * 0.35;

    ctx.save();
    ctx.translate(sx, sy);
    if (this.type === 'stalker') {
      this.drawStalker(ctx, glow);
    } else {
      this.drawRusher(ctx, glow);
    }
    ctx.restore();
  }

  // ─── Stalker: floating asymmetric blob, 3 scattered eyes, 5 undulating tendrils ──
  private drawStalker(ctx: CanvasRenderingContext2D, glow: number): void {
    const phase  = this.glowPhase;
    const frozen = this.state === 'frozen';

    // Outer glow aura
    if (!frozen) {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      gr.addColorStop(0, `rgba(140,0,220,${0.18 * glow})`);
      gr.addColorStop(1, 'rgba(140,0,220,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
    }

    // Tendrils — 5 limbs radiating from the body
    const tendrilBases: [number, number][] = [
      [6, -7], [-7, -5], [9, 3], [-8, 5], [1, 10],
    ];
    ctx.lineCap = 'round';
    for (let i = 0; i < tendrilBases.length; i++) {
      const [bx, by] = tendrilBases[i];
      let ex: number, ey: number, ctrlX: number, ctrlY: number;
      if (frozen) {
        // Rigid, outstretched
        ex = bx * 2.0; ey = by * 2.0;
        ctrlX = bx * 1.0; ctrlY = by * 1.0;
        ctx.strokeStyle = 'rgba(180,150,215,0.55)';
      } else {
        const w1 = Math.sin(phase + i * 1.4) * 5;
        const w2 = Math.cos(phase * 0.8 + i * 1.1) * 4;
        ex = bx * 1.9 + w1; ey = by * 1.9 + w2;
        // When rushing, tendrils strain toward the player
        if (this.state === 'rushing') {
          const { player } = this.ec;
          const toPA = Math.atan2(player.y - this.y, player.x - this.x);
          ex += Math.cos(toPA) * 5; ey += Math.sin(toPA) * 5;
        }
        ctrlX = bx * 0.9 + w1 * 0.4; ctrlY = by * 0.9 + w2 * 0.4;
        ctx.strokeStyle = this.state === 'rushing'
          ? `rgba(180,0,255,${0.8 * glow})`
          : `rgba(140,0,220,${0.6 * glow})`;
      }
      ctx.lineWidth = 1.3 - i * 0.04;
      ctx.beginPath();
      ctx.moveTo(bx * 0.3, by * 0.3);
      ctx.quadraticCurveTo(ctrlX, ctrlY, ex, ey);
      ctx.stroke();
    }

    // Body — asymmetric blob (slightly wider on the right)
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.bezierCurveTo( 9, -9,  11,  3,  7, 10);
    ctx.bezierCurveTo( 3, 14,  -5, 13, -9,  8);
    ctx.bezierCurveTo(-13, 2, -10, -8,  0, -11);
    ctx.closePath();

    if (frozen) {
      ctx.fillStyle   = '#ddd0f5';
      ctx.fill();
      ctx.strokeStyle = '#9944cc';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      // X-eyes at the 3 scattered eye positions
      ctx.strokeStyle = '#557';
      ctx.lineWidth   = 1.4;
      for (const [xe, ye] of [[-4, -2], [4, -5], [1, 4]] as [number, number][]) {
        ctx.beginPath(); ctx.moveTo(xe - 2.5, ye - 2.5); ctx.lineTo(xe + 2.5, ye + 2.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xe + 2.5, ye - 2.5); ctx.lineTo(xe - 2.5, ye + 2.5); ctx.stroke();
      }
    } else {
      ctx.fillStyle   = '#0d0022';
      ctx.fill();
      ctx.strokeStyle = `rgba(150,0,230,${0.75 * glow})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      // 3 glowing eyes, scattered asymmetrically across the blob
      const eyes: [number, number, number][] = [[-4, -2, 2.8], [4, -5, 2.2], [1, 4, 1.9]];
      ctx.shadowColor = '#bb00ff';
      ctx.shadowBlur  = 10 * glow;
      ctx.fillStyle   = '#bb00ff';
      for (const [xe, ye, er] of eyes) {
        ctx.beginPath(); ctx.arc(xe, ye, er, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }

  // ─── Rusher: teardrop body facing movement angle, spikes, 2 prominent eyes ──
  private drawRusher(ctx: CanvasRenderingContext2D, glow: number): void {
    const phase   = this.glowPhase;
    const frozen  = this.state === 'frozen';
    const rushing = this.state === 'rushing';

    // Rotate entire body to face movement direction; -Y = forward (narrow tip)
    ctx.rotate(this.angle - Math.PI / 2);

    if (!frozen) {
      // Outer glow (biased toward the wide back end)
      const gr = ctx.createRadialGradient(0, 4, 0, 0, 4, 34);
      gr.addColorStop(0, `rgba(220,80,0,${0.2 * glow})`);
      gr.addColorStop(1, 'rgba(220,80,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 4, 34, 0, Math.PI * 2); ctx.fill();

      // Motion streaks trailing behind (+Y) when rushing
      if (rushing) {
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const alpha  = (0.5 - i * 0.1) * glow;
          const len    = 8 + i * 6;
          const spread = (i - 1.5) * 3.5;
          ctx.strokeStyle = `rgba(255,80,0,${alpha})`;
          ctx.lineWidth   = 2.5 - i * 0.4;
          ctx.beginPath();
          ctx.moveTo(spread * 0.3, 11);
          ctx.lineTo(spread, 11 + len);
          ctx.stroke();
        }
      }

      // Spikes — flare larger and brighter when rushing
      const spikeCount = 7;
      const outerR = rushing ? 18 + Math.sin(phase) * 2.5 : 15;
      const innerR = 10;
      ctx.beginPath();
      for (let i = 0; i < spikeCount; i++) {
        const a  = (i / spikeCount) * Math.PI * 2 - Math.PI / 2;
        const ao = a + Math.PI / spikeCount;
        ctx.lineTo(Math.cos(a) * outerR,  Math.sin(a) * outerR  + 2);
        ctx.lineTo(Math.cos(ao) * innerR, Math.sin(ao) * innerR + 2);
      }
      ctx.closePath();
      ctx.fillStyle = rushing
        ? `rgba(220,60,0,${0.65 * glow})`
        : `rgba(180,40,0,${0.35 * glow})`;
      ctx.fill();
    }

    // Body — teardrop: narrow tip at -Y (forward), wide at +Y (back)
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.bezierCurveTo( 8, -6,  12,  4,  10, 10);
    ctx.bezierCurveTo( 6, 14,  -6, 14, -10, 10);
    ctx.bezierCurveTo(-12,  4,  -8, -6,   0, -13);
    ctx.closePath();

    if (frozen) {
      ctx.fillStyle   = '#f0ddd0';
      ctx.fill();
      ctx.strokeStyle = '#cc4400';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      // X-eyes at the forward tip
      ctx.strokeStyle = '#667';
      ctx.lineWidth   = 1.8;
      for (const [xe, ye] of [[-4, -7], [4, -7]] as [number, number][]) {
        ctx.beginPath(); ctx.moveTo(xe - 3, ye - 3); ctx.lineTo(xe + 3, ye + 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xe + 3, ye - 3); ctx.lineTo(xe - 3, ye + 3); ctx.stroke();
      }
    } else {
      ctx.fillStyle   = '#1f0800';
      ctx.fill();
      ctx.strokeStyle = `rgba(255,80,0,${0.8 * glow})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      // Two large eyes near the forward tip; grow when rushing
      const eyeR = rushing ? 5 : 4;
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur  = 14 * glow;
      ctx.fillStyle   = '#ff4400';
      ctx.beginPath(); ctx.arc(-4, -7, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( 4, -7, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}
