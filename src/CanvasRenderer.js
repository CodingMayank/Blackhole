// Compositor: owns the canvas, picks the world for the current moment, applies camera, lensing and
// post effects (depth of field, bloom, grain, vignette, exposure, fades). It never advances time itself.
import { clamp, lerp, smooth, ease, mulberry32, keyframes, TAU } from './util.js';
import { STAGE, BH_RS_PX, T_APPEAR, STREET_SIM_END, SPACE_SIM_START, EARTH_R_UNITS } from './constants.js';
import { HEAT_LUT } from './util.js';

const BHX = STAGE.bhX, BHY = STAGE.bhY;

export class CanvasRenderer {
  constructor(canvas, d) {
    Object.assign(this, d); // sceneManager, street, city, space, humans, bh, earth, streetParticles, spaceParticles
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1; this.w = 0; this.h = 0; this.S = 1;
    this.reducedMotion = false;
    this.hud = { shot: '', intensity: 0, view: 'street' };
    this.lastT = -1;
    const mk = () => document.createElement('canvas');
    this.dofSmall = mk(); this.dofTmp = mk(); this.bloomSmall = mk(); this.prev = mk();
    this.grain = mk(); this.grain.width = this.grain.height = 160;
    const g = this.grain.getContext('2d'), id = g.createImageData(160, 160), R = mulberry32(42);
    for (let i = 0; i < id.data.length; i += 4) { const v = R() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0);
    this.resize();
  }

