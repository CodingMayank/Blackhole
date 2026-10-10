// Small deterministic helpers shared by every module.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Seeded PRNG (mulberry32). Same seed => same sequence, so scrubbing is stable. */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash -> [0,1). Handy for "random but stable" per-object values. */
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 1D smooth value noise in [-1,1]; used for camera shake. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.3), hash(i + 1 + seed * 57.3), u) * 2 - 1;
}

function h3(ix, iy, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177) ^ Math.imul(seed + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 3D value noise in [0,1]. Sampling it on a sphere gives a seamless planet texture. */
export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = lerp(h3(ix, iy, iz, seed), h3(ix + 1, iy, iz, seed), ux);
  const b = lerp(h3(ix, iy + 1, iz, seed), h3(ix + 1, iy + 1, iz, seed), ux);
  const c = lerp(h3(ix, iy, iz + 1, seed), h3(ix + 1, iy, iz + 1, seed), ux);
  const d = lerp(h3(ix, iy + 1, iz + 1, seed), h3(ix + 1, iy + 1, iz + 1, seed), ux);
  return lerp(lerp(a, b, uy), lerp(c, d, uy), uz);
}

export function fbm3(x, y, z, octaves = 5, seed = 0) {
  let amp = 0.5, sum = 0, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + i * 7);
    norm += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/**
 * Smooth keyframe interpolation (cubic Hermite, finite-difference tangents).
 * frames: [[t, v0, v1, ...], ...] sorted by t. Returns an array of values.
 */
export function keyframes(frames, t) {
  const n = frames.length;
  if (t <= frames[0][0]) return frames[0].slice(1);
  if (t >= frames[n - 1][0]) return frames[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && t > frames[i + 1][0]) i++;
  const f0 = frames[i], f1 = frames[i + 1];
  const dt = f1[0] - f0[0];
  const u = (t - f0[0]) / dt;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const prev = frames[Math.max(0, i - 1)], next = frames[Math.min(n - 1, i + 2)];
  const out = [];
  for (let k = 1; k < f0.length; k++) {
    const m0 = i === 0 ? (f1[k] - f0[k]) / dt : (f1[k] - prev[k]) / (f1[0] - prev[0]);
    const m1 = i + 2 >= n ? (f1[k] - f0[k]) / dt : (next[k] - f0[k]) / (next[0] - f0[0]);
    out.push(h00 * f0[k] + h10 * dt * m0 + h01 * f1[k] + h11 * dt * m1);
  }
  return out;
}

export function fmtClock(sec) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return String(m).padStart(2, '0') + ':' + r.toFixed(1).padStart(4, '0');
}

/** Heat ramp used for accretion light: dull red -> orange -> amber -> white -> blue-white. */
const HEAT_STOPS = [
  [0.0, 110, 18, 8], [0.22, 220, 70, 18], [0.45, 255, 150, 50],
  [0.7, 255, 224, 170], [1.0, 185, 212, 255],
];
export function heatRGB(h) {
  h = clamp(h, 0, 1);
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
    if (h <= b[0]) {
      const u = (h - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  return [185, 212, 255];
}
export const HEAT_LUT = Array.from({ length: 64 }, (_, i) => {
  const [r, g, b] = heatRGB(i / 63);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
});
export const heatCss = (h, a = 1) => {
  const [r, g, b] = heatRGB(h);
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
};
