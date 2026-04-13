// ============================================================
// Raycasting & visibility polygon — pure functions, no side-effects
// ============================================================

import type { Segment, Vec2 } from './types.js';

// Returns parametric t of ray (ox,oy)+(dx,dy)*t hitting segment (ax,ay)-(bx,by), or Infinity
export function raySegIntersect(
  ox: number, oy: number, dx: number, dy: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const segDx = bx - ax, segDy = by - ay;
  const denom = dx * segDy - dy * segDx;
  if (Math.abs(denom) < 1e-10) return Infinity;
  const t = ((ax - ox) * segDy - (ay - oy) * segDx) / denom;
  const u = ((ax - ox) * dy   - (ay - oy) * dx)    / denom;
  if (t < -1e-9 || u < -1e-9 || u > 1 + 1e-9) return Infinity;
  return t;
}

// Fast AABB reject: is segment (x1,y1)-(x2,y2) within maxR of point (lx,ly)?
export function segInRange(
  lx: number, ly: number, maxR: number,
  x1: number, y1: number, x2: number, y2: number,
): boolean {
  return lx >= Math.min(x1, x2) - maxR && lx <= Math.max(x1, x2) + maxR &&
         ly >= Math.min(y1, y2) - maxR && ly <= Math.max(y1, y2) + maxR;
}

// True if there is a clear line-of-sight between world points (ax,ay) and (bx,by)
export function hasLOS(
  wallSegments: Segment[],
  ax: number, ay: number,
  bx: number, by: number,
): boolean {
  const dx = bx - ax, dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return true;
  const udx = dx / dist, udy = dy / dist;
  const midX = (ax + bx) / 2, midY = (ay + by) / 2;
  for (const s of wallSegments) {
    if (!segInRange(midX, midY, dist / 2 + 1, s.x1, s.y1, s.x2, s.y2)) continue;
    const t = raySegIntersect(ax, ay, udx, udy, s.x1, s.y1, s.x2, s.y2);
    if (t > 0.5 && t < dist - 0.5) return false;
  }
  return true;
}

// Build visibility polygon for light at world (lx,ly) with radius maxR.
// isCone=true restricts to cone [coneCenter±coneHalf]. Returns [{x,y}] in world space.
export function computeVisibilityPoly(
  wallSegments: Segment[],
  lx: number, ly: number,
  maxR: number,
  isCone: boolean,
  coneCenter = 0,
  coneHalf = 0,
): Vec2[] {
  const EPS      = 0.00015;
  const ARC_STEP = 0.15;

  // Gather segments and corners within range
  const localSegs: Segment[] = [];
  const localCorners: Vec2[] = [];
  const seenC = new Map<string, true>();
  for (const s of wallSegments) {
    if (!segInRange(lx, ly, maxR, s.x1, s.y1, s.x2, s.y2)) continue;
    localSegs.push(s);
    for (const [cx, cy] of [[s.x1, s.y1], [s.x2, s.y2]] as [number, number][]) {
      const key = cx + ',' + cy;
      if (!seenC.has(key)) { seenC.set(key, true); localCorners.push({ x: cx, y: cy }); }
    }
  }

  // Normalize angle relative to cone center (or to [-PI,PI] for full circle)
  const normAngle = isCone
    ? (a: number) => {
        let d = a - coneCenter;
        while (d >  Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return coneCenter + d;
      }
    : (a: number) => {
        while (a >  Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
      };

  // Build angle list from wall corners (+ epsilon offsets for crisp shadow edges)
  const angles: number[] = [];
  if (isCone) {
    angles.push(coneCenter - coneHalf, coneCenter + coneHalf);
  }
  for (const c of localCorners) {
    const base = Math.atan2(c.y - ly, c.x - lx);
    const na   = normAngle(base);
    if (isCone && Math.abs(na - coneCenter) > coneHalf + EPS * 2) continue;
    angles.push(na - EPS, na, na + EPS);
  }
  // Fill arc boundary with regular samples so max-radius arcs are smooth
  if (isCone) {
    for (let a = coneCenter - coneHalf; a <= coneCenter + coneHalf; a += ARC_STEP) angles.push(a);
  } else {
    for (let a = -Math.PI; a < Math.PI; a += ARC_STEP) angles.push(a);
  }
  angles.sort((a, b) => a - b);

  // Cast each ray and find the closest intersection
  const hits: { angle: number; x: number; y: number; atMax: boolean }[] = [];
  for (const angle of angles) {
    const clampedAngle = isCone
      ? Math.max(coneCenter - coneHalf, Math.min(coneCenter + coneHalf, angle))
      : angle;
    const dx = Math.cos(clampedAngle), dy = Math.sin(clampedAngle);
    let minT = maxR;
    for (const s of localSegs) {
      const t = raySegIntersect(lx, ly, dx, dy, s.x1, s.y1, s.x2, s.y2);
      if (t < minT) minT = t;
    }
    hits.push({ angle: clampedAngle, x: lx + dx * minT, y: ly + dy * minT, atMax: minT >= maxR - 0.5 });
  }

  // Build polygon, inserting arc interpolation between consecutive max-radius hits
  const poly: Vec2[] = [];
  if (isCone) poly.push({ x: lx, y: ly }); // sector origin
  for (let i = 0; i < hits.length; i++) {
    const h    = hits[i];
    poly.push({ x: h.x, y: h.y });
    const next = hits[(i + 1) % hits.length];
    if (h.atMax && next.atMax) {
      let a1 = h.angle, a2 = next.angle;
      let da = a2 - a1;
      if (!isCone && da < 0) da += 2 * Math.PI;
      if (da > 0) {
        const steps = Math.ceil(da / ARC_STEP);
        for (let j = 1; j < steps; j++) {
          const a = a1 + da * j / steps;
          poly.push({ x: lx + Math.cos(a) * maxR, y: ly + Math.sin(a) * maxR });
        }
      }
    }
  }
  return poly;
}

// Clip lightCtx to visibility polygon (world space) then fill with gradient (screen space).
// wx/wy are world-to-screen conversion functions passed in to avoid importing renderer.
export function drawVisibilityPoly(
  lightCtx: CanvasRenderingContext2D,
  poly: Vec2[],
  maxR: number,
  screenLx: number,
  screenLy: number,
  gradient: CanvasGradient,
  toScreenX: (wx: number) => number,
  toScreenY: (wy: number) => number,
): void {
  if (poly.length < 3) return;
  lightCtx.save();
  lightCtx.beginPath();
  lightCtx.moveTo(toScreenX(poly[0].x), toScreenY(poly[0].y));
  for (let i = 1; i < poly.length; i++) {
    lightCtx.lineTo(toScreenX(poly[i].x), toScreenY(poly[i].y));
  }
  lightCtx.closePath();
  lightCtx.clip();
  lightCtx.fillStyle = gradient;
  lightCtx.fillRect(screenLx - maxR, screenLy - maxR, maxR * 2, maxR * 2);
  lightCtx.restore();
}
