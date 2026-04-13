// ============================================================
// Particle system — operates on the array passed in
// ============================================================

import type { Particle } from './types.js';

export function spawnParticles(
  particles: Particle[],
  x: number, y: number,
  color: string,
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    const a  = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1,
      decay: 0.03 + Math.random() * 0.04,
      size: 2 + Math.random() * 3,
      color,
    });
  }
}

export function updateParticles(particles: Particle[]): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x  += p.vx; p.y  += p.vy;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  toScreenX: (wx: number) => number,
  toScreenY: (wy: number) => number,
): void {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(toScreenX(p.x), toScreenY(p.y), p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
