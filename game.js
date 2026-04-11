// ============================================================
// LURKER — Top-down horror game with dynamic lighting
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const lightCanvas = document.createElement('canvas');
const lightCtx = lightCanvas.getContext('2d');

let CANVAS_W = 800, CANVAS_H = 560;

function resize() {
  const W = Math.min(window.innerWidth, 900);
  const H = Math.min(window.innerHeight - 10, 580);
  canvas.width = W; canvas.height = H;
  lightCanvas.width = W; lightCanvas.height = H;
  CANVAS_W = W; CANVAS_H = H;
}
resize();
window.addEventListener('resize', resize);

// ============================================================
// MAP  (0=floor, 1=wall, 2=exit)
// ============================================================
const TILE = 48;

const MAP_RAW = [
  '1111111111111111111111111',
  '1000000001000000000000001',
  '1011111001011111011110101',
  '1010001000000001000010001',
  '1010111011110001011110001',
  '1000100010010001010000001',
  '1011101110011001010111101',
  '1000001000011000000000101',
  '1111001011111011111010101',
  '1000001000001000001010001',
  '1011111011001011001011101',
  '1010000000001000001000001',
  '1010111111011111101110111',
  '1000100000000000000000001',
  '1011101111101110111111101',
  '1000001000001000100000001',
  '1011011011111010101110001',
  '1000000000000000000000021',
];

const MAP_H_TILES = MAP_RAW.length;
const MAP_W_TILES = MAP_RAW[0].length;
const MAP = MAP_RAW.map(row => row.split('').map(Number));

function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W_TILES || ty >= MAP_H_TILES) return 1;
  return MAP[ty][tx];
}
function isSolid(tx, ty) { return tileAt(tx, ty) === 1; }

// ============================================================
// INPUT
// ============================================================
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

let mouseX = CANVAS_W / 2, mouseY = CANVAS_H / 2;
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left;
  mouseY = e.clientY - r.top;
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
  } else if (sticks.left.id !== null && (sticks.left.dx || sticks.left.dy)) {
    flashAngle = Math.atan2(sticks.left.dy, sticks.left.dx);
  } else {
    flashAngle = Math.atan2(mouseY - wy(player.y), mouseX - wx(player.x));
  }
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
    if (dist < 75) return true;
    const ang = Math.atan2(dy, dx);
    let diff = Math.abs(ang - flashAngle);
    if (diff > Math.PI) diff = Math.PI*2 - diff;
    return dist < 260 && diff < Math.PI / 4;
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
      ctx.fillStyle = '#3a3040';
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-7,-4); ctx.lineTo(-1,3); ctx.lineTo(-5,9);
      ctx.stroke();
    } else {
      // Glow halo
      const gr = ctx.createRadialGradient(0,0,0, 0,0, this.radius*2.2);
      gr.addColorStop(0, eyeCol+'33'); gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, this.radius*2.2, 0, Math.PI*2); ctx.fill();
      // Body
      ctx.fillStyle = '#120015';
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
      // Eyes
      ctx.fillStyle = eyeCol;
      ctx.shadowColor = eyeCol; ctx.shadowBlur = 10 * glow;
      ctx.beginPath();
      ctx.arc(-5, -2, 3.5, 0, Math.PI*2);
      ctx.arc( 5, -2, 3.5, 0, Math.PI*2);
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

