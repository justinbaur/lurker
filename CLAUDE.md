# LURKER — Architecture & Design

## Project Overview

**LURKER** is a top-down browser horror game built with vanilla JavaScript and the Canvas 2D API. The core mechanic revolves around a flashlight that freezes enemies: while illuminated, enemies are paralyzed; the moment they leave the light, they rush toward the player.

- **Technology**: Vanilla JS (no frameworks), Canvas 2D, Web Audio API
- **Levels**: Static tile-based mazes (48px tiles) defined in JSON
- **Controls**: Keyboard (WASD/arrows) or touchscreen (dual virtual joysticks)
- **Win condition**: Navigate maze, find EXIT tile, escape without losing all sanity

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Game Loop (requestAnimationFrame)                      │
├─────────────────────────────────────────────────────────┤
│  ↓                                                       │
│  Update Phase (per-frame logic)                         │
│    • Player movement & flashlight angle                 │
│    • Enemy AI & state transitions                       │
│    • Particle & screen shake updates                    │
├─────────────────────────────────────────────────────────┤
│  ↓                                                       │
│  Render Phase (double-buffered canvas)                  │
│    • Tile map & torches to main canvas                  │
│    • Enemies & particles                                │
│    • Dynamic lighting to light canvas                   │
│    • Composite: main + darkness mask                    │
└─────────────────────────────────────────────────────────┘
```

### Key Systems

1. **Tile Map** — Static 25×18 grid (0=floor, 1=wall, 2=exit)
2. **Enemy System** — Stalker and Rusher types with distinct AI
3. **Lighting System** — Flashlight cone + ambient glow with occlusion
4. **Audio System** — Procedural tones and heartbeat feedback
5. **Input Handling** — Dual-layer input (keyboard + dual-stick touch)

---

## The Enemy AI: Attraction & Frozen States

### Overview

Enemies operate in three states:

| State | Behavior | Caused By |
|-------|----------|-----------|
| **roaming** | Wander aimlessly, occasionally sniff toward player if nearby | Default state after leaving light |
| **frozen** | Completely paralyzed, cannot move or attack | Illuminated by flashlight or ambient glow |
| **rushing** | Charge directly at player at 1.7× normal speed | Exits frozen state; plays growl sound |

### How Enemies Detect & Chase the Player

**Detection happens in `Enemy.isIlluminated()`** (game.js:336–350):

```javascript
isIlluminated() {
  const dist = distance_to_player;
  
  // Check 1: Ambient Glow (short range, line-of-sight)
  if (dist < 60) return hasLOS(player, enemy);
  
  // Check 2: Flashlight Cone
  // • Must be within ~340px of player
  // • Must be within ±~51° of flashlight angle
  // • Must have line-of-sight (walls block light)
  const ang = angle_to_player;
  if (dist < 340 && angle_in_cone(ang)) 
    return hasLOS(player, enemy);
  
  return false;  // Not illuminated
}
```

**Two illumination sources:**

1. **Ambient Glow** (~75px radius)
   - Short-range sphere of pale light around player
   - Freezes enemies within range regardless of angle
   - Provides fail-safe so enemies can't sneak behind

2. **Flashlight Cone** (~260px range, ~103° spread)
   - Directional beam extending from player's facing direction
   - Angle-based test: only freezes enemies within ±51° of aim
   - Still requires line-of-sight (walls block it)

### The Frozen Mechanics

When an enemy becomes frozen (either by cone or glow):

```javascript
if (this.isIlluminated()) {
  this.state = 'frozen';
  this.frozenCD = 50;  // 50-frame grace period
}
```

**Critical: The Grace Period** (`frozenCD`)

After an enemy leaves the light, it stays frozen for **50 frames (~833ms)** before reverting to roaming. This gives the player a **window of opportunity** to pass by or reposition.

### State Transitions: Frozen → Rushing

```javascript
else if (this.frozenCD > 0) {
  this.state = 'frozen';  // Still in grace period
} else {
  if (this.state === 'frozen') {
    this.state = 'rushing';
    playSound('growl');  // Audio cue
  }
  // Now rushing toward player...
}
```

When an enemy **exits frozen state**, it:
1. Plays a growl sound (audible to player, warning)
2. Switches to **rushing state**
3. Moves toward player at 1.7× base speed

### Enemy Types: Stalker vs. Rusher

The codebase defines two types with different speeds and hunting behaviors:

| Property | Stalker | Rusher |
|----------|---------|--------|
| **Speed** | 2.0 px/frame | 3.8 px/frame |
| **Roam Speed** | 0.65 px/frame | 0.65 px/frame |
| **Rush Speed** | 3.4 px/frame (1.7×) | 6.46 px/frame (1.7×) |
| **Hunting Range** | 280 px | 280 px |
| **Behavior** | Patient, methodical | Aggressive, explosive |
| **Visual** | Purple eyes, smooth movement | Orange eyes, spiky aura when rushing |

Both types hunt differently when they detect you:

1. **Stalker** — Cautious approach
   - When rushing, moves at moderate speed toward player
   - If within 280px, also "sniffs" toward player at roam speed
   - Creates a creeping, pressure-building threat

2. **Rusher** — Explosive charge
   - When rushing, moves at high speed directly at player
   - Spikes protrude from body (visual feedback)
   - More dangerous in open corridors

### The Line-of-Sight Check: `hasLOS()`

Lighting and detection are blocked by walls. The `hasLOS()` function (game.js:572–584) uses raycasting:

```javascript
function hasLOS(ax, ay, bx, by) {
  // Shoot ray from point A toward B
  // If any wall segment blocks the ray, return false
  for (const wall of wallSegments) {
    if (ray_hits_wall_between_points) return false;
  }
  return true;  // Direct line of sight
}
```

**Impact on gameplay:**
- Enemies in adjacent rooms (separated by walls) won't see your flashlight
- Corners provide temporary safety
- Wall-mounted torches cast light independently but also respect occlusion

---

## Lighting System: Canvas Compositing

The game uses a **dual-canvas approach** to efficiently render dynamic lighting:

### Two Canvases

1. **Main Canvas (`ctx`)** — Rendered normally
   - Tile map, enemies, player, UI
   - Standard 2D drawing

2. **Light Canvas (`lightCtx`)** — Darkness mask
   - White = light, Black = shadow
   - Composited onto main using `destination-out` blending

### Rendering Flow

```javascript
// 1. Draw geometry to main canvas
ctx.fillStyle = '#040208';  // Dark background
ctx.fillRect(0, 0, w, h);
drawMap();
drawTorches();
drawParticles();
drawPlayer();
enemies.forEach(e => e.draw());

