// ============================================================
// Entry point — DOM setup, canvas sizing, event wiring
// ============================================================

import { createInputState } from './input.js';
import { setCanvas, setCanvasSize, setInputState, startGame } from './gamestate.js';

// ─── Canvas setup ────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx    = canvas.getContext('2d')!;

const lightCanvas = document.createElement('canvas');
const lightCtx    = lightCanvas.getContext('2d')!;

setCanvas(canvas, ctx, lightCanvas, lightCtx);

// ─── Responsive sizing ───────────────────────────────────────
function resize(): void {
  const vp    = window.visualViewport;
  const viewW = vp ? vp.width  : window.innerWidth;
  const viewH = vp ? vp.height : window.innerHeight;
  const W = Math.min(viewW, 700);
  const H = Math.min(viewH - 20, 440);
  canvas.width  = W; canvas.height = H;
  lightCanvas.width  = W; lightCanvas.height = H;
  setCanvasSize(W, H);
}
resize();
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ─── Input ───────────────────────────────────────────────────
const inputState = createInputState(canvas);
setInputState(inputState);

// ─── Boot ────────────────────────────────────────────────────
document.getElementById('startBtn')!.addEventListener('click', startGame);
