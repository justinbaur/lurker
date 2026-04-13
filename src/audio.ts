// ============================================================
// Audio system — Web Audio API procedural synthesis
// ============================================================

import type { SoundType } from './types.js';

export function initAudio(): AudioContext {
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  return new AC();
}

function playTone(
  audioCtx: AudioContext,
  freq: number,
  type: OscillatorType,
  vol: number,
  dur: number,
  freqEnd?: number,
): void {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + dur);
  }
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function playNoise(audioCtx: AudioContext, vol: number, dur: number): void {
  const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + dur);
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
  src.stop(audioCtx.currentTime + dur);
}

export function playSound(audioCtx: AudioContext | null, type: SoundType): void {
  if (!audioCtx) return;
  if (type === 'heartbeat') {
    playTone(audioCtx, 58, 'sine', 0.28, 0.25, 38);
  } else if (type === 'jumpscare') {
    playTone(audioCtx, 900, 'sawtooth', 0.7, 0.45, 180);
    playNoise(audioCtx, 0.45, 0.3);
  } else if (type === 'growl') {
    playTone(audioCtx, 80, 'sawtooth', 0.12, 0.4, 55);
  } else if (type === 'footstep') {
    playTone(audioCtx, 110, 'sine', 0.04, 0.07);
  } else if (type === 'win') {
    [440, 554, 659, 880].forEach((f, i) => {
      setTimeout(() => playTone(audioCtx, f, 'sine', 0.28, 0.5), i * 150);
    });
  }
}

export function startHeartbeat(
  audioCtx: AudioContext | null,
  fast: boolean,
): ReturnType<typeof setInterval> {
  const ms = fast ? 380 : 860;
  return setInterval(() => {
    playSound(audioCtx, 'heartbeat');
    setTimeout(() => playSound(audioCtx, 'heartbeat'), 140);
  }, ms);
}

export function stopHeartbeat(timer: ReturnType<typeof setInterval> | null): void {
  if (timer !== null) clearInterval(timer);
}