// 2. Compute visibility polygons (light canvas)
lightCtx.clearRect(0, 0, w, h);
lightCtx.fillStyle = '#000000';  // Start with full darkness
lightCtx.fillRect(0, 0, w, h);
lightCtx.fillStyle = '#ffffff';  // Light area
// Draw visibility polygons for flashlight & ambient glow
computeVisibilityPoly(lightCanvas);

// 3. Composite: remove light areas from darkness
ctx.globalCompositeOperation = 'destination-out';
ctx.drawImage(lightCanvas, 0, 0);
ctx.globalCompositeOperation = 'source-over';  // Reset
```

**Result:** Darkness covers the map except where light (flashlight + ambient + torches) reaches.

### Visibility Polygon Computation

The `computeVisibilityPoly()` function (game.js:588+) builds a 2D polygon representing the illuminated area:

1. **Gather nearby wall segments** within max range (AABB acceleration)
2. **Process each wall corner** — compute shadow rays
3. **Construct polygon edges** — ordered by angle around light source
4. **Draw filled polygon** to light canvas in white

This ensures that:
- Light bends around corners realistically
- Shadows are cast behind walls
- Torch light interacts with environment

---

## Player Mechanics

### Player State

```javascript
const player = {
  x, y,              // World position (pixel coords)
  angle,             // Facing direction for shoulder light
  radius: 10,        // Collision radius
  health: 100,       // Sanity (0–100); lose 25 per hit
  invincible: 0,     // Frames of invincibility after hit
};
```

### Movement (`updatePlayer()`)

- **WASD or Arrow Keys** — Move ±40 px/frame in cardinal directions
- **Mouse or Right Joystick** — Update flashlight angle
- Collision detection via `tryMove()` (axis-aligned, against walls)

### Flashlight Aiming

```javascript
// Desktop: aim toward mouse position
flashAngle = atan2(mouseY - playerScreenY, mouseX - playerScreenX);

