// ============================================================
// LURKER — Top-down horror game with dynamic lighting
// ============================================================

import level1 from './levels/level1.json';
import level2 from './levels/level2.json';
import level3 from './levels/level3.json';

const LEVELS = [level1, level2, level3];
let currentLevelIndex = 0;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const lightCanvas = document.createElement('canvas');
const lightCtx = lightCanvas.getContext('2d');

let CANVAS_W = 800, CANVAS_H = 560;

function resize() {
  const vp = window.visualViewport;
  const viewW = vp ? vp.width : window.innerWidth;
  const viewH = vp ? vp.height : window.innerHeight;
  const W = Math.min(viewW, 700);
  const H = Math.min(viewH - 20, 440);
  canvas.width = W; canvas.height = H;
  lightCanvas.width = W; lightCanvas.height = H;
  CANVAS_W = W; CANVAS_H = H;
}
resize();
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ============================================================
// MAP  (0=floor, 1=wall, 2=exit)
// ============================================================
const TILE = 48;

let MAP_H_TILES = 0;
let MAP_W_TILES = 0;
let MAP = [];

function loadMap(levelData) {
  const rows = levelData.tiles;
  MAP_H_TILES = rows.length;
  MAP_W_TILES = rows[0].length;
  MAP = rows.map(row => row.split('').map(Number));
}

function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W_TILES || ty >= MAP_H_TILES) return 1;
  return MAP[ty][tx];
}
function isSolid(tx, ty) { return tileAt(tx, ty) === 1; }

// Wall segments cached at game start (world-pixel coords)
let wallSegments = []; // [{x1,y1,x2,y2}]
let wallCorners  = []; // [{x,y}] unique endpoints

// ============================================================
// INPUT
// ============================================================
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

let mouseX = CANVAS_W / 2, mouseY = CANVAS_H / 2;
let mouseActive = false;
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left;
  mouseY = e.clientY - r.top;
  mouseActive = true;
});

const STICK_MAX = 65;
const sticks = {
  left:  { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
  right: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
};
let flashAngle = 0;

function _stickFromTouch(stick, touch) {
  const r = canvas.getBoundingClientRect();
  const dx = touch.clientX - r.left - stick.ox;
  const dy = touch.clientY - r.top  - stick.oy;
  const dist = Math.sqrt(dx*dx + dy*dy);
  stick.dx = dist > 0 ? dx / Math.max(dist, STICK_MAX) : 0;
  stick.dy = dist > 0 ? dy / Math.max(dist, STICK_MAX) : 0;
}
function _clearStick(id) {
  for (const s of ['left', 'right']) {
    if (sticks[s].id === id) { sticks[s].id = null; sticks[s].dx = 0; sticks[s].dy = 0; }
  }
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  for (const t of e.changedTouches) {
    const cx = t.clientX - r.left;
    const side = cx < CANVAS_W / 2 ? 'left' : 'right';
    const st = sticks[side];
    if (st.id === null) {
      st.id = t.identifier; st.ox = cx; st.oy = t.clientY - r.top; st.dx = 0; st.dy = 0;
    }
  }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    for (const s of ['left', 'right']) {
      if (sticks[s].id === t.identifier) _stickFromTouch(sticks[s], t);
    }
  }
}, { passive: false });
canvas.addEventListener('touchend',    e => { e.preventDefault(); for (const t of e.changedTouches) _clearStick(t.identifier); }, { passive: false });
canvas.addEventListener('touchcancel', e => { e.preventDefault(); for (const t of e.changedTouches) _clearStick(t.identifier); }, { passive: false });

// ============================================================
// AUDIO
// ============================================================
let audioCtx = null;
let heartbeatTimer = null;

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, type, vol, dur, freqEnd) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + dur);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur);
  osc.start(); osc.stop(audioCtx.currentTime + dur);
}

function playNoise(vol, dur) {
  if (!audioCtx) return;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur);
  src.connect(gain); gain.connect(audioCtx.destination);
  src.start(); src.stop(audioCtx.currentTime + dur);
}

function playSound(type) {
  if (!audioCtx) return;
  if (type === 'heartbeat') {
    playTone(58, 'sine', 0.28, 0.25, 38);
  } else if (type === 'jumpscare') {
    playTone(900, 'sawtooth', 0.7, 0.45, 180);
    playNoise(0.45, 0.3);
  } else if (type === 'growl') {
    playTone(80, 'sawtooth', 0.12, 0.4, 55);
  } else if (type === 'footstep') {
    playTone(110, 'sine', 0.04, 0.07);
  } else if (type === 'win') {
    [440, 554, 659, 880].forEach((f, i) => {
      setTimeout(() => playTone(f, 'sine', 0.28, 0.5), i * 150);
    });
  }
}