// ============================================================
// LIGHTING
// ============================================================
function drawLighting() {
  lightCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  lightCtx.fillStyle = 'rgba(0,0,0,0.94)';
  lightCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  lightCtx.globalCompositeOperation = 'destination-out';

  const psx = wx(player.x), psy = wy(player.y);

  // Ambient glow
  const ag = lightCtx.createRadialGradient(psx, psy, 0, psx, psy, 82);
  ag.addColorStop(0, 'rgba(0,0,0,0.9)');
  ag.addColorStop(0.6, 'rgba(0,0,0,0.4)');
  ag.addColorStop(1, 'rgba(0,0,0,0)');
  lightCtx.fillStyle = ag;
  lightCtx.beginPath(); lightCtx.arc(psx, psy, 82, 0, Math.PI*2); lightCtx.fill();

  // Flashlight cone
  const fa = flashAngle;
  const ca = Math.PI / 4.5;
  const cl = 255 * (1 + (Math.random()-0.5)*0.04);

  lightCtx.save();
  lightCtx.beginPath();
  lightCtx.moveTo(psx, psy);
  lightCtx.arc(psx, psy, cl, fa - ca, fa + ca);
  lightCtx.closePath();
  lightCtx.clip();

  const cg = lightCtx.createRadialGradient(psx, psy, 0, psx, psy, cl);
  cg.addColorStop(0, 'rgba(0,0,0,1)');
  cg.addColorStop(0.5, 'rgba(0,0,0,0.65)');
  cg.addColorStop(0.85, 'rgba(0,0,0,0.25)');
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  lightCtx.fillStyle = cg;
  lightCtx.fillRect(psx-cl, psy-cl, cl*2, cl*2);
  lightCtx.restore();

  // Torches
  torches.forEach(t => {
    const tx = wx(t.x), ty = wy(t.y);
    if (tx < -120 || tx > CANVAS_W+120 || ty < -120 || ty > CANVAS_H+120) return;
    t.phase += 0.09;
    const fl = t.intensity + Math.sin(t.phase)*0.15 + Math.sin(t.phase*2.3)*0.08;
    const rad = 58 * fl;
    const tg = lightCtx.createRadialGradient(tx,ty,0, tx,ty,rad);
    tg.addColorStop(0, 'rgba(0,0,0,0.55)');
    tg.addColorStop(0.5,'rgba(0,0,0,0.25)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = tg;
    lightCtx.beginPath(); lightCtx.arc(tx, ty, rad, 0, Math.PI*2); lightCtx.fill();
  });

  // Enemy glowing eyes bleed through darkness
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
        ctx.fillStyle = '#19141f';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = '#231b2c';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx+0.5, sy+0.5, TILE-1, TILE-1);
        ctx.fillStyle = '#1e1828';
        ctx.fillRect(sx+3, sy+3, TILE/2-4, TILE/3-2);
        ctx.fillRect(sx+TILE/2+2, sy+TILE/3+2, TILE/2-6, TILE/3-2);
      } else if (tile === 0) {
        ctx.fillStyle = '#0c0910';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = '#100d16';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, TILE, TILE);
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

function startGame() {
  initAudio();
  player.x = 72; player.y = 72;
  player.health = 100; player.invincible = 0;
  document.getElementById('health-fill').style.width = '100%';
  particles.length = 0;

  enemies = [
    new Enemy(5*TILE+24,  1*TILE+24, 'stalker'),
    new Enemy(12*TILE+24, 3*TILE+24, 'stalker'),
    new Enemy(3*TILE+24,  9*TILE+24, 'rusher'),
    new Enemy(18*TILE+24, 7*TILE+24, 'stalker'),
    new Enemy(9*TILE+24, 13*TILE+24, 'rusher'),
    new Enemy(20*TILE+24,15*TILE+24, 'stalker'),
  ];

  buildTorches();
  document.getElementById('overlay').style.display = 'none';
  gameState = 'playing';
  startHeartbeat(false);
  requestAnimationFrame(gameLoop);
}

function triggerDeath() {
  gameState = 'gameover';
  stopHeartbeat();
  setTimeout(() => {
    const o = document.getElementById('overlay');
    o.innerHTML = `<h1 style="color:#800">YOU DIED</h1>
      <p class="sub" style="color:#600">They found you in the dark.</p>
      <button onclick="location.reload()">TRY AGAIN</button>`;
    o.style.display = 'flex';
  }, 700);
}

function triggerWin() {
  gameState = 'win';
  stopHeartbeat();
  playSound('win');
  setTimeout(() => {
    const o = document.getElementById('overlay');
    o.innerHTML = `<h1 style="color:#080;text-shadow:0 0 40px #0f0">ESCAPED</h1>
      <p class="sub" style="color:#050">You survived the dark.</p>
      <p class="sub" style="color:#333">...this time.</p>
      <button onclick="location.reload()">PLAY AGAIN</button>`;
    o.style.display = 'flex';
  }, 400);
}

// ============================================================
// JOYSTICK HUD
// ============================================================
function drawJoysticks() {
  for (const side of ['left', 'right']) {
    const stick = sticks[side];
    if (stick.id === null) continue;
    // Outer ring
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, STICK_MAX, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Thumb dot
    ctx.beginPath();
    ctx.arc(stick.ox + stick.dx * STICK_MAX, stick.oy + stick.dy * STICK_MAX, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
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