// Mobile: aim via right joystick
flashAngle = atan2(joystick.dy, joystick.dx);
```

The flashlight angle is continuously updated and fed to `Enemy.isIlluminated()` for detection.

### Health & Sanity

- **Start**: 100 sanity (shown as green bar labeled "SANITY")
- **Per Hit**: Lose 25 sanity
- **Visual Feedback**:
  - Health bar color changes (green → yellow → red)
  - Screen shake on each impact
  - Heartbeat sound accelerates below 50% sanity
- **Game Over**: 4 hits (100 → 75 → 50 → 25 → 0)

---

## Audio System: Procedural Sounds

All sounds are synthesized using **Web Audio API** (no audio files).

### Sound Types

| Sound | Type | Use |
|-------|------|-----|
| **Heartbeat** | Sine wave (58 Hz) | Plays when health < 50%, speeds up as health drops |
| **Growl** | Sawtooth (80 Hz) | Plays when enemy exits frozen state |
| **Jumpscare** | Sawtooth + noise | Plays on death |
| **Footstep** | Sine (110 Hz, short) | Procedural walking sounds |
| **Win chime** | Ascending note sequence | Plays on level exit |

### Heartbeat Timing

```javascript
function startHeartbeat(fast) {
  const ms = fast ? 380 : 860;  // BPM changes with sanity
  // Heartbeat has two beats (kick + resonance) 140ms apart
  setInterval(() => {
    playSound('heartbeat');
    setTimeout(() => playSound('heartbeat'), 140);
  }, ms);
}
```

The faster heartbeat at low health creates auditory pressure, signaling danger.

---

## Rendering Pipeline

### Per-Frame Render Order

```
1. Clear background (#040208 dark blue-black)
2. Draw tile map (floor tiles in light gray)
3. Draw torches (animated orange flicker)
4. Draw particle effects (hit sparks, etc.)
5. Draw player (tan circle with light indicator)
6. Draw enemies (circles with glowing eyes)
7. Composite lighting (darkness mask)
8. Draw UI overlays (vignette, joysticks if on mobile)
9. Screen shake offset applied to entire frame
```

### Camera System

```javascript
function camUpdate() {
  camera.x = player.x - CANVAS_W / 2;  // Center on player
  camera.y = player.y - CANVAS_H / 2;
  // Clamp to map bounds
  camera.x = Math.max(0, Math.min(camera.x, MAP_W * TILE - CANVAS_W));
  camera.y = Math.max(0, Math.min(camera.y, MAP_H * TILE - CANVAS_H));
}

// World-to-screen conversion helpers
function wx(worldX) { return worldX - camera.x; }
function wy(worldY) { return worldY - camera.y; }
```

The camera follows the player, clamped to map bounds to prevent black borders.

### Visual Polish

- **Vignette**: Radial gradient darkens screen edges (psychological pressure)
- **Screen Shake**: Random offset on camera on each hit (feedback)
- **Particle Effects**: Orange sparks spawn on collision (visual feedback)
- **Enemy Rendering**: 
  - Frozen enemies show pale body with X-eyes (stunned appearance)
  - Active enemies glow with color matching their type (purple=stalker, orange=rusher)

---

## Input Handling

### Keyboard Input

Standard event listeners for `keydown` / `keyup` populate a `keys` object:

```javascript
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

// In updatePlayer:
let dx = 0, dy = 0;
if (keys['KeyW'] || keys['ArrowUp'])    dy -= 40;
if (keys['KeyS'] || keys['ArrowDown'])  dy += 40;
if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 40;
if (keys['KeyD'] || keys['ArrowRight']) dx += 40;
player.tryMove(dx, dy);
```

### Touch Input (Dual Virtual Joysticks)

Mobile devices get two virtual joysticks on the canvas:

```javascript
const sticks = {
  left:  { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },  // Movement
  right: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },  // Aiming
};
```

- **Left half of screen** → Movement joystick
- **Right half of screen** → Aiming joystick
- Touch positions update `dx`/`dy` (normalized to ±1 range)
- Each stick shows a visual ring + thumb indicator on screen

---

## Collision & Physics

### Wall Collision

```javascript
tryMove(dx, dy) {
  const r = this.radius;
  const nx = this.x + dx, ny = this.y + dy;
  
  // Check X-axis
  if (!isSolid(floor((nx+r)/TILE), floor(ny/TILE)) &&
      !isSolid(floor((nx-r)/TILE), floor(ny/TILE))) {
    this.x = nx;
  } else {
    // Hit wall; rotate randomly to change direction
    this.angle += PI/2 + (random() - 0.5);
  }
  
  // Check Y-axis (separate, allows sliding along walls)
  if (!isSolid(floor(nx/TILE), floor((ny+r)/TILE)) &&
      !isSolid(floor(nx/TILE), floor((ny-r)/TILE))) {
    this.y = ny;
  } else {
    this.angle += PI/2 + (random() - 0.5);
  }
}
```

**Characteristics:**
- Separate X and Y checks (allows sliding)
- Uses entity radius to prevent clipping into walls
- Enemies adjust angle when blocked (induces random direction changes)

### Hit Detection

```javascript
update() {
  // ... movement ...
  
  // Hit player?
  const dx = player.x - this.x, dy = player.y - this.y;
  const dist = sqrt(dx*dx + dy*dy);
  if (dist < this.radius + player.radius) {
    hitPlayer();  // Lose 25 sanity, screen shake, particles
  }
}
```

Circle-to-circle collision based on distance between centers.

---

## Game State Flow

```
TITLE → PLAYING → WIN | GAMEOVER
```

### Start

```javascript
function startGame() {
  player position = (72, 72)  // Top-left spawn
  player health = 100
  
  enemies = [
    Enemy(5*48+24,  1*48+24, 'stalker'),
    Enemy(12*48+24, 3*48+24, 'stalker'),
    Enemy(3*48+24,  9*48+24, 'rusher'),
    // ... 3 more
  ];
  
  buildTorches();       // Procedurally place on walls
  buildWallSegments();  // Cache wall geometry for raycasting
  startHeartbeat(false);
  requestAnimationFrame(gameLoop);
}
```

### Win Condition

```javascript
function drawMap() {
  // If player is on an EXIT tile (value 2):
  if (map[playerTile] === 2) {
    triggerWin();  // Display victory overlay, play chime
  }
}
```

### Death Condition

```javascript
function hitPlayer() {
  player.health -= 25;
  
  if (player.health <= 0) {
    triggerDeath();  // Display death overlay after 700ms delay
  } else {
    player.invincible = 120;  // 2-second invincibility
    screen shake...
  }
}
```

---

## File Structure

```
lurker/
├── game.js              # All game logic (single file)
├── index.html           # HTML5 page & UI shells
├── package.json         # Build config (Vite dev server)
├── vite.config.js       # Vite build settings
├── src/
│   ├── game.js          # Copy of main game logic (for module builds)
│   └── levels/
│       ├── level1.json  # Future level data
│       ├── level2.json
│       └── level3.json
└── README.md            # Gameplay & controls
```

Currently the game is **single-file** with inline HTML. Levels are hardcoded in the `MAP_RAW` constant; JSON files are placeholders for future expansion.

---

## Key Design Decisions

### Why Vanilla JS?

- **Minimal dependencies** — Single game.js file, no build step initially
- **Full control** — Direct Canvas API access for lighting effects
- **Mobile-friendly** — Web Audio + touch events without library overhead

### Why Dual Canvas for Lighting?

- **Performance** — Precompute light mask once per frame
- **Efficiency** — Destination-out blending is one operation vs. per-pixel darkness
- **Flexibility** — Easy to add/remove light sources independently

### Why State Machines for Enemies?

- **Clarity** — Three well-defined states reduce bugs
- **Predictability** — Players can learn enemy patterns
- **Audio cues** — Growl sound provides warning on state change

### Why Grace Period After Unfreezing?

- **Fairness** — Prevents instant kills when light flickers
- **Tension** — Forces player to make escape decisions (move now or wait?)
- **Gameplay depth** — Timing enemy thaws becomes strategic

---

## Future Extensions

- **Multiple levels** — Load from JSON; procedural generation possible
- **Enemy types** — Crawlers, flyers, telepaths
- **Weapons** — Flares, EMPs, decoys
- **Difficulty modes** — More enemies, faster rushes, reduced grace period
- **Accessibility** — Higher contrast mode, haptic feedback on mobile

---

## Debugging Tips

### Check Enemy State

```javascript
// Console: monitor an enemy's state in real-time
console.log(enemies[0].state, enemies[0].frozenCD);
```

### Visualize Light Cones

Modify `Enemy.isIlluminated()` to log distance, angle, and result. Draw debug circles on canvas.

### Test Wall Occlusion

Set `hasLOS()` to always return true—see if enemies now "see through" walls. Test raycasting independently.

### Framerate Issues

Open DevTools Performance tab, look for long render frames. Common culprits:
- Too many raycasts per frame (reduce wall segment checks with AABB)
- Large particle counts (cap particles array)
- Audio context bottleneck on low-end devices

---

## Summary

LURKER combines **simple mechanics** (flashlight freezes enemies) with **sophisticated systems** (raycasted lighting, dual-canvas compositing, procedural audio) to create a tense, atmospheric experience. The enemy AI's three-state machine and grace-period mechanics reward skill and timing, while the lighting system enforces line-of-sight rules that make hiding in corridors a viable strategy.