function startHeartbeat(fast) {
  stopHeartbeat();
  const ms = fast ? 380 : 860;
  heartbeatTimer = setInterval(() => {
    playSound('heartbeat');
    setTimeout(() => playSound('heartbeat'), 140);
  }, ms);
}
function stopHeartbeat() { clearInterval(heartbeatTimer); }

// ============================================================
// CAMERA
// ============================================================
const camera = { x: 0, y: 0 };
function camUpdate() {
  camera.x = player.x - CANVAS_W / 2;
  camera.y = player.y - CANVAS_H / 2;
  camera.x = Math.max(0, Math.min(camera.x, MAP_W_TILES * TILE - CANVAS_W));
  camera.y = Math.max(0, Math.min(camera.y, MAP_H_TILES * TILE - CANVAS_H));
}
function wx(wx) { return wx - camera.x; }
function wy(wy) { return wy - camera.y; }

// ============================================================
// PLAYER
// ============================================================
const player = {
  x: 72, y: 72,
  speed: 3, radius: 17,
  health: 100, maxHealth: 100,
  angle: 0,
  invincible: 0,
  stepTimer: 0,
};

function updateFlashAngle() {
  if (sticks.right.id !== null && (sticks.right.dx || sticks.right.dy)) {
    flashAngle = Math.atan2(sticks.right.dy, sticks.right.dx);
  } else if (mouseActive) {
    flashAngle = Math.atan2(mouseY - wy(player.y), mouseX - wx(player.x));
  }
  // Otherwise preserve the last known angle (left stick never overrides aim)
}

function updatePlayer() {
  let dx = 0, dy = 0;
  if (sticks.left.id !== null) {
    dx = sticks.left.dx;
    dy = sticks.left.dy;
  } else {
    if (keys['KeyW'] || keys['ArrowUp'])    dy = -1;
    if (keys['KeyS'] || keys['ArrowDown'])  dy =  1;
    if (keys['KeyA'] || keys['ArrowLeft'])  dx = -1;
    if (keys['KeyD'] || keys['ArrowRight']) dx =  1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  }

  const sp = player.speed;
  const r  = player.radius;

  // Horizontal
  if (dx) {
    const nx = player.x + dx * sp;
    const ex = dx > 0 ? nx + r : nx - r;
    if (!isSolid(Math.floor(ex/TILE), Math.floor((player.y-r+1)/TILE)) &&
        !isSolid(Math.floor(ex/TILE), Math.floor((player.y+r-1)/TILE))) {
      player.x = nx;
    }
  }
  // Vertical
  if (dy) {
    const ny = player.y + dy * sp;
    const ey = dy > 0 ? ny + r : ny - r;
    if (!isSolid(Math.floor((player.x-r+1)/TILE), Math.floor(ey/TILE)) &&
        !isSolid(Math.floor((player.x+r-1)/TILE), Math.floor(ey/TILE))) {
      player.y = ny;
    }
  }

  updateFlashAngle();
  player.angle = flashAngle;
  if (player.invincible > 0) player.invincible--;

  if (dx || dy) {
    player.stepTimer++;
    if (player.stepTimer >= 22) { playSound('footstep'); player.stepTimer = 0; }
  }

  // Win check
  if (tileAt(Math.floor(player.x/TILE), Math.floor(player.y/TILE)) === 2 && gameState === 'playing') {
    triggerWin();
  }
}

function hitPlayer() {
  if (player.invincible > 0) return;
  player.health = Math.max(0, player.health - 25);
  player.invincible = 90;
  shakeMag = 14;
  playSound('jumpscare');
  const fl = document.getElementById('flash');
  fl.style.opacity = '0.75';
  setTimeout(() => fl.style.opacity = '0', 180);
  document.getElementById('health-fill').style.width = (player.health / player.maxHealth * 100) + '%';
  if (player.health <= 50) startHeartbeat(true);
  if (player.health <= 0) triggerDeath();
}

