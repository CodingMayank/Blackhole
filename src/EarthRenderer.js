// Planet rendering: procedural sphere texture, per-pixel shading with tidal deformation and glowing
// fractures, atmosphere, plumes, chips, and the star field. Everything is a function of its inputs.
import { mulberry32, clamp, lerp, smooth, hash, fbm3, TAU } from './util.js';

const TW = 640, TH = 320;

export class EarthRenderer {
  constructor(doc = document) {
    this.doc = doc;
    this.base = null;
    this.buf = doc.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.img = null;
    const R = mulberry32(5);
    this.stars = Array.from({ length: 520 }, () => ({ x: R(), y: R(), r: 0.4 + R() * 1.3, b: 0.3 + R() * 0.7, tw: R() * TAU, hue: R() }));
    this.plumes = Array.from({ length: 170 }, () => ({ a: R() * TAU, t0: R(), v: 0.2 + R() * 0.9, s: 1 + R() * 2.5, c: R() }));
    this.chips = Array.from({ length: 46 }, () => ({ a: R() * TAU, t0: 0.55 + R() * 0.4, v: 0.15 + R() * 0.4, s: 5 + R() * 14, rot: R() * TAU, w: R() - 0.5 }));
  }

  /** Builds the equirectangular colour, cloud and fracture maps (done once, ~0.3 s). */
  buildTextures() {
    if (this.base) return;
    const N = TW * TH;
    this.base = new Uint8ClampedArray(N * 3);
    this.cloud = new Uint8ClampedArray(N);
    this.crack = new Uint8ClampedArray(N);
    for (let j = 0; j < TH; j++) {
      const lat = (0.5 - (j + 0.5) / TH) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let i = 0; i < TW; i++) {
        const lon = ((i + 0.5) / TW - 0.5) * TAU;
        const x = cl * Math.sin(lon), z = cl * Math.cos(lon), y = sl;
        const e = fbm3(x * 2.2 + 5, y * 2.2, z * 2.2, 5, 1);
        const idx = j * TW + i;
        let r, g, b;
        const ice = smooth(1.12, 1.35, Math.abs(lat) + (fbm3(x * 6, y * 6, z * 6, 3, 8) - 0.5) * 0.4);
        if (e < 0.5) { const d = (0.5 - e) * 2; r = 12 + 20 * (1 - d); g = 46 + 50 * (1 - d); b = 96 + 70 * (1 - d); }
        else {
          const h = (e - 0.5) * 3.2, dry = smooth(0.2, 0.5, fbm3(x * 3 + 9, y * 3, z * 3, 3, 4));
          r = lerp(52, 126, dry) + h * 26; g = lerp(94, 104, dry) + h * 16; b = lerp(52, 70, dry) + h * 14;
        }
        r = lerp(r, 238, ice); g = lerp(g, 242, ice); b = lerp(b, 248, ice);
        this.base[idx * 3] = r; this.base[idx * 3 + 1] = g; this.base[idx * 3 + 2] = b;
        this.cloud[idx] = clamp((fbm3(x * 3.1 + 20, y * 3.1, z * 3.1, 5, 6) - 0.47) * 6, 0, 1) * 235;
        const cr = fbm3(x * 4.2 + 40, y * 4.2, z * 4.2, 3, 11);
        this.crack[idx] = Math.pow(1 - Math.abs(cr * 2 - 1), 6) * 255;
      }
    }
  }

  drawStars(ctx, w, h, t, drift = 0, dim = 1) {
    ctx.fillStyle = '#02030a'; ctx.fillRect(-60, -60, w + 120, h + 120);
    for (const s of this.stars) {
      const x = ((s.x * w + drift * (0.3 + s.b)) % w + w) % w, y = s.y * h;
      const tw = 0.75 + 0.25 * Math.sin(t * 1.3 + s.tw);
      const a = s.b * tw * dim;
      ctx.fillStyle = s.hue < 0.2 ? `rgba(190,205,255,${a})` : s.hue > 0.85 ? `rgba(255,225,190,${a})` : `rgba(235,240,255,${a})`;
      ctx.fillRect(x, y, s.r, s.r);
    }
  }

  /**
   * Draw the planet. p: {cx, cy, R, rot, tilt, def, crack, integrity, t, axis, bh:{lon,lat}}
   * def 0..1 = tidal deformation, crack 0..1 = glowing fractures, integrity 1..0 = fade as it breaks up.
   */
  drawEarth(ctx, w, h, p) {
    this.buildTextures();
    const { cx, cy, R, rot = 0, tilt = 0.35, def = 0, crack = 0, integrity = 1, t = 0, axis = 0.5 } = p;
    if (integrity <= 0.01 || R < 2) return null;
    const bw = Math.min(w, 640), bh = Math.round(bw * h / w);
    if (this.buf.width !== bw || this.buf.height !== bh) { this.buf.width = bw; this.buf.height = bh; this.img = this.bctx.createImageData(bw, bh); }
    const d = this.img.data;
    d.fill(0);
    const kx = w / bw, ky = h / bh;
    const sA = 1 + 0.5 * def, sB = 1 - 0.22 * def;
    const ca = Math.cos(axis), sa = Math.sin(axis), cT = Math.cos(tilt), sT = Math.sin(tilt);
    const Lx = -0.52, Ly = -0.3, Lz = 0.8;
    const lump = 0.07 * def;
    const rMaxX = R * Math.max(sA, 1) * 1.1;
    const i0 = Math.max(0, Math.floor((cx - rMaxX) / kx)), i1 = Math.min(bw - 1, Math.ceil((cx + rMaxX) / kx));
    const j0 = Math.max(0, Math.floor((cy - rMaxX) / ky)), j1 = Math.min(bh - 1, Math.ceil((cy + rMaxX) / ky));
    const thr = 0.88 - 0.4 * crack;
    const bhv = p.bh ? [Math.cos(p.bh.lat) * Math.sin(p.bh.lon), Math.sin(p.bh.lat), Math.cos(p.bh.lat) * Math.cos(p.bh.lon)] : null;
    const edgePx = R / kx;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = ((i + 0.5) * kx - cx) / R, Y = ((j + 0.5) * ky - cy) / R;
        let u1 = (X * ca + Y * sa) / sA, u2 = (-X * sa + Y * ca) / sB;
        let r2 = u1 * u1 + u2 * u2;
        if (r2 > 1.25) continue;
        let edge = 1;
        if (lump > 0 && r2 > 0.4) { const th = Math.atan2(u2, u1); edge = 1 + lump * (Math.sin(3 * th + 1) * 0.6 + Math.sin(7 * th + t * 0.4) * 0.4); }
        const rr = Math.sqrt(r2) / edge;
        if (rr >= 1) continue;
        const vz = Math.sqrt(1 - rr * rr);
        const nx = u1 / edge, ny = u2 / edge;
        const vx = nx * ca - ny * sa, vy = nx * sa + ny * ca;
        const wx = vx * cT + vy * sT, wy = -vx * sT + vy * cT;
        const lon = Math.atan2(wx, vz) + rot, lat = Math.asin(clamp(wy, -1, 1));
        const tu = ((lon / TAU + 0.5) % 1 + 1) % 1, tv = 0.5 - lat / Math.PI;
        const fu = tu * TW - 0.5, fv = clamp(tv * TH - 0.5, 0, TH - 1.001);
        const i0t = Math.floor(fu), ax = fu - i0t, j0t = Math.floor(fv), ay = fv - j0t;
        const ia = ((i0t % TW) + TW) % TW, ib = (ia + 1) % TW;
        const ti = Math.min(TW - 1, Math.max(0, Math.round(fu)) % TW), tj = Math.round(fv);
        const idx = tj * TW + ti;
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        const q00 = (j0t * TW + ia) * 3, q10 = (j0t * TW + ib) * 3, q01 = ((j0t + 1) * TW + ia) * 3, q11 = ((j0t + 1) * TW + ib) * 3;
        const diff = Math.max(0, vx * Lx + vy * Ly + vz * Lz);
        const light = 0.07 + 0.93 * Math.pow(diff, 0.85);
        const B = this.base;
        let r = B[q00] * w00 + B[q10] * w10 + B[q01] * w01 + B[q11] * w11, g = B[q00 + 1] * w00 + B[q10 + 1] * w10 + B[q01 + 1] * w01 + B[q11 + 1] * w11, b = B[q00 + 2] * w00 + B[q10 + 2] * w10 + B[q01 + 2] * w01 + B[q11 + 2] * w11;
        const cu = ((((lon - rot * 0.2 - t * 0.015) / TAU + 0.5) % 1 + 1) % 1) * TW - 0.5;
        const ca0 = ((Math.floor(cu) % TW) + TW) % TW, cax = cu - Math.floor(cu), CL = this.cloud;
        const cl = (CL[j0t * TW + ca0] * (1 - cax) * (1 - ay) + CL[j0t * TW + (ca0 + 1) % TW] * cax * (1 - ay) + CL[(j0t + 1) * TW + ca0] * (1 - cax) * ay + CL[(j0t + 1) * TW + (ca0 + 1) % TW] * cax * ay) / 255 * (1 - 0.6 * def);
        r = lerp(r, 245, cl * 0.85); g = lerp(g, 245, cl * 0.85); b = lerp(b, 248, cl * 0.85);
        r *= light; g *= light; b *= light;
        const rim = Math.pow(1 - vz, 3) * 0.9;
        r += 70 * rim * (0.3 + diff); g += 140 * rim * (0.3 + diff); b += 235 * rim * (0.3 + diff);
        // glowing fractures + molten scar around the hole's entry point
        let glow = 0;
        if (crack > 0.02) {
          const KR = this.crack, cv = (KR[j0t * TW + ia] * w00 + KR[j0t * TW + ib] * w10 + KR[(j0t + 1) * TW + ia] * w01 + KR[(j0t + 1) * TW + ib] * w11) / 255;
          glow = smooth(thr, thr + 0.12, cv) * crack;
          if (bhv) {
            const dp = clamp(wx * bhv[0] + wy * bhv[1] + vz * bhv[2], -1, 1);
            const near = smooth(0.96, 0.999, dp);
            glow = Math.max(glow, near * 0.7 * crack);
            const hot = smooth(0.985, 0.9995, dp) * crack;
            r = lerp(r, 40, hot * 0.7); g = lerp(g, 12, hot * 0.7); b = lerp(b, 8, hot * 0.7);
          }
          r += glow * 255; g += glow * 140; b += glow * 40;
        }
        const o = (j * bw + i) * 4;
        const cover = clamp((1 - rr) * edgePx * 0.7, 0, 1);
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255 * cover * integrity;
      }
    }
    this.bctx.putImageData(this.img, 0, 0);
    // atmosphere glow behind and around the limb
    if (integrity > 0.2) {
      const ag = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.2);
      ag.addColorStop(0, `rgba(110,170,255,${0.55 * integrity})`); ag.addColorStop(0.35, `rgba(90,150,255,${0.2 * integrity})`); ag.addColorStop(1, 'rgba(60,110,255,0)');
      ctx.fillStyle = ag; ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.buf, 0, 0, w, h);
    return this.project(p, w, h);
  }

  /** Screen position of a lon/lat on the planet (null if on the far side). */
  project(p, w, h) {
    if (!p.bh) return null;
    const { cx, cy, R, rot = 0, tilt = 0.35, def = 0, axis = 0.5 } = p;
    const lonr = p.bh.lon - rot;
    const wx = Math.cos(p.bh.lat) * Math.sin(lonr), wy = Math.sin(p.bh.lat), wz = Math.cos(p.bh.lat) * Math.cos(lonr);
    const cT = Math.cos(tilt), sT = Math.sin(tilt), ca = Math.cos(axis), sa = Math.sin(axis);
    const vx = wx * cT - wy * sT, vy = wx * sT + wy * cT;
    const u1 = (vx * ca + vy * sa) * (1 + 0.5 * def), u2 = (-vx * sa + vy * ca) * (1 - 0.22 * def);
    const X = u1 * ca - u2 * sa, Y = u1 * sa + u2 * ca;
    return { x: cx + X * R, y: cy + Y * R, visible: wz > 0.05 };
  }

  /** Stripped atmosphere streaming off the limb (scene 7). */
  drawPlumes(ctx, cx, cy, R, amount, t) {
    if (amount <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of this.plumes) {
      const life = ((t * 0.18 * (0.5 + q.v) + q.t0) % 1);
      const r = R * (1.0 + life * 0.55 * q.v * (0.5 + amount));
      const a = q.a + life * 0.35;
      ctx.fillStyle = q.c > 0.55 ? `rgba(255,170,100,${0.5 * (1 - life) * amount})` : `rgba(150,200,255,${0.45 * (1 - life) * amount})`;
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, q.s, q.s);
    }
    ctx.restore();
  }

  /** Chunks of crust peeling away at the end of scene 7. */
  drawChips(ctx, cx, cy, R, u, t) {
    for (const c of this.chips) {
      if (u < c.t0) continue;
      const k = (u - c.t0) / (1 - c.t0 + 1e-6);
      const r = R * (0.98 + k * c.v * 1.4), a = c.a + c.w * k;
      ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(c.rot + t * c.w * 1.5);
      ctx.fillStyle = '#3a2f2a'; ctx.strokeStyle = `rgba(255,150,60,${0.8 * (1 - k)})`; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let v = 0; v < 6; v++) { const aa = (v / 6) * TAU, rr = c.s * (0.6 + 0.5 * hash(c.rot * 50 + v)); v ? ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : ctx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
}
