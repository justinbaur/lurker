// ============================================================
// Shared type definitions — no imports, no runtime code
// ============================================================

export type EnemyState = 'roaming' | 'frozen' | 'rushing';
export type EnemyType  = 'stalker' | 'rusher';
export type GamePhase  = 'title' | 'playing' | 'win' | 'gameover';
export type SoundType  = 'heartbeat' | 'jumpscare' | 'growl' | 'footstep' | 'win';
export type OscType    = OscillatorType;

export interface Vec2    { x: number; y: number; }
export interface Segment { x1: number; y1: number; x2: number; y2: number; }
export interface Torch   { x: number; y: number; phase: number; intensity: number; }
export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  size: number; color: string;
}

export interface PlayerState {
  x: number; y: number;
  speed: number; radius: number;
  health: number; maxHealth: number;
  angle: number;
  invincible: number;
  stepTimer: number;
}

export interface CameraState { x: number; y: number; }

export interface StickState {
  id: number | null;
  ox: number; oy: number;
  dx: number; dy: number;
}

export interface InputState {
  keys: Record<string, boolean>;
  sticks: { left: StickState; right: StickState };
  mouseX: number; mouseY: number; mouseActive: boolean;
  flashAngle: number;
}

export interface LevelData {
  name: string;
  tiles: string[];
  playerStart: [number, number];
  enemies: Array<{ type: EnemyType; tile: [number, number] }>;
  narrative: string;
}

// Interface for Enemy so renderer/gamestate can hold it without importing the concrete class
export interface IEnemy {
  x: number; y: number;
  radius: number;
  state: EnemyState;
  sx: number; sy: number;
  update(): void;
  draw(): void;
}

// Central shared-state bag passed by reference to all modules.
// Callbacks on this interface break circular imports (Enemy can call
// hitPlayer/playSound/spawnParticles without importing those modules).
export interface GameContext {
  // Canvas
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;

  // Live state
  player: PlayerState;
  camera: CameraState;
  input: InputState;
  enemies: IEnemy[];
  particles: Particle[];
  torches: Torch[];
  wallSegments: Segment[];
  wallCorners: Vec2[];

  // Map dimensions (pixels) — updated on level load via map module
  mapWPx: number;
  mapHPx: number;

  // Game phase
  gameState: GamePhase;
  frameCount: number;
  shakeMag: number;
  shakeX: number;
  shakeY: number;
  currentLevelIndex: number;

  // Audio
  audioCtx: AudioContext | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;

  // Service callbacks — wired at context-creation time in gamestate.ts
  playSound: (type: SoundType) => void;
  hitPlayer: () => void;
  spawnParticles: (x: number, y: number, color: string, n: number) => void;
}