// ============================================================
// PARTICLES
// ============================================================
const particles = [];
function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
    particles.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
      life: 1, decay: 0.03 + Math.random()*0.04, size: 2+Math.random()*3, color });
  }
}
function updateParticles() {
  for (let i = particles.length-1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(wx(p.x), wy(p.y), p.size, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ============================================================
// ENEMIES
// ============================================================
class Enemy {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.radius = 15;
    this.speed = type === 'rusher' ? 3.8 : 2.0;
    this.state = 'roaming'; // roaming | frozen | rushing
    this.angle = Math.random() * Math.PI * 2;
    this.roamTimer = 60 + Math.random() * 120;
    this.frozenCD = 0;
    this.glowPhase = Math.random() * Math.PI * 2;
  }

  get sx() { return wx(this.x); }
  get sy() { return wy(this.y); }

  isIlluminated() {
    const psx = wx(player.x), psy = wy(player.y);
    const dx = this.sx - psx, dy = this.sy - psy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    // Ambient glow range — check wall occlusion
    if (dist < 60) return hasLOS(player.x, player.y, this.x, this.y);
    // Flashlight cone range — check angle then wall occlusion
    const ang = Math.atan2(dy, dx);
    let diff = ang - flashAngle;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (dist < 340 && Math.abs(diff) < Math.PI / 3.5)
      return hasLOS(player.x, player.y, this.x, this.y);
    return false;
  }

  update() {
    this.glowPhase += 0.06;
    this.frozenCD = Math.max(0, this.frozenCD - 1);

    if (this.isIlluminated()) {
      this.state = 'frozen';
      this.frozenCD = 50;
    } else if (this.frozenCD > 0) {
      this.state = 'frozen'; // grace period
    } else {
      if (this.state === 'frozen') {
        this.state = 'rushing';
        playSound('growl');
      }
      if (this.state === 'rushing') {
        this.moveTo(player.x, player.y, this.speed * 1.7);
      } else {
        this.roamTimer--;
        if (this.roamTimer <= 0) {
          this.angle = Math.random() * Math.PI * 2;
          this.roamTimer = 60 + Math.random() * 120;
        }
        this.moveDir(this.angle, this.speed * 0.65);
        const ddx = player.x - this.x, ddy = player.y - this.y;
        if (Math.sqrt(ddx*ddx+ddy*ddy) < 280) this.moveTo(player.x, player.y, this.speed * 0.35);
      }
    }

    // Hit player
    const dx = player.x-this.x, dy = player.y-this.y;
    if (Math.sqrt(dx*dx+dy*dy) < this.radius + player.radius) {
      spawnParticles(player.x, player.y, '#ff2200', 10);
      hitPlayer();
    }
  }

  moveTo(tx, ty, sp) {
    const dx = tx-this.x, dy = ty-this.y;
    const d = Math.sqrt(dx*dx+dy*dy);
    if (d > 1) this.tryMove(dx/d*sp, dy/d*sp);
  }

  moveDir(ang, sp) { this.tryMove(Math.cos(ang)*sp, Math.sin(ang)*sp); }

  tryMove(dx, dy) {
    const r = this.radius;
    const nx = this.x + dx, ny = this.y + dy;
    if (!isSolid(Math.floor((nx+r)/TILE), Math.floor(ny/TILE)) &&
        !isSolid(Math.floor((nx-r)/TILE), Math.floor(ny/TILE))) {
      this.x = nx;
    } else { this.angle += Math.PI/2 + (Math.random()-0.5); }
    if (!isSolid(Math.floor(nx/TILE), Math.floor((ny+r)/TILE)) &&
        !isSolid(Math.floor(nx/TILE), Math.floor((ny-r)/TILE))) {
      this.y = ny;
    } else { this.angle += Math.PI/2 + (Math.random()-0.5); }
  }

  draw() {
    const sx = this.sx, sy = this.sy;
    if (sx < -40 || sx > CANVAS_W+40 || sy < -40 || sy > CANVAS_H+40) return;
    const glow = 0.65 + Math.sin(this.glowPhase) * 0.35;
    const eyeCol = this.type === 'rusher' ? '#ff4400' : '#bb00ff';

    ctx.save();
    ctx.translate(sx, sy);

    if (this.state === 'frozen') {
      // Outer pulse ring
      ctx.beginPath(); ctx.arc(0, 0, this.radius + 5, 0, Math.PI*2);
      ctx.strokeStyle = eyeCol + '66'; ctx.lineWidth = 2; ctx.stroke();
      // Bright pale body — high contrast against dark floor
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2);
      ctx.fillStyle = '#e2d8f5';
      ctx.fill();
      // Thick colored border
      ctx.strokeStyle = eyeCol; ctx.lineWidth = 2.5; ctx.stroke();
      // X-eyes (stunned/frozen)
      ctx.strokeStyle = '#445'; ctx.lineWidth = 1.8;
      [[-6, -3], [6, -3]].forEach(([ex, ey]) => {
        ctx.beginPath(); ctx.moveTo(ex-3, ey-3); ctx.lineTo(ex+3, ey+3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex+3, ey-3); ctx.lineTo(ex-3, ey+3); ctx.stroke();
      });
    } else {
      // Glow halo
      const gr = ctx.createRadialGradient(0,0,0, 0,0, this.radius*2.5);
      gr.addColorStop(0, eyeCol+'55'); gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, this.radius*2.5, 0, Math.PI*2); ctx.fill();
      // Spikes on rusher when charging
      if (this.type === 'rusher' && this.state === 'rushing') {
        const spikes = 8;
        ctx.beginPath();
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          const inner = this.radius - 1;
          const outer = this.radius + 7 + Math.sin(this.glowPhase + i) * 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * outer, Math.sin(a) * outer);
          else ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          const mid = a + Math.PI / spikes;
          ctx.lineTo(Math.cos(mid) * inner, Math.sin(mid) * inner);
        }
        ctx.closePath();
        ctx.fillStyle = eyeCol + '99';
        ctx.fill();
      }
      // Body
      ctx.fillStyle = this.type === 'rusher' ? '#1f0800' : '#0d0020';
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
      // Colored outline
      ctx.strokeStyle = eyeCol; ctx.lineWidth = 1.5; ctx.stroke();
      // Eyes
      ctx.fillStyle = eyeCol;
      ctx.shadowColor = eyeCol; ctx.shadowBlur = 12 * glow;
      ctx.beginPath();
      ctx.arc(-5, -2, this.type === 'rusher' ? 4.5 : 3.5, 0, Math.PI*2);
      ctx.arc( 5, -2, this.type === 'rusher' ? 4.5 : 3.5, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ============================================================
// TORCHES
// ============================================================
let torches = [];
function buildTorches() {
  torches = [];
  for (let ty = 0; ty < MAP_H_TILES; ty++) {
    for (let tx = 0; tx < MAP_W_TILES; tx++) {
      if (MAP[ty][tx] === 1) {
        const adj = [tileAt(tx-1,ty),tileAt(tx+1,ty),tileAt(tx,ty-1),tileAt(tx,ty+1)];
        if (adj.some(t => t===0||t===2) && Math.random() < 0.07) {
          torches.push({
            x: tx*TILE + TILE/2, y: ty*TILE + TILE/2,
            phase: Math.random()*Math.PI*2,
            intensity: 0.6 + Math.random()*0.4
          });
        }
      }
    }
  }
}

function buildWallSegments() {
  wallSegments = [];
  // Horizontal segments: sweep each row for top-face and bottom-face runs
  for (let ty = 0; ty < MAP_H_TILES; ty++) {
    let runStart = -1;
    for (let tx = 0; tx <= MAP_W_TILES; tx++) {
      const active = tx < MAP_W_TILES && isSolid(tx, ty) && !isSolid(tx, ty - 1);
      if (active && runStart < 0) { runStart = tx; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: runStart*TILE, y1: ty*TILE, x2: tx*TILE, y2: ty*TILE });
        runStart = -1;
      }
    }
    runStart = -1;
    for (let tx = 0; tx <= MAP_W_TILES; tx++) {
      const active = tx < MAP_W_TILES && isSolid(tx, ty) && !isSolid(tx, ty + 1);
      if (active && runStart < 0) { runStart = tx; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: runStart*TILE, y1: (ty+1)*TILE, x2: tx*TILE, y2: (ty+1)*TILE });
        runStart = -1;
      }
    }
  }
  // Vertical segments: sweep each column for left-face and right-face runs
  for (let tx = 0; tx < MAP_W_TILES; tx++) {
    let runStart = -1;
    for (let ty = 0; ty <= MAP_H_TILES; ty++) {
      const active = ty < MAP_H_TILES && isSolid(tx, ty) && !isSolid(tx - 1, ty);
      if (active && runStart < 0) { runStart = ty; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: tx*TILE, y1: runStart*TILE, x2: tx*TILE, y2: ty*TILE });
        runStart = -1;
      }
    }
    runStart = -1;
    for (let ty = 0; ty <= MAP_H_TILES; ty++) {
      const active = ty < MAP_H_TILES && isSolid(tx, ty) && !isSolid(tx + 1, ty);
      if (active && runStart < 0) { runStart = ty; }
      else if (!active && runStart >= 0) {
        wallSegments.push({ x1: (tx+1)*TILE, y1: runStart*TILE, x2: (tx+1)*TILE, y2: ty*TILE });
        runStart = -1;
      }
    }
  }
  // Collect unique corners from all segments
  wallCorners = [];
  const seen = new Map();
  for (const s of wallSegments) {
    const k1 = s.x1 + ',' + s.y1, k2 = s.x2 + ',' + s.y2;
    if (!seen.has(k1)) { seen.set(k1, true); wallCorners.push({ x: s.x1, y: s.y1 }); }
    if (!seen.has(k2)) { seen.set(k2, true); wallCorners.push({ x: s.x2, y: s.y2 }); }
  }
}

