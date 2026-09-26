// Desk sounds, synthesized with Web Audio: no files to download, works offline.
// Quiet by design. Muting is remembered.

import { store } from './util.js';

const KEY = 'synapse:sound';
let ctx = null;

export const soundOn = () => store.load(KEY) !== false;
export function setSound(on) { store.save(KEY, !!on); }

function ac() {
  if (!soundOn()) return null;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c, dur) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(c, peak, attack, decay, t0) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function burst(c, { t0, dur, freq, q = 1, peak = 0.2, type = 'bandpass' }) {
  const n = noise(c, dur + 0.05);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = env(c, peak, 0.005, dur, t0);
  n.connect(f).connect(g).connect(c.destination);
  n.start(t0); n.stop(t0 + dur + 0.05);
}

function tone(c, { t0, freq, dur, peak = 0.15, type = 'sine', to }) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = env(c, peak, 0.004, dur, t0);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  paper() {        // picking up a document
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    burst(c, { t0: t, dur: 0.12, freq: 2400, q: 0.8, peak: 0.07 });
    burst(c, { t0: t + 0.07, dur: 0.16, freq: 1600, q: 0.6, peak: 0.05 });
  },
  close() {        // putting it back down
    const c = ac(); if (!c) return;
    burst(c, { t0: c.currentTime, dur: 0.1, freq: 900, q: 0.7, peak: 0.05 });
  },
  seal() {         // breaking wax
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    burst(c, { t0: t, dur: 0.05, freq: 3200, q: 2, peak: 0.12 });
    tone(c, { t0: t, freq: 180, to: 70, dur: 0.18, peak: 0.12, type: 'triangle' });
    burst(c, { t0: t + 0.12, dur: 0.35, freq: 2000, q: 0.5, peak: 0.05 });
  },
  stamp() {        // rubber stamp thud
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    tone(c, { t0: t, freq: 120, to: 45, dur: 0.22, peak: 0.25, type: 'sine' });
    burst(c, { t0: t, dur: 0.08, freq: 600, q: 0.7, peak: 0.12, type: 'lowpass' });
  },
  bell() {         // service bell for a breakthrough
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    tone(c, { t0: t, freq: 1568, dur: 1.4, peak: 0.08 });
    tone(c, { t0: t, freq: 3136, dur: 0.9, peak: 0.03 });
    tone(c, { t0: t, freq: 4700, dur: 0.4, peak: 0.015 });
  },
  tick() {         // key press
    const c = ac(); if (!c) return;
    burst(c, { t0: c.currentTime, dur: 0.025, freq: 4000, q: 3, peak: 0.05 });
  },
};
