// ============================================================
// Input handling — keyboard, mouse, dual virtual joystick
// ============================================================

import type { InputState } from './types.js';
import { STICK_MAX } from './constants.js';

export function createInputState(canvas: HTMLCanvasElement): InputState {
  const state: InputState = {
    keys: {},
    sticks: {
      left:  { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
      right: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
    },
    mouseX: 0, mouseY: 0, mouseActive: false,
    flashAngle: 0,
  };

  document.addEventListener('keydown', e => { state.keys[e.code] = true; });
  document.addEventListener('keyup',   e => { state.keys[e.code] = false; });

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    state.mouseX = e.clientX - r.left;
    state.mouseY = e.clientY - r.top;
    state.mouseActive = true;
  });

  function stickFromTouch(stick: InputState['sticks']['left'], touch: Touch): void {
    const r  = canvas.getBoundingClientRect();
    const dx = touch.clientX - r.left - stick.ox;
    const dy = touch.clientY - r.top  - stick.oy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    stick.dx = dist > 0 ? dx / Math.max(dist, STICK_MAX) : 0;
    stick.dy = dist > 0 ? dy / Math.max(dist, STICK_MAX) : 0;
  }

  function clearStick(id: number): void {
    for (const side of ['left', 'right'] as const) {
      if (state.sticks[side].id === id) {
        state.sticks[side].id = null;
        state.sticks[side].dx = 0;
        state.sticks[side].dy = 0;
      }
    }
  }

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      const cx   = t.clientX - r.left;
      const side = cx < canvas.width / 2 ? 'left' : 'right';
      const st   = state.sticks[side];
      if (st.id === null) {
        st.id = t.identifier;
        st.ox = cx;
        st.oy = t.clientY - r.top;
        st.dx = 0;
        st.dy = 0;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      for (const side of ['left', 'right'] as const) {
        if (state.sticks[side].id === t.identifier) stickFromTouch(state.sticks[side], t);
      }
    }
  }, { passive: false });

  const endHandler = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) clearStick(t.identifier);
  };
  canvas.addEventListener('touchend',    endHandler, { passive: false });
  canvas.addEventListener('touchcancel', endHandler, { passive: false });

  return state;
}

// Update flashAngle based on right-stick or mouse position.
// playerScreenX/Y are the player's current screen-space coordinates.
export function updateFlashAngle(
  input: InputState,
  playerScreenX: number,
  playerScreenY: number,
): void {
  if (input.sticks.right.id !== null && (input.sticks.right.dx || input.sticks.right.dy)) {
    input.flashAngle = Math.atan2(input.sticks.right.dy, input.sticks.right.dx);
  } else if (input.mouseActive) {
    input.flashAngle = Math.atan2(
      input.mouseY - playerScreenY,
      input.mouseX - playerScreenX,
    );
  }
  // Otherwise preserve the last known angle
}