// ============================================================
// SHADOW / RAYCASTING HELPERS
// ============================================================

// Returns parametric t of ray (ox,oy)+(dx,dy)*t hitting segment (ax,ay)-(bx,by), or Infinity
function raySegIntersect(ox, oy, dx, dy, ax, ay, bx, by) {
  const segDx = bx - ax, segDy = by - ay;
  const denom = dx * segDy - dy * segDx;
  if (Math.abs(denom) < 1e-10) return Infinity;
  const t = ((ax - ox) * segDy - (ay - oy) * segDx) / denom;
  const u = ((ax - ox) * dy   - (ay - oy) * dx)    / denom;
  if (t < -1e-9 || u < -1e-9 || u > 1 + 1e-9) return Infinity;
  return t;
}

// Fast AABB reject: is segment (x1,y1)-(x2,y2) within maxR of point (lx,ly)?
function segInRange(lx, ly, maxR, x1, y1, x2, y2) {
  return lx >= Math.min(x1, x2) - maxR && lx <= Math.max(x1, x2) + maxR &&
         ly >= Math.min(y1, y2) - maxR && ly <= Math.max(y1, y2) + maxR;
}

// True if there is a clear line-of-sight between world points (ax,ay) and (bx,by)
function hasLOS(ax, ay, bx, by) {
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
function computeVisibilityPoly(lx, ly, maxR, isCone, coneCenter, coneHalf) {
  const EPS = 0.00015;
  const ARC_STEP = 0.15;

  // Gather segments and corners within range
  const localSegs = [];
  const localCorners = [];
  const seenC = new Map();
  for (const s of wallSegments) {
    if (!segInRange(lx, ly, maxR, s.x1, s.y1, s.x2, s.y2)) continue;
    localSegs.push(s);
    for (const [cx, cy] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const key = cx + ',' + cy;
      if (!seenC.has(key)) { seenC.set(key, true); localCorners.push({ x: cx, y: cy }); }
    }
  }

  // Normalize angle helper: keep in [-PI, PI] for full circle; within cone range for cone
  const normAngle = isCone
    ? (a) => { let d = a - coneCenter; while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI; return coneCenter + d; }
    : (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };

  // Build angle list from wall corners (+ epsilon offsets for crisp shadow edges)
  const angles = [];
  if (isCone) {
    angles.push(coneCenter - coneHalf, coneCenter + coneHalf);
  }
  for (const c of localCorners) {
    const base = Math.atan2(c.y - ly, c.x - lx);
    const na = normAngle(base);
    if (isCone && Math.abs(na - coneCenter) > coneHalf + EPS * 2) continue;
    angles.push(na - EPS, na, na + EPS);
  }
  // Fill in arc boundary with regular samples so max-radius arcs are smooth
  if (isCone) {
    for (let a = coneCenter - coneHalf; a <= coneCenter + coneHalf; a += ARC_STEP) angles.push(a);
  } else {
    for (let a = -Math.PI; a < Math.PI; a += ARC_STEP) angles.push(a);
  }
  angles.sort((a, b) => a - b);

  // Cast each ray and find the closest intersection
  const hits = [];
  for (const angle of angles) {
    // Clamp cone edges exactly
    const clampedAngle = isCone ? Math.max(coneCenter - coneHalf, Math.min(coneCenter + coneHalf, angle)) : angle;
    const dx = Math.cos(clampedAngle), dy = Math.sin(clampedAngle);
    let minT = maxR;
    for (const s of localSegs) {
      const t = raySegIntersect(lx, ly, dx, dy, s.x1, s.y1, s.x2, s.y2);
      if (t < minT) minT = t;
    }
    hits.push({ angle: clampedAngle, x: lx + dx * minT, y: ly + dy * minT, atMax: minT >= maxR - 0.5 });
  }

  // Build polygon, inserting arc interpolation between consecutive max-radius hits
  const poly = [];
  if (isCone) poly.push({ x: lx, y: ly }); // sector origin
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
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

// Clip lightCtx to visibility polygon (world space) then fill with gradient (screen space)
function drawVisibilityPoly(poly, maxR, screenLx, screenLy, gradient) {
  if (poly.length < 3) return;
  lightCtx.save();
  lightCtx.beginPath();
  lightCtx.moveTo(wx(poly[0].x), wy(poly[0].y));
  for (let i = 1; i < poly.length; i++) lightCtx.lineTo(wx(poly[i].x), wy(poly[i].y));
  lightCtx.closePath();
  lightCtx.clip();
  lightCtx.fillStyle = gradient;
  lightCtx.fillRect(screenLx - maxR, screenLy - maxR, maxR * 2, maxR * 2);
  lightCtx.restore();
}

// ============================================================
// LIGHTING
// ============================================================
function drawLighting() {
  lightCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  lightCtx.fillStyle = 'rgba(0,0,0,0.91)';
  lightCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  lightCtx.globalCompositeOperation = 'destination-out';

  const psx = wx(player.x), psy = wy(player.y);

  // Ambient glow — small radius, no occlusion needed
  const ag = lightCtx.createRadialGradient(psx, psy, 0, psx, psy, 60);
  ag.addColorStop(0, 'rgba(0,0,0,0.7)');
  ag.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  ag.addColorStop(1, 'rgba(0,0,0,0)');
  lightCtx.fillStyle = ag;
  lightCtx.fillRect(psx - 60, psy - 60, 120, 120);

  // Flashlight cone — wall-occluded visibility polygon
  const fa = flashAngle;
  const ca = Math.PI / 3.5;
  const cl = 340 * (1 + (Math.random()-0.5)*0.04);
  const flashPoly = computeVisibilityPoly(player.x, player.y, cl, true, fa, ca);
  const cg = lightCtx.createRadialGradient(psx, psy, 0, psx, psy, cl);
  cg.addColorStop(0,    'rgba(0,0,0,1)');
  cg.addColorStop(0.55, 'rgba(0,0,0,0.95)');
  cg.addColorStop(0.82, 'rgba(0,0,0,0.55)');
  cg.addColorStop(1,    'rgba(0,0,0,0)');
  drawVisibilityPoly(flashPoly, cl, psx, psy, cg);

  // Torches — simple radial gradient (fillRect avoids canvas-edge clipping).
  // Torches are placed at the centre of wall tiles so their origin is always
  // inside a wall; computeVisibilityPoly would clip to the wall's own face
  // segments, producing a polygon that never reaches the adjacent floor and
  // leaves corridors dark.  A plain fillRect lets the gradient bleed naturally
  // into the neighbouring floor tiles, which is the intended look.
  torches.forEach(t => {
    const tsx = wx(t.x), tsy = wy(t.y);
    if (tsx < -120 || tsx > CANVAS_W+120 || tsy < -120 || tsy > CANVAS_H+120) return;
    t.phase += 0.09;
    const fl = t.intensity + Math.sin(t.phase)*0.15 + Math.sin(t.phase*2.3)*0.08;
    const rad = 58 * fl;
    const tg = lightCtx.createRadialGradient(tsx, tsy, 0, tsx, tsy, rad);
    tg.addColorStop(0, 'rgba(0,0,0,0.55)');
    tg.addColorStop(0.5,'rgba(0,0,0,0.25)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = tg;
    lightCtx.fillRect(tsx - rad, tsy - rad, rad * 2, rad * 2);
  });

  // Enemy glowing eyes bleed through darkness (intentional horror mechanic)
  enemies.forEach(e => {
    if (e.state === 'frozen') return;
    const sx = e.sx, sy = e.sy;
    if (sx < -40 || sx > CANVAS_W+40 || sy < -40 || sy > CANVAS_H+40) return;
    const eg = lightCtx.createRadialGradient(sx,sy,0, sx,sy,14);
    eg.addColorStop(0, 'rgba(0,0,0,0.18)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = eg;
    lightCtx.beginPath(); lightCtx.arc(sx, sy, 14, 0, Math.PI*2); lightCtx.fill();
  });

  lightCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCanvas, 0, 0);
}

// ============================================================
// MAP DRAWING
// ============================================================
function drawMap() {
  const s0x = Math.max(0, Math.floor(camera.x/TILE));
  const e0x = Math.min(MAP_W_TILES, Math.ceil((camera.x+CANVAS_W)/TILE));
  const s0y = Math.max(0, Math.floor(camera.y/TILE));
  const e0y = Math.min(MAP_H_TILES, Math.ceil((camera.y+CANVAS_H)/TILE));

  for (let ty = s0y; ty < e0y; ty++) {
    for (let tx = s0x; tx < e0x; tx++) {
      const tile = MAP[ty][tx];
      const sx = wx(tx*TILE), sy = wy(ty*TILE);

      if (tile === 1) {
        // Wall — darker base with bevel edges to read as a raised block
        ctx.fillStyle = '#0f0d14';
        ctx.fillRect(sx, sy, TILE, TILE);
        // Stone texture detail rects
        ctx.fillStyle = '#171320';
        ctx.fillRect(sx+3, sy+3, TILE/2-4, TILE/3-2);
        ctx.fillRect(sx+TILE/2+2, sy+TILE/3+2, TILE/2-6, TILE/3-2);
        // Top & left bright bevel (raised-block highlight)
        ctx.strokeStyle = 'rgba(180,150,220,0.28)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy + TILE);
        ctx.lineTo(sx, sy);
        ctx.lineTo(sx + TILE, sy);
        ctx.stroke();
        // Bottom & right dark bevel (raised-block shadow)
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.moveTo(sx + TILE, sy);
        ctx.lineTo(sx + TILE, sy + TILE);
        ctx.lineTo(sx, sy + TILE);
        ctx.stroke();
      } else if (tile === 0) {
        // Floor — lighter/warmer purple, inset border to read as a recessed tile
        ctx.fillStyle = '#271d38';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = 'rgba(90,65,130,0.45)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      } else if (tile === 2) {
        ctx.fillStyle = '#081508';
        ctx.fillRect(sx, sy, TILE, TILE);
        const pulse = 0.5 + Math.sin(frameCount * 0.06) * 0.5;
        ctx.fillStyle = `rgba(0,${Math.floor(160*pulse)},0,0.35)`;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = `rgba(0,255,80,${0.6*pulse+0.2})`;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('EXIT', sx + TILE/2, sy + TILE/2 + 4);
      }
    }
  }
}

function drawTorches() {
  torches.forEach(t => {
    const tx = wx(t.x), ty = wy(t.y);
    if (tx < -60 || tx > CANVAS_W+60 || ty < -60 || ty > CANVAS_H+60) return;
    const fl = t.intensity + Math.sin(t.phase)*0.3;
    ctx.fillStyle = '#4a3010';
    ctx.fillRect(tx-2, ty-2, 5, 8);
    const alpha = 0.65 + Math.sin(t.phase*1.5)*0.3;
    ctx.fillStyle = `rgba(255,${Math.floor(80+fl*100)},0,${alpha})`;
    ctx.beginPath(); ctx.arc(tx, ty-5, 5*fl, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(255,210,60,${alpha*0.55})`;
    ctx.beginPath(); ctx.arc(tx, ty-6, 2.5*fl, 0, Math.PI*2); ctx.fill();
  });
}

function drawPlayer() {
  if (player.invincible > 0 && frameCount % 6 < 3) return;
  const sx = wx(player.x), sy = wy(player.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(sx+2, sy+5, player.radius*0.8, player.radius*0.4, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#c8a060';
  ctx.beginPath(); ctx.arc(sx, sy, player.radius, 0, Math.PI*2); ctx.fill();
  const fx = Math.cos(player.angle)*(player.radius+5), fy = Math.sin(player.angle)*(player.radius+5);
  ctx.fillStyle = '#ffee88';
  ctx.beginPath(); ctx.arc(sx+fx, sy+fy, 3.5, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#a07840'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(sx, sy, player.radius, 0, Math.PI*2); ctx.stroke();
}

// ============================================================
// SCREEN SHAKE
// ============================================================
let shakeMag = 0, shakeX = 0, shakeY = 0;
function updateShake() {
  if (shakeMag > 0.5) {
    shakeX = (Math.random()-0.5)*shakeMag;
    shakeY = (Math.random()-0.5)*shakeMag;
    shakeMag *= 0.82;
  } else { shakeX = 0; shakeY = 0; shakeMag = 0; }
}

// ============================================================
// GAME STATE
// ============================================================
let gameState = 'title';
let enemies = [];
let frameCount = 0;

function startLevel(levelIndex) {
  const levelData = LEVELS[levelIndex];
  currentLevelIndex = levelIndex;

  // Load map from level data
  loadMap(levelData);

  // Player start position (tile coords in JSON)
  player.x = levelData.playerStart[0] * TILE;
  player.y = levelData.playerStart[1] * TILE;
  player.health = 100; player.invincible = 0;
  document.getElementById('health-fill').style.width = '100%';
  particles.length = 0;

  // Spawn enemies from level data
  enemies = levelData.enemies.map(e =>
    new Enemy(e.tile[0] * TILE + TILE / 2, e.tile[1] * TILE + TILE / 2, e.type)
  );

  buildTorches();
  buildWallSegments();

  // Update level indicator
  document.getElementById('level-label').textContent = 'LEVEL ' + (levelIndex + 1);

  gameState = 'playing';
  startHeartbeat(false);
  requestAnimationFrame(gameLoop);
}

function startGame() {
  initAudio();
  currentLevelIndex = 0;
  showLevelIntro(0);
}

function showLevelIntro(levelIndex) {
  const levelData = LEVELS[levelIndex];
  const o = document.getElementById('overlay');
  o.innerHTML = `<h1 style="color:#609;text-shadow:0 0 40px #90f,0 0 80px #306">${levelData.name.toUpperCase()}</h1>
    <p class="sub" style="color:#555">Level ${levelIndex + 1} of ${LEVELS.length}</p>
    <p class="sub" style="color:#444;max-width:400px;text-align:center">${levelData.narrative}</p>
    <button id="levelStartBtn">ENTER THE DARK</button>`;
  o.style.display = 'flex';
  document.getElementById('levelStartBtn').addEventListener('click', () => {
    document.getElementById('overlay').style.display = 'none';
    startLevel(levelIndex);
  });
}

function triggerDeath() {
  gameState = 'gameover';
  stopHeartbeat();
  setTimeout(() => {
    const o = document.getElementById('overlay');
    o.innerHTML = `<h1 style="color:#800">YOU DIED</h1>
      <p class="sub" style="color:#600">They found you in the dark.</p>
      <p class="sub" style="color:#444">Level ${currentLevelIndex + 1} — ${LEVELS[currentLevelIndex].name}</p>
      <button id="retryBtn">TRY AGAIN</button>`;
    o.style.display = 'flex';
    document.getElementById('retryBtn').addEventListener('click', () => {
      document.getElementById('overlay').style.display = 'none';
      startLevel(currentLevelIndex);
    });
  }, 700);
}

function triggerWin() {
  gameState = 'win';
  stopHeartbeat();
  playSound('win');
  const isLastLevel = currentLevelIndex >= LEVELS.length - 1;
  setTimeout(() => {
    const o = document.getElementById('overlay');
    if (isLastLevel) {
      o.innerHTML = `<h1 style="color:#080;text-shadow:0 0 40px #0f0">ESCAPED</h1>
        <p class="sub" style="color:#050">You survived all ${LEVELS.length} levels.</p>
        <p class="sub" style="color:#333">The darkness retreats... for now.</p>
        <button id="replayBtn">PLAY AGAIN</button>`;
      o.style.display = 'flex';
      document.getElementById('replayBtn').addEventListener('click', () => {
        currentLevelIndex = 0;
        showLevelIntro(0);
      });
    } else {
      o.innerHTML = `<h1 style="color:#080;text-shadow:0 0 40px #0f0">ESCAPED</h1>
        <p class="sub" style="color:#050">You survived the dark.</p>
        <p class="sub" style="color:#333">...but something stirs deeper below.</p>
        <button id="nextLevelBtn">CONTINUE</button>`;
      o.style.display = 'flex';
      document.getElementById('nextLevelBtn').addEventListener('click', () => {
        showLevelIntro(currentLevelIndex + 1);
      });
    }
  }, 400);
}

// ============================================================
// JOYSTICK HUD
// ============================================================
function drawJoysticks() {
  for (const side of ['left', 'right']) {
    const stick = sticks[side];
    if (stick.id === null) continue;
    // Outer ring — filled base + stroke border
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, STICK_MAX, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Thumb dot — filled with an outline
    const tx = stick.ox + stick.dx * STICK_MAX;
    const ty = stick.oy + stick.dy * STICK_MAX;
    ctx.beginPath();
    ctx.arc(tx, ty, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop() {
  if (gameState !== 'playing') return;
  frameCount++;

  updatePlayer();
  camUpdate();
  enemies.forEach(e => e.update());
  updateParticles();
  updateShake();

  ctx.save();
  ctx.translate(shakeX, shakeY);

  ctx.fillStyle = '#040208';
  ctx.fillRect(-10, -10, CANVAS_W+20, CANVAS_H+20);

  drawMap();
  drawTorches();
  drawParticles();
  drawPlayer();
  enemies.forEach(e => e.draw());
  drawLighting();

  ctx.restore();

  drawJoysticks();

  // Edge vignette
  const vig = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, CANVAS_H*0.28, CANVAS_W/2, CANVAS_H/2, CANVAS_H*0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  requestAnimationFrame(gameLoop);
}

// ============================================================
// BOOT
// ============================================================
document.getElementById('startBtn').addEventListener('click', startGame);
