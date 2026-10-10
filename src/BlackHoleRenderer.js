// Black hole drawing in screen space: lensing warp, dark horizon, accretion disk with lensed halo.
// The horizon itself is always pure black; light comes only from matter outside it.
import { clamp, smooth, lerp, mulberry32, TAU, heatCss } from './util.js';

const DISK_N = 900;

export class BlackHoleRenderer {
  constructor(doc = document) {
    this.doc = doc;
    this.src = doc.createElement('canvas');
    this.dst = doc.createElement('canvas');
    this.sctx = this.src.getContext('2d', { willReadFrequently: true });
    this.dctx = this.dst.getContext('2d');
    const R = mulberry32(99);
    this.disk = Array.from({ length: DISK_N }, () => ({
      u: Math.pow(R(), 1.5), phi: R() * TAU, w: 0.6 + R() * 0.8, lw: 0.6 + R() * 1.6, hot: R(),
    }));
  }

  /**
   * Warp the pixels already on `main` around (sx,sy).
   * mode 'point': thin-lens deflection, source radius = rho - thetaE^2/rho.
   * mode 'ripple': small radial sinusoid, used for the pre-appearance shimmer.
   * All lengths in CSS px; dpr converts to device px. q is the working resolution factor.
   */
  lens(main, dpr, sx, sy, thetaE, radius, { mode = 'point', phase = 0, amp = 0, q = 0.6 } = {}) {
    radius = Math.min(radius, 170);
    const side = Math.max(8, Math.round(radius * 2 * dpr * q));
    const x0 = (sx - radius) * dpr, y0 = (sy - radius) * dpr, wDev = radius * 2 * dpr;
    if (this.src.width !== side) { this.src.width = side; this.src.height = side; this.dst.width = side; this.dst.height = side; }
    this.sctx.clearRect(0, 0, side, side);
    this.sctx.drawImage(main, x0, y0, wDev, wDev, 0, 0, side, side);
    let img;
    try { img = this.sctx.getImageData(0, 0, side, side); } catch (e) { return; }
    const out = this.dctx.createImageData(side, side);
    const sd = img.data, od = out.data, c = side / 2;
    const tE = (thetaE / radius) * c, Rm = c;
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const dx = i + 0.5 - c, dy = j + 0.5 - c;
        const rho = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        let beta;
        if (mode === 'ripple') beta = rho + Math.sin(rho * 0.35 - phase) * amp * (1 - rho / Rm) * (1 - rho / Rm) * c * 0.06;
        else beta = rho - (tE * tE) / rho;
        const k = beta / rho;
        let fx = c + dx * k - 0.5, fy = c + dy * k - 0.5;
        const o = (j * side + i) * 4;
        if (fx < 0 || fy < 0 || fx >= side - 1 || fy >= side - 1) { od[o + 3] = 0; continue; }
        const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy;
        const p00 = (iy * side + ix) * 4, p10 = p00 + 4, p01 = p00 + side * 4, p11 = p01 + 4;
        for (let ch = 0; ch < 4; ch++) {
          od[o + ch] = (sd[p00 + ch] * (1 - ax) + sd[p10 + ch] * ax) * (1 - ay) + (sd[p01 + ch] * (1 - ax) + sd[p11 + ch] * ax) * ay;
        }
      }
    }
    this.dctx.putImageData(out, 0, 0);
    // feather the outer 35% so the warp blends into the untouched frame
    this.dctx.globalCompositeOperation = 'destination-in';
    const g = this.dctx.createRadialGradient(c, c, c * 0.62, c, c, c);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    this.dctx.fillStyle = g; this.dctx.fillRect(0, 0, side, side);
    this.dctx.globalCompositeOperation = 'source-over';
    return { canvas: this.dst, x: sx - radius, y: sy - radius, size: radius * 2 };
  }

  /** Dark disc (pure black) with a barely visible photon ring. */
  drawHole(ctx, sx, sy, rDark, intensity = 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ringA = 0.1 + 0.4 * intensity;
    ctx.strokeStyle = `rgba(190,215,255,${ringA})`;
    ctx.lineWidth = Math.max(0.6, rDark * 0.05);
    ctx.beginPath(); ctx.arc(sx, sy, rDark * 1.045, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(sx, sy, rDark, 0, TAU); ctx.fill();
  }

  /**
   * Accretion disk: orbiting streaks on a tilted plane, with the far side lensed over the top of the shadow.
   * `inten` 0..1 is how much matter is currently arriving (model-dependent), not a constant.
   */
  drawDisk(ctx, sx, sy, rEH, rDark, t, inten, { tilt = 0.3, tiltRoll = -0.18 } = {}) {
    if (inten <= 0.01) return;
    const rin = 3 * rEH;
    const rout = rin + rEH * (3 + 11 * Math.sqrt(inten));
    const flat = tilt;
    const lw = Math.max(0.8, Math.sqrt(rEH / 14) * 1.7);
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(tiltRoll);
    ctx.globalCompositeOperation = 'lighter';

    // underlying glow
    const glowR = rout * 1.1;
    const gg = ctx.createRadialGradient(0, 0, rin * 0.7, 0, 0, glowR);
    gg.addColorStop(0, `rgba(255,190,110,${0.45 * inten})`);
    gg.addColorStop(0.35, `rgba(255,120,40,${0.2 * inten})`);
    gg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.save(); ctx.scale(1, flat * 1.8 + 0.2); ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, glowR, 0, TAU); ctx.fill(); ctx.restore();

    const place = (d) => {
      const r = rin + d.u * (rout - rin);
      const om = 0.35 * Math.pow(rin / r, 1.5) * d.w;
      const phi = d.phi + om * t * 3;
      const heat = clamp(Math.pow(rin / r, 0.8) * (0.55 + 0.45 * d.hot) * (0.55 + 0.6 * inten), 0, 1);
      const beam = 1 + 0.65 * Math.cos(phi - Math.PI); // approaching (left) side brighter
      return { r, phi, heat, beam, om };
    };
    const streak = (px, py, phi, r, om, flatten, col, lwid) => {
      const a2 = phi - om * 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = lwid;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r * flatten);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    // far side first (behind the shadow), then a lensed halo copy, then the near side over the shadow
    for (const d of this.disk) {
      const q = place(d);
      const px = Math.cos(q.phi) * q.r, py = Math.sin(q.phi) * q.r * flat;
      const a = clamp(0.35 * q.beam * inten * (0.5 + q.heat), 0, 0.9);
      if (Math.sin(q.phi) < 0) {
        streak(px, py, q.phi, q.r, q.om, flat, heatCss(q.heat, a), d.lw * lw);
        // lensed image arcs over the top of the shadow
        const rho = rDark * (1.03 + 0.5 * Math.pow(d.u, 0.7));
        const hx = Math.cos(q.phi) * rho, hy = -Math.abs(Math.sin(q.phi)) * rho;
        ctx.fillStyle = heatCss(clamp(q.heat + 0.15, 0, 1), a * 0.9);
        ctx.fillRect(hx, hy, lw * 1.2, lw * 1.2);
      } else {
        const rho = rDark * (1.02 + 0.18 * d.u);
        ctx.fillStyle = heatCss(q.heat, a * 0.35);
        ctx.fillRect(Math.cos(q.phi) * rho, Math.abs(Math.sin(q.phi)) * rho * 0.9, lw, lw);
      }
    }
    ctx.restore();
    // hole on top of far side
    this.drawHole(ctx, sx, sy, rDark, inten);
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(tiltRoll);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const d of this.disk) {
      const q = place(d);
      if (Math.sin(q.phi) < 0) continue;
      const a = clamp(0.5 * q.beam * inten * (0.55 + q.heat), 0, 1);
      const px = Math.cos(q.phi) * q.r, py = Math.sin(q.phi) * q.r * flat;
      streak(px, py, q.phi, q.r, q.om, flat, heatCss(q.heat, a), d.lw * lw * 1.15);
    }
    ctx.restore();
  }

  /** Expanding thin ring used for the appearance cue (restrained, not an explosion). */
  drawShock(ctx, sx, sy, u, maxR) {
    const r = lerp(2, maxR, 1 - Math.pow(1 - u, 2.2));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(210,225,255,${0.28 * (1 - u)})`;
    ctx.lineWidth = 1.5 + 3 * (1 - u);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
