// Bounded, allocation-free particle pool with deterministic fixed-step simulation.
// Two instances are used: one in street coordinates (scenes 1-6) and one in "planet units" (scenes 8-9).
import { mulberry32, clamp, smooth, hash, TAU, HEAT_LUT } from './util.js';
import { STAGE, EARTH_R_UNITS } from './constants.js';

export const KIND = { DUST: 0, PAPER: 1, DEBRIS: 2, SMOKE: 3, SPARK: 4, MATTER: 5, GAS: 6, ROCK: 7 };
const DRAG = [0.35, 0.9, 0.04, 0.5, 0.08, 0.16, 0.06, 0.0];
const MASS = [0.2, 0.15, 2.0, 0.3, 0.1, 0.6, 0.35, 3.0];
const STEP = 1 / 60;

export class ParticleSystem {
  constructor({ capacity = 3200, cx = 0, cy = 0, soft = 4, capture = 1.6, kField = () => 0, emitter = null, seed = 1 } = {}) {
    this.cap = capacity;
    this.cx = cx; this.cy = cy; this.soft2 = soft * soft; this.capture2 = capture * capture;
    this.kField = kField; this.emitter = emitter; this.seed = seed;
    const f = () => new Float32Array(capacity);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f();
    this.age = f(); this.life = f(); this.size = f(); this.rot = f(); this.vrot = f(); this.aux = f(); this.base = f();
    this.kind = new Uint8Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.free = new Int32Array(capacity);
    this.blob = null;
    this.reset();
  }

  reset() {
    this.rand = mulberry32(this.seed);
    this.time = 0;
    this.alive.fill(0);
    for (let i = 0; i < this.cap; i++) this.free[i] = this.cap - 1 - i;
    this.freeTop = this.cap;
    this.acc = {};
    this.accretion = 0; // smoothed infall rate, drives disk brightness
    this.absorbed = 0;
    this.nAlive = 0;
  }

  spawn(kind, x, y, vx, vy, size, life, base = 1, vrot = 0) {
    if (this.freeTop === 0) return -1;
    const i = this.free[--this.freeTop];
    this.alive[i] = 1; this.kind[i] = kind;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.size[i] = size; this.life[i] = life; this.age[i] = 0; this.base[i] = base;
    this.rot[i] = this.rand() * TAU; this.vrot[i] = vrot; this.aux[i] = this.rand();
    this.nAlive++;
    return i;
  }

  kill(i) { this.alive[i] = 0; this.free[this.freeTop++] = i; this.nAlive--; }

  /** Advance to absolute simulation time t. Rewinds (reset + replay) if t is in the past. */
  simulateTo(t, maxSteps = 2400) {
    if (t < this.time - STEP) this.reset();
    let n = 0;
    while (this.time + STEP <= t && n < maxSteps) { this.step(STEP); n++; }
  }

