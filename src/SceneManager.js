// Stage progression: which scene/shot is active at time t, plus camera, transitions and
// per-moment effect values. Everything is a pure function of t so scrubbing is exact.
import { clamp, smooth, keyframes, noise1 } from './util.js';
import { T_APPEAR } from './constants.js';

// Camera tracks for the street world. Values: [t, x, y, ln(zoom)].
const L = Math.log;
const TRACKS = [
  {
    from: 0, to: 46, frames: [
      [0, 800, 560, L(1.0)], [8, 800, 572, L(1.22)], [10.9, 800, 582, L(1.4)],
      [12.2, 800, 590, L(3.0)], [14, 800, 590, L(4.6)], [16, 800, 590, L(5.2)],
      [19, 800, 590, L(5.0)], [21.5, 800, 585, L(3.8)], [23.5, 800, 570, L(2.0)], [26, 800, 570, L(1.35)],
      [31, 800, 570, L(2.3)], [36, 800, 585, L(4.5)], [40, 800, 590, L(9)], [46, 800, 590, L(14)],
    ],
  },
  { from: 46, to: 49, frames: [[46, 560, 610, L(1.15)], [49, 860, 612, L(1.5)]] },
  { from: 49, to: 52, frames: [[49, 800, 590, L(15)], [52, 800, 590, L(22)]] },
];

// Dips to black between hard cuts. Triangular, centred on `t`.
const CUTS = [
  { t: 0, dur: 2.4, hold: 0 }, { t: 46, dur: 0.8 }, { t: 49, dur: 0.5 }, { t: 52, dur: 0.5 },
  { t: 55, dur: 0.6 }, { t: 58, dur: 0.9 },
];

export class SceneManager {
  constructor(scenes) {
    this.scenes = scenes;
    let s = 0;
    for (const sc of scenes) { sc.start = s; s += sc.duration; sc.end = s; }
    this.total = s;
  }

  locate(t) {
    const tt = clamp(t, 0, this.total - 1e-6);
    let index = this.scenes.findIndex((sc) => tt >= sc.start && tt < sc.end);
    if (index < 0) index = this.scenes.length - 1;
    const scene = this.scenes[index];
    const local = tt - scene.start;
    return { index, scene, local, u: local / scene.duration };
  }

  /** Which "world" is being drawn and the human-readable shot name. */
  viewAt(t) {
    if (t < 46) return { view: 'street', shot: this.locate(t).scene.shot };
    if (t < 49) return { view: 'street', shot: 'Street level' };
    if (t < 52) return { view: 'street', shot: 'Matter falling inward' };
    if (t < 55) return { view: 'aerial', shot: 'Aerial view of the city' };
    if (t < 58) return { view: 'region', shot: 'High-altitude regional view' };
    if (t < 70) return { view: 'earth', shot: this.locate(t).scene.shot };
    return { view: 'space', shot: this.locate(t).scene.shot };
  }

  cameraAt(t) {
    const tr = TRACKS.find((k) => t >= k.from && t < k.to) || TRACKS[TRACKS.length - 1];
    const [x, y, lz] = keyframes(tr.frames, clamp(t, tr.from, tr.to));
    return { x, y, zoom: Math.exp(lz) };
  }

  /** Camera shake amplitude in stage-independent CSS pixels. */
  shakeAmp(t) {
    let a = 0;
    if (t >= T_APPEAR && t < T_APPEAR + 0.9) { const u = (t - T_APPEAR) / 0.9; a += 7 * (1 - u) * (1 - u); }
    if (t >= 14 && t < 26) a += 0.6 + 2.2 * smooth(14, 26, t);
    if (t >= 26 && t < 46) a += 2.8 + 6 * smooth(26, 44, t);
    if (t >= 46 && t < 52) a += 6 - 3 * smooth(46, 52, t);
    if (t >= 52 && t < 58) a += 2;
    if (t >= 58 && t < 70) a += 1 + 4 * smooth(60, 69, t);
    if (t >= 70 && t < 84) a += 5 * (1 - smooth(70, 84, t));
    return a;
  }

  shakeAt(t, reduced) {
    if (reduced) return { x: 0, y: 0 };
    const a = this.shakeAmp(t);
    if (a <= 0) return { x: 0, y: 0 };
    return { x: noise1(t * 14, 1) * a, y: noise1(t * 17, 2) * a * 0.8 };
  }

  /** Brightness offset: negative = darker, positive = brighter. Kept gentle on purpose. */
  exposureAt(t, reduced) {
    const k = reduced ? 0.4 : 1;
    let e = 0;
    if (t > 8 && t < T_APPEAR) e -= 0.05 * smooth(8, T_APPEAR, t);
    if (t >= T_APPEAR && t < T_APPEAR + 0.6) e -= 0.3 * (1 - (t - T_APPEAR) / 0.6);
    if (t >= 36 && t < 52) e += 0.04 * Math.sin(t * 5.3) * smooth(36, 42, t);
    return e * k;
  }

  /** Strength [0..1] of the shallow depth-of-field blur at the frame edges. */
  dofAt(t) {
    if (t < 6) return 0.0;
    if (t < 11) return 0.45 * smooth(6, 11, t);
    if (t < 16) return 0.7;
    if (t < 26) return 0.7 - 0.45 * smooth(16, 26, t);
    if (t < 46) return 0.25 + 0.35 * smooth(34, 46, t);
    if (t < 52) return 0.45;
    return 0;
  }

  /** Expanding ring progress 0..1 right after the appearance (null otherwise). */
  shockAt(t) {
    const d = 1.6;
    if (t < T_APPEAR || t > T_APPEAR + d) return null;
    return (t - T_APPEAR) / d;
  }

  /** Black-dip alpha for hard cuts, plus the final fade to black. */
  fadeAt(t) {
    let a = 0;
    for (const c of CUTS) {
      if (c.t === 0) { if (t < c.dur) a = Math.max(a, 1 - smooth(0.2, c.dur, t)); continue; }
      const d = Math.abs(t - c.t), half = c.dur / 2;
      if (d < half) a = Math.max(a, 1 - d / half);
    }
    const tail = this.total - 4.5;
    if (t > tail) a = Math.max(a, smooth(tail, this.total - 2.0, t));
    return a;
  }

  /** True when a hard cut is under way (used for a touch of motion-blur ghosting). */
  inCut(t) {
    return CUTS.some((c) => c.t > 0 && Math.abs(t - c.t) < c.dur / 2);
  }

  /** Scripted part of the accretion brightness [0..1]; the particle sim adds to it. */
  scriptedAccretion(t) {
    if (t < 30) return 0;
    if (t < 52) return 0.5 * smooth(30, 44, t);
    return 0;
  }
}