  resize() {
    const c = this.canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = Math.max(2, c.clientWidth); this.h = Math.max(2, c.clientHeight);
    c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr);
    for (const k of [this.dofTmp, this.prev]) { k.width = c.width; k.height = c.height; }
    this.dofSmall.width = Math.max(8, c.width >> 3); this.dofSmall.height = Math.max(8, c.height >> 3);
    this.bloomSmall.width = Math.max(8, c.width >> 2); this.bloomSmall.height = Math.max(8, c.height >> 2);
    this.S = Math.max(this.w / STAGE.w, this.h / STAGE.h);
    this.lastT = -1;
  }

  syncSims(t) {
    this.streetParticles.simulateTo(Math.min(t, STREET_SIM_END));
    this.spaceParticles.simulateTo(t >= SPACE_SIM_START ? Math.max(t - SPACE_SIM_START, 1 / 60) : 0);
  }

  accretionLevel(t) {
    const sm = this.sceneManager;
    return clamp(sm.scriptedAccretion(t) + clamp(this.streetParticles.accretion / 45, 0, 1) * 0.55, 0, 1);
  }

  render(t) {
    const { ctx, w, h, dpr, sceneManager: sm } = this;
    const reduced = this.reducedMotion;
    this.syncSims(t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const { view, shot } = sm.viewAt(t);
    const shk = sm.shakeAt(t, reduced);
    const loc = sm.locate(t);
    let inten = 0, focus = { x: w / 2, y: h / 2 };

    if (view === 'street') ({ inten, focus } = this.renderStreet(t, shk));
    else if (view === 'aerial') ({ inten, focus } = this.renderAerial(t, shk));
    else if (view === 'region') ({ inten, focus } = this.renderRegion(t, shk));
    else if (view === 'earth') ({ inten, focus } = this.renderEarth(t, loc, shk));
    else ({ inten, focus } = this.renderSpace(t, loc, shk));

    this.hud.shot = shot; this.hud.intensity = inten; this.hud.view = view;
    this.post(t, view, inten, focus, reduced);
    this.lastT = t;
  }

  // ----- street world ------------------------------------------------------------------------
  streetTransform(ctx, cam, shk) {
    const k = this.S * cam.zoom;
    ctx.translate(this.w / 2 + shk.x, this.h / 2 + shk.y); ctx.scale(k, k); ctx.translate(-cam.x, -cam.y);
    return k;
  }

  renderStreet(t, shk) {
    const { ctx, w, h, sceneManager: sm } = this;
    const cam = sm.cameraAt(t);
    ctx.save();
    const k = this.streetTransform(ctx, cam, shk);
    this.street.drawBack(ctx, t);
    this.humans.draw(ctx, t);
    this.streetParticles.draw(ctx, { glow: false, unit: 1 / k });
    this.street.drawFront(ctx, t);
    ctx.restore();

    // atmosphere: dust tint and the dramatic exposure drop
    const dust = smooth(14, 50, t);
    if (dust > 0) { ctx.fillStyle = `rgba(96,70,52,${0.32 * dust})`; ctx.fillRect(0, 0, w, h); }
    const dark = (t >= 46 && t < 52 ? 0.55 : 0.55 * smooth(30, 44, t));
    if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, w, h); }

    ctx.save(); this.streetTransform(ctx, cam, shk);
    ctx.globalCompositeOperation = 'lighter';
    this.streetParticles.draw(ctx, { glow: true, unit: 1 / k });
    ctx.restore();

    const sx = w / 2 + shk.x + (BHX - cam.x) * k, sy = h / 2 + shk.y + (BHY - cam.y) * k;
    const inten = this.accretionLevel(t);
    const rEH = Math.max(1.2, BH_RS_PX * k);
    if (t >= 9.2 && t < T_APPEAR) { // brief pre-appearance shimmer
      const a = Math.sin(smooth(9.2, 10.1, t) * Math.PI) * (1 - smooth(10.1, T_APPEAR, t));
      if (a > 0.01) this.paintLens(this.bh.lens(this.canvas, this.dpr, sx, sy, 0, 170, { mode: 'ripple', phase: t * 30, amp: a * 5 }));
    }
    if (t >= T_APPEAR) {
      const thetaE = rEH * 3, radius = Math.max(24, thetaE * 4);
      if (thetaE > 1.5) this.paintLens(this.bh.lens(this.canvas, this.dpr, sx, sy, thetaE, radius));
      const rDark = rEH * (1 + 1.6 * smooth(0.1, 0.7, inten));
      this.bh.drawDisk(ctx, sx, sy, rEH, rDark, t, inten);
      if (inten <= 0.01) this.bh.drawHole(ctx, sx, sy, rDark, 0);
      const sh = sm.shockAt(t);
      if (sh !== null) this.bh.drawShock(ctx, sx, sy, sh, Math.min(w, h) * 0.5);
    }
    return { inten, focus: { x: sx, y: sy } };
  }

  paintLens(res) {
    if (res) this.ctx.drawImage(res.canvas, res.x, res.y, res.size, res.size);
  }

  // ----- aerial / regional -------------------------------------------------------------------
  renderAerial(t, shk) {
    const { ctx, w, h, S } = this;
    ctx.save();
    ctx.translate(w / 2 + shk.x, h / 2 + shk.y); ctx.scale(S, S); ctx.translate(-800, -450);
    this.city.drawAerial(ctx, t, t - 52);
    ctx.restore();
    const sx = w / 2 + shk.x, sy = h / 2 + shk.y;
    const rEH = 4 * S, inten = 0.9;
    this.paintLens(this.bh.lens(this.canvas, this.dpr, sx, sy, rEH * 3, rEH * 14));
    this.bh.drawDisk(ctx, sx, sy, rEH, rEH * 2.6, t, inten, { tilt: 0.35 });
    return { inten, focus: { x: sx, y: sy } };
  }

  renderRegion(t, shk) {
    const { ctx, w, h, S } = this;
    ctx.save();
    ctx.translate(w / 2 + shk.x, h / 2 + shk.y); ctx.scale(S, S); ctx.translate(-800, -450);
    this.city.drawRegion(ctx, t, t - 55);
    ctx.restore();
    return { inten: 0.6, focus: { x: w / 2, y: h * 0.7 } };
  }

  // ----- Earth from space (scene 7) ----------------------------------------------------------
  renderEarth(t, loc, shk) {
    const { ctx, w, h } = this;
    const u = loc.u, min = Math.min(w, h);
    this.earth.drawStars(ctx, w, h, t, t * 2);
    const sc = Math.exp(lerp(Math.log(2.9), Math.log(0.78), ease(smooth(0, 0.92, u))));
    const R = 0.5 * min * sc;
    const p = {
      cx: w / 2 + shk.x, cy: h / 2 + shk.y, R, rot: 0.04 + u * 0.3, tilt: 0.35, axis: 0.5, t,
      def: 0.7 * smooth(0.1, 1, u), crack: 0.2 + 0.8 * smooth(0, 0.85, u), integrity: 1,
      bh: { lon: 0.02, lat: 0.0 },
    };
    const mark = this.earth.drawEarth(ctx, w, h, p);
    this.earth.drawPlumes(ctx, p.cx, p.cy, R, smooth(0.25, 0.9, u), t);
    this.earth.drawChips(ctx, p.cx, p.cy, R, u, t);
    // schematic marker that sinks toward the centre of the planet
    let pos = mark && mark.visible ? { x: mark.x, y: mark.y } : { x: p.cx, y: p.cy };
    const sink = smooth(0.4, 1, u);
    pos = { x: lerp(pos.x, p.cx, sink), y: lerp(pos.y, p.cy, sink) };
    const rEH = Math.max(2.5, min * 0.006);
    if (sink > 0.02) {
      ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,200,150,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, rEH * 6, 0, TAU); ctx.stroke(); ctx.restore();
    }
    this.bh.drawDisk(ctx, pos.x, pos.y, rEH, rEH * 2.6, t, 0.55 + 0.3 * u);
    return { inten: 0.5 + 0.3 * u, focus: pos };
  }

  // ----- breakup and aftermath (scenes 8-9) --------------------------------------------------
  renderSpace(t, loc, shk) {
    const { ctx, w, h } = this;
    const min = Math.min(w, h), tl = t - SPACE_SIM_START;
    const z0 = (0.39 * min) / EARTH_R_UNITS;
    const [lz] = keyframes([[0, 0], [8, Math.log(0.9)], [14, Math.log(0.7)], [20, Math.log(0.55)], [26, Math.log(0.45)]], tl);
    const zoom = z0 * Math.exp(lz);
    const cx = w / 2 + shk.x, cy = h / 2 + shk.y;
    const u8 = clamp(tl / 14, 0, 1), u9 = clamp((tl - 14) / 12, 0, 1);
    this.earth.drawStars(ctx, w, h, t, t * 1.5, 1 - 0.3 * u9);
    const integrity = 1 - smooth(0.02, 0.4, u8);
    if (integrity > 0.01) {
      this.earth.drawEarth(ctx, w, h, {
        cx, cy, R: EARTH_R_UNITS * zoom, rot: 0.34 + tl * 0.02, tilt: 0.35, axis: 0.5, t,
        def: 0.7 + 0.3 * smooth(0, 0.5, u8), crack: 1, integrity, bh: { lon: 0.0, lat: 0.0 },
      });
    }
    const alpha = 1 - 0.65 * smooth(0, 1, u9);
    const heatOf = (x, y) => clamp(1.15 * Math.pow(36 / (Math.hypot(x, y) + 10), 0.9), 0, 1);
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(zoom, zoom);
    this.spaceParticles.draw(ctx, { glow: false, alpha, heatOf, unit: 1 / zoom });
    ctx.globalCompositeOperation = 'lighter';
    this.spaceParticles.draw(ctx, { glow: true, alpha, heatOf, unit: 1 / zoom });
    ctx.restore();
    const inten = clamp(this.spaceParticles.accretion / 30, 0, 1) * 0.8 + 0.15;
    const level = inten * (1 - 0.5 * smooth(0.4, 1, u9));
    const rEH = Math.max(2.2, 0.0075 * min);
    this.paintLens(this.bh.lens(this.canvas, this.dpr, cx, cy, rEH * 3, rEH * 14));
    this.bh.drawDisk(ctx, cx, cy, rEH, rEH * 2.6, t, level, { tilt: 0.3 });
    return { inten: level, focus: { x: cx, y: cy } };
  }

  // ----- post-processing ---------------------------------------------------------------------
  post(t, view, inten, focus, reduced) {
    const { ctx, w, h, dpr, sceneManager: sm, canvas } = this;
    // depth of field: blurred copy blended in toward the edges
    const dof = sm.dofAt(t);
    if (dof > 0.02 && view === 'street') {
      const sctx = this.dofSmall.getContext('2d');
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(canvas, 0, 0, this.dofSmall.width, this.dofSmall.height);
      const tc = this.dofTmp.getContext('2d');
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, this.dofTmp.width, this.dofTmp.height);
      tc.imageSmoothingEnabled = true;
      tc.drawImage(this.dofSmall, 0, 0, this.dofTmp.width, this.dofTmp.height);
      tc.globalCompositeOperation = 'destination-in';
      const fx = focus.x * dpr, fy = focus.y * dpr, m = Math.min(this.dofTmp.width, this.dofTmp.height);
      const g = tc.createRadialGradient(fx, fy, m * 0.12, fx, fy, m * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      tc.fillStyle = g; tc.fillRect(0, 0, this.dofTmp.width, this.dofTmp.height);
      ctx.save(); ctx.globalAlpha = dof; ctx.drawImage(this.dofTmp, 0, 0, w, h); ctx.restore();
    }
    // bloom from bright accretion light
    const bloom = view === 'space' || view === 'earth' ? 0.2 : clamp(inten, 0, 1) * 0.2;
    if (bloom > 0.03) {
      const bctx = this.bloomSmall.getContext('2d');
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(canvas, 0, 0, this.bloomSmall.width, this.bloomSmall.height);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = bloom;
      ctx.drawImage(this.bloomSmall, 0, 0, w, h); ctx.restore();
    }
    // exposure
    const e = sm.exposureAt(t, reduced);
    if (e < 0) { ctx.fillStyle = `rgba(0,0,0,${-e})`; ctx.fillRect(0, 0, w, h); }
    else if (e > 0) { ctx.fillStyle = `rgba(255,245,230,${Math.min(0.12, e)})`; ctx.fillRect(0, 0, w, h); }
    // motion-blur ghost while the camera moves fast or a cut is under way
    if (this.lastT >= 0 && Math.abs(t - this.lastT) < 0.2 && !reduced) {
      const c0 = sm.cameraAt(t), c1 = sm.cameraAt(Math.max(0, t - 0.06));
      const sp = Math.abs(Math.log(c0.zoom / c1.zoom)) / 0.06;
      const ga = clamp(sp * 0.35 + (sm.inCut(t) ? 0.25 : 0), 0, 0.4);
      if (ga > 0.02) {
        ctx.save(); ctx.globalAlpha = ga;
        const sc = 1 + 0.01 * ga;
        ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(this.prev, 0, 0, w, h); ctx.restore();
      }
    }
    // film grain
    ctx.save();
    ctx.globalAlpha = reduced ? 0.03 : 0.055; ctx.globalCompositeOperation = 'overlay';
    const fr = reduced ? 0 : Math.floor(t * 24);
    const ox = (fr * 37) % 160, oy = (fr * 91) % 160;
    for (let y = -oy; y < h; y += 160) for (let x = -ox; x < w; x += 160) ctx.drawImage(this.grain, x, y);
    ctx.restore();
    // vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) * 0.58);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${view === 'space' ? 0.7 : 0.55})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    // fades and dips
    const f = sm.fadeAt(t);
    if (f > 0.001) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, w, h); }
    // keep a copy for next frame's ghost
    this.prev.getContext('2d').drawImage(canvas, 0, 0);
  }
}