  step(dt) {
    const t = this.time, k = this.kField(t);
    if (this.emitter) this.emitter(this, t, dt);
    const { x, y, vx, vy, kind, alive, age, life, rot, vrot, aux } = this;
    let absorbedNow = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!alive[i]) continue;
      age[i] += dt;
      if (age[i] > life[i]) { this.kill(i); continue; }
      const kd = kind[i];
      let px = x[i], py = y[i], pvx = vx[i], pvy = vy[i];
      let dx = this.cx - px, dy = this.cy - py;
      let r = Math.sqrt(dx * dx + dy * dy);
      let n = 1;
      if (k > 0 && r < 70) n = Math.min(24, Math.ceil(dt / (0.06 * Math.sqrt((r * r * r + 1) / k))));
      const h = dt / n, drag = Math.exp(-DRAG[kd] * h);
      let swallowed = false;
      for (let s = 0; s < n; s++) {
        dx = this.cx - px; dy = this.cy - py;
        const r2 = dx * dx + dy * dy;
        if (k > 0) {
          const inv = k / Math.pow(r2 + this.soft2, 1.5);
          pvx += dx * inv * h; pvy += dy * inv * h;
        }
        if (kd <= 1 && k < 4e5) { // light stuff drifts in the breeze before gravity takes over
          pvx += Math.sin(t * 1.3 + aux[i] * 40) * 5 * h;
          pvy += Math.cos(t * 1.1 + aux[i] * 30) * 3 * h;
        }
        pvx *= drag; pvy *= drag;
        const sp = Math.hypot(pvx, pvy);
        if (sp > 4000) { pvx *= 4000 / sp; pvy *= 4000 / sp; }
        px += pvx * h; py += pvy * h;
        if (r2 < this.capture2) { swallowed = true; break; }
      }
      if (swallowed) { absorbedNow += MASS[kd]; this.kill(i); continue; }
      x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy;
      rot[i] += vrot[i] * dt;
    }
    this.absorbed += absorbedNow;
    this.accretion += (absorbedNow / dt - this.accretion) * (1 - Math.exp(-dt / 1.5));
    this.time += dt;
  }

  /** Draw non-glowing (glow=false) or additive (glow=true) kinds. Caller sets the camera transform. */
  draw(ctx, { glow = false, alpha = 1, heatOf = null, unit = 1 } = {}) {
    const { x, y, vx, vy, kind, alive, age, life, size, rot, aux, base } = this;
    const fade = (i) => Math.min(1, age[i] / 0.5) * Math.min(1, (life[i] - age[i]) / 1.2);
    if (!glow) {
      ctx.fillStyle = 'rgb(206,186,158)';
      for (let i = 0; i < this.cap; i++) {
        if (!alive[i] || kind[i] !== KIND.DUST) continue;
        ctx.globalAlpha = Math.min(1, fade(i) * base[i]) * alpha;
        const ds = Math.min(size[i], 4 * unit);
        ctx.fillRect(x[i], y[i], ds, ds);
      }
      for (let i = 0; i < this.cap; i++) {
        if (!alive[i] || kind[i] !== KIND.PAPER) continue;
        ctx.globalAlpha = fade(i) * alpha;
        ctx.save(); ctx.translate(x[i], y[i]); ctx.rotate(rot[i]);
        ctx.scale(1, Math.cos(age[i] * 6 + aux[i] * 9));
        ctx.fillStyle = aux[i] > 0.5 ? '#efe9dc' : '#d9d2c2';
        ctx.fillRect(-size[i] * 1.5, -size[i], size[i] * 3, size[i] * 2);
        ctx.restore();
      }
      const shades = ['#3a3633', '#5a4a40', '#6d6a66'];
      for (let i = 0; i < this.cap; i++) {
        if (!alive[i] || kind[i] !== KIND.DEBRIS) continue;
        ctx.globalAlpha = fade(i) * alpha;
        ctx.fillStyle = shades[(aux[i] * 3) | 0];
        ctx.save(); ctx.translate(x[i], y[i]); ctx.rotate(rot[i]);
        ctx.fillRect(-size[i] / 2, -size[i] * 0.35, size[i], size[i] * 0.7);
        ctx.restore();
      }
      if (this.blob) {
        for (let i = 0; i < this.cap; i++) {
          if (!alive[i] || kind[i] !== KIND.SMOKE) continue;
          ctx.globalAlpha = fade(i) * base[i] * alpha;
          const s = size[i] * (1 + age[i] * 0.15);
          ctx.drawImage(this.blob, x[i] - s, y[i] - s, s * 2, s * 2);
        }
      }
      for (let i = 0; i < this.cap; i++) {
        if (!alive[i] || kind[i] !== KIND.ROCK) continue;
        const h = heatOf ? heatOf(x[i], y[i]) : 0;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = h > 0.5 ? '#4a2c20' : '#3c322d';
        ctx.strokeStyle = HEAT_LUT[(clamp(h * 1.2, 0, 1) * 63) | 0];
        ctx.lineWidth = 1 + h * 1.5;
        ctx.beginPath();
        const s = size[i], a0 = rot[i];
        for (let v = 0; v < 7; v++) {
          const a = a0 + (v / 7) * TAU, rr = s * (0.65 + 0.5 * hash(aux[i] * 91 + v * 3.1));
          const px = x[i] + Math.cos(a) * rr, py = y[i] + Math.sin(a) * rr;
          v === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); if (h > 0.08) ctx.stroke();
      }
    } else {
      ctx.lineCap = 'round';
      for (let i = 0; i < this.cap; i++) {
        if (!alive[i]) continue;
        const kd = kind[i];
        if (kd !== KIND.SPARK && kd !== KIND.MATTER && kd !== KIND.GAS) continue;
        if (kd === KIND.GAS) {
          const h = heatOf ? heatOf(x[i], y[i]) : 0.3;
          ctx.globalAlpha = Math.min(1, 0.25 + h) * alpha * base[i];
          ctx.fillStyle = HEAT_LUT[(clamp(h, 0, 1) * 63) | 0];
          const gs = Math.max(size[i], 1.6 * unit);
          ctx.fillRect(x[i], y[i], gs, gs);
          continue;
        }
        const spd = Math.hypot(vx[i], vy[i]);
        const heat = clamp((spd - 120) / 900, 0, 1) * 0.9 + (kd === KIND.SPARK ? 0.25 : 0.05);
        ctx.globalAlpha = fade(i) * alpha * (kd === KIND.SPARK ? 1 : 0.85);
        ctx.strokeStyle = HEAT_LUT[(clamp(heat, 0, 1) * 63) | 0];
        ctx.lineWidth = Math.max(size[i] * unit, unit * 0.9);
        const tl = Math.min(0.045, (kd === KIND.SPARK ? 40 : 55) * unit / (spd + 1));
        ctx.beginPath(); ctx.moveTo(x[i], y[i]); ctx.lineTo(x[i] - vx[i] * tl, y[i] - vy[i] * tl); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Soft round sprite for smoke puffs. */
export function makeBlob(doc = document) {
  const c = doc.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(110,98,88,0.9)'); gr.addColorStop(0.6, 'rgba(100,90,82,0.35)'); gr.addColorStop(1, 'rgba(90,80,72,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Street scenario: ambient motes, then litter, dust, debris, sparks and infalling matter.
// ---------------------------------------------------------------------------------------------
export const STREET_K_MAX = 3.0e6;
export const streetField = (t) => STREET_K_MAX * (0.25 * smooth(11, 13, t) + 0.75 * smooth(16, 40, t));

export function streetEmitter(ps, t, dt) {
  const R = ps.rand, bx = STAGE.bhX, by = STAGE.bhY;
  const rate = (key, r, fn) => {
    if (r <= 0) return;
    ps.acc[key] = (ps.acc[key] || 0) + r * dt;
    while (ps.acc[key] >= 1) { ps.acc[key] -= 1; fn(); }
  };
  const k = Math.max(ps.kField(t), 1e5);
  const around = (rmin, rmax, vf, kind, size, life, base) => {
    const a = R() * TAU, r = rmin + R() * (rmax - rmin), sgn = R() < 0.85 ? 1 : -1;
    const vt = vf * Math.sqrt(k / r) * sgn;
    ps.spawn(kind, bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.8, -Math.sin(a) * vt, Math.cos(a) * vt, size, life, base);
  };
  rate('mote', t < 58 ? 16 : 0, () =>
    ps.spawn(KIND.DUST, -200 + R() * 2000, 250 + R() * 560, (R() - 0.3) * 18, (R() - 0.5) * 8, 0.8 + R() * 1.2, 8 + R() * 6, 0.22));
  if (t < 11) return;
  rate('dust', t < 50 ? 70 * smooth(11.2, 15, t) : 0, () => around(40, 430, 0.15 + R() * 0.5, KIND.DUST, 1.4 + R() * 2.6, 5 + R() * 5, 0.3 + R() * 0.3));
  rate('paper', t < 40 ? 6 * smooth(11.3, 13, t) : 0, () => around(80, 380, 0.1 + R() * 0.4, KIND.PAPER, 2 + R() * 2, 7 + R() * 4, 1));
  rate('debris', t >= 18 && t < 48 ? 9 * smooth(18, 28, t) : 0, () => {
    if (R() < 0.5) ps.spawn(KIND.DEBRIS, 80 + R() * 1440, 300 + R() * 250, (R() - 0.5) * 30, (R() - 0.5) * 20, 3 + R() * 6, 8 + R() * 5);
    else around(60, 300, 0.1 + R() * 0.4, KIND.DEBRIS, 2.5 + R() * 5, 8 + R() * 5, 1);
  });
  rate('smoke', t >= 24 && t < 52 ? 5 * smooth(24, 30, t) : 0, () => around(40, 360, 0.1 + R() * 0.3, KIND.SMOKE, 18 + R() * 40, 5 + R() * 3, 0.35));
  rate('spark', t >= 22 && t < 52 ? 45 * smooth(22, 34, t) : 0, () => around(20, 170, 0.3 + R() * 0.6, KIND.SPARK, 1 + R() * 1.2, 2 + R() * 2, 1));
  rate('matter', t >= 29 && t < 52 ? 30 + 110 * smooth(29, 44, t) : 0, () => around(60, 260, 0.45 + R() * 0.5, KIND.MATTER, 1 + R() * 1.4, 10 + R() * 6, 1));
}

// ---------------------------------------------------------------------------------------------
// Planet-breakup scenario (units: Earth radius = EARTH_R_UNITS). Time 0 = start of scene 8.
// ---------------------------------------------------------------------------------------------
export const SPACE_GM = 6.0e5; // circular speed at r=200 is ~55 units/s
export const spaceField = () => SPACE_GM;

export function spaceEmitter(ps) {
  if (ps.acc.init) return;
  ps.acc.init = 1;
  const R = ps.rand, RE = EARTH_R_UNITS, vc = Math.sqrt(SPACE_GM / RE);
  const place = (kind, count, sizeFn, spread, life, base) => {
    for (let n = 0; n < count; n++) {
      const a = R() * TAU, r = RE * Math.sqrt(R()) * spread;
      const w = (0.1 + 0.8 * R()) * (vc / RE) * (R() < 0.82 ? 1 : -1);
      const kick = (R() - 0.3) * 0.5 * vc * (kind === KIND.GAS ? 1.3 : 0.7);
      const ux = Math.cos(a), uy = Math.sin(a);
      ps.spawn(kind, ux * r, uy * r, -uy * r * w + ux * kick, ux * r * w + uy * kick, sizeFn(), life, base, (R() - 0.5) * 2);
    }
  };
  place(KIND.ROCK, 110, () => 5 + R() * 17, 0.97, 1e9, 1);
  place(KIND.GAS, 2600, () => 1.2 + R() * 1.4, 1.04, 1e9, 0.8);
}
