// Street-level world (scenes 1-6), plus the aerial and regional views used in scene 6.
// All drawing is in stage coordinates (1600x900). Every function is pure in t.
import { mulberry32, clamp, lerp, smooth, hash, TAU, fbm3 } from './util.js';
import { STAGE, T_APPEAR } from './constants.js';

const BX = STAGE.bhX, BY = STAGE.bhY;
const BASE_Y = 560; // base of the background buildings
const X0 = -1300, X1 = 2900;

export class StreetRenderer {
  constructor(seed = 3) {
    const R = mulberry32(seed);
    this.skyline = [[], []];
    for (let l = 0; l < 2; l++) {
      for (let x = X0; x < X1; x += 40 + R() * 60) this.skyline[l].push({ x, w: 30 + R() * 70, h: (l ? 90 : 60) + R() * (l ? 200 : 140) });
    }
    this.buildings = [];
    let x = X0;
    while (x < X1) {
      const w = 170 + R() * 120;
      this.buildings.push({
        x, w, h: 250 + R() * 190, style: (R() * 3) | 0, seed: R() * 1000,
        cols: Math.max(4, Math.floor(w / 28)), rows: 0, tone: R(),
      });
      x += w + 4 + R() * 8;
    }
    for (const b of this.buildings) b.rows = Math.floor(b.h / 34);
    this.clouds = Array.from({ length: 9 }, (_, i) => ({ x: R() * 2400 - 400, y: 40 + R() * 300, s: 0.7 + R() * 1.1, sp: 4 + R() * 9, seed: i * 13.7 }));
    this.cars = [
      { x0: 100, lane: 575, dir: 1, speed: 70, col: '#a83a32', s: 0.9 }, { x0: 900, lane: 575, dir: 1, speed: 60, col: '#d7d2c4', s: 0.9 },
      { x0: 1500, lane: 606, dir: -1, speed: 85, col: '#2f4a6b', s: 1.0 }, { x0: 400, lane: 606, dir: -1, speed: 75, col: '#2a2a2e', s: 1.0 },
      { x0: 1100, lane: 606, dir: -1, speed: 65, col: '#c9a23c', s: 1.0 },
    ];
    this.lamps = [180, 560, 1040, 1420].map((x, i) => ({ x, z: 0.1, seed: i }));
    this.cracks = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * TAU + R() * 0.3, len: 60 + R() * 330, seed: R() * 99 }));
    this.treeSeed = R() * 50;
  }

  damage(t) { return smooth(24, 50, t); }

  drawBack(ctx, t) {
    this.drawSky(ctx, t);
    this.drawSkyline(ctx, t);
    this.drawBuildings(ctx, t);
    this.drawRoad(ctx, t);
    this.drawPlaza(ctx, t);
    for (const l of this.lamps) this.drawLamp(ctx, l.x, 650, 0.8, t, l.seed);
    this.drawBench(ctx, 330, 668, 0.9);
    this.drawBench(ctx, 1290, 672, 0.9);
  }

  drawFront(ctx, t) {
    this.drawLamp(ctx, 40, 800, 1.45, t, 7);
    this.drawLamp(ctx, 1570, 810, 1.5, t, 9);
    this.drawTree(ctx, 1480, 790, 1.5, t);
    // warm haze at the horizon
    const g = ctx.createLinearGradient(0, 430, 0, 660);
    g.addColorStop(0, 'rgba(255,225,185,0)'); g.addColorStop(0.55, 'rgba(255,222,180,0.22)'); g.addColorStop(1, 'rgba(255,222,180,0)');
    ctx.fillStyle = g; ctx.fillRect(X0, 430, X1 - X0, 230);
  }

  drawSky(ctx, t) {
    const g = ctx.createLinearGradient(0, -900, 0, 520);
    g.addColorStop(0, '#27456f'); g.addColorStop(0.45, '#6b8fba'); g.addColorStop(0.8, '#c8d3d8'); g.addColorStop(1, '#f4d9ad');
    ctx.fillStyle = g; ctx.fillRect(X0, -1300, X1 - X0, 1830);
    const sg = ctx.createRadialGradient(330, 330, 0, 330, 330, 780);
    sg.addColorStop(0, 'rgba(255,240,196,0.9)'); sg.addColorStop(0.25, 'rgba(255,226,170,0.35)'); sg.addColorStop(1, 'rgba(255,210,150,0)');
    ctx.fillStyle = sg; ctx.fillRect(-500, -450, 1700, 1500);
    ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(330, 330, 36, 0, TAU); ctx.fill();
    const pull = smooth(30, 55, t);
    for (const c of this.clouds) {
      let cx = ((c.x + c.sp * t + 600) % 2800) - 600, cy = c.y;
      cx += (BX - cx) * 0.15 * pull; cy += (BY - 260 - cy) * 0.12 * pull;
      this.drawCloud(ctx, cx, cy, c.s, c.seed);
    }
  }

  drawCloud(ctx, x, y, s, seed) {
    for (let i = 0; i < 7; i++) {
      const ox = (i - 3) * 38 * s + (hash(seed + i) - 0.5) * 20, oy = (hash(seed + i * 3) - 0.5) * 18 * s;
      const r = (34 + hash(seed + i * 7) * 26) * s;
      const g = ctx.createRadialGradient(x + ox, y + oy - r * 0.2, 0, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.92)'); g.addColorStop(0.7, 'rgba(248,226,214,0.7)'); g.addColorStop(1, 'rgba(240,205,190,0)');
      ctx.fillStyle = g; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }

  drawSkyline(ctx) {
    ctx.fillStyle = 'rgba(150,172,196,0.85)';
    for (const b of this.skyline[0]) ctx.fillRect(b.x, BASE_Y - b.h, b.w, b.h + 4);
    ctx.fillStyle = 'rgba(122,146,172,0.95)';
    for (const b of this.skyline[1]) ctx.fillRect(b.x, BASE_Y - b.h, b.w, b.h + 4);
  }

  drawBuildings(ctx, t) {
    const dmg = this.damage(t);
    const palettes = [['#d9cdb6', '#b5a58a'], ['#a9b6c4', '#7f93a8'], ['#c9c2b8', '#9a9288']];
    for (const b of this.buildings) {
      const cx = b.x + b.w / 2;
      if (cx < -300 || cx > 1900) { this.drawBuildingCheap(ctx, b, palettes); continue; }
      const dir = Math.sign(BX - cx) || 1;
      const near = 1 - clamp(Math.abs(cx - BX) / 1100, 0, 1);
      const skew = -dir * dmg * 0.14 * (0.4 + near);
      const [c1, c2] = palettes[b.style];
      ctx.save();
      ctx.translate(cx, BASE_Y);
      ctx.transform(1, 0, skew, 1 - 0.05 * dmg * near, 0, 0);
      const x = -b.w / 2, y = -b.h;
      const g = ctx.createLinearGradient(x, 0, x + b.w, 0);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - 3, y - 6, b.w + 6, 8);
      // windows
      const ww = (b.w - 20) / b.cols;
      const lit = [], dark = [], broken = [];
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          const h = hash(b.seed + r * 17 + c * 3.1);
          const wx = x + 10 + c * ww + 3, wy = y + 16 + r * 34, w = ww - 6, hh = 22;
          if (h < dmg * 0.7 * (0.4 + near)) broken.push([wx, wy, w, hh]);
          else if (h > 0.86) lit.push([wx, wy, w, hh]); else dark.push([wx, wy, w, hh]);
        }
      }
      ctx.fillStyle = b.style === 1 ? '#5d7893' : '#6f8aa6'; for (const r of dark) ctx.fillRect(...r);
      ctx.fillStyle = '#ffdca0'; for (const r of lit) ctx.fillRect(...r);
      ctx.fillStyle = '#17171b'; for (const r of broken) ctx.fillRect(...r);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; for (const r of dark) ctx.fillRect(r[0], r[1], r[2], 4);
      if (dmg > 0.2) { // cracks
        ctx.strokeStyle = 'rgba(25,22,20,0.7)'; ctx.lineWidth = 2;
        const n = Math.floor(dmg * 6);
        for (let k = 0; k < n; k++) {
          let px = x + hash(b.seed + k) * b.w, py = y + hash(b.seed + k * 2) * b.h * 0.4;
          ctx.beginPath(); ctx.moveTo(px, py);
          for (let s = 0; s < 6; s++) { px += (hash(b.seed + k + s * 5) - 0.5) * 30; py += 20 + hash(b.seed + s) * 25; ctx.lineTo(px, py); }
          ctx.stroke();
        }
      }
      ctx.fillStyle = `rgba(70,50,40,${dmg * 0.4 * (0.3 + near)})`; ctx.fillRect(x, y, b.w, b.h);
      ctx.restore();
    }
  }

  drawBuildingCheap(ctx, b, palettes) {
    ctx.fillStyle = palettes[b.style][1]; ctx.fillRect(b.x, BASE_Y - b.h, b.w, b.h);
  }

  drawRoad(ctx, t) {
    ctx.fillStyle = '#4a4d53'; ctx.fillRect(X0, BASE_Y, X1 - X0, 72);
    ctx.fillStyle = '#a8a39a'; ctx.fillRect(X0, 620, X1 - X0, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X0, BASE_Y - 4, X1 - X0, 6);
    ctx.fillStyle = '#d8c25a';
    for (let x = X0; x < X1; x += 110) ctx.fillRect(x, 590, 60, 3);
    ctx.fillStyle = 'rgba(240,240,240,0.7)';
    ctx.fillRect(X0, 563, X1 - X0, 2); ctx.fillRect(X0, 617, X1 - X0, 2);
    const p = smooth(14, 36, t), tt = Math.min(t, 12.5);
    for (const c of this.cars) {
      const xn = wrap(c.x0 + c.dir * c.speed * tt, -250, 1850);
      const f = p * Math.exp(-Math.pow((xn - BX) / 700, 2));
      const x = xn + (BX - xn) * f * 0.85, y = c.lane - f * 260 * (c.lane === 575 ? 1.1 : 0.9);
      this.drawCar(ctx, x, y, c.dir, c.col, c.s, f * 0.9 * c.dir * (xn < BX ? 1 : -1));
    }
  }

  drawCar(ctx, x, y, dir, col, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(dir * s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 4, 70, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(-66, 0); ctx.lineTo(-66, -22); ctx.lineTo(-44, -26); ctx.lineTo(-28, -44); ctx.lineTo(18, -44); ctx.lineTo(40, -26); ctx.lineTo(66, -20); ctx.lineTo(66, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(150,185,215,0.9)'; ctx.beginPath();
    ctx.moveTo(-26, -27); ctx.lineTo(-18, -40); ctx.lineTo(14, -40); ctx.lineTo(30, -27); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-64, -22, 126, 3);
    ctx.fillStyle = '#17171b';
    for (const wx of [-38, 38]) { ctx.beginPath(); ctx.arc(wx, 0, 11, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ffe9b0'; ctx.fillRect(60, -16, 6, 5);
    ctx.restore();
  }

  drawPlaza(ctx, t) {
    const g = ctx.createLinearGradient(0, 632, 0, 1300);
    g.addColorStop(0, '#c4bdae'); g.addColorStop(1, '#8c867a');
    ctx.fillStyle = g; ctx.fillRect(X0, 632, X1 - X0, 700);
    ctx.strokeStyle = 'rgba(100,94,84,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let xi = -4000; xi <= 5600; xi += 130) {
      ctx.moveTo(800 + (xi - 800) * (132 / 400), 632); ctx.lineTo(800 + (xi - 800) * (800 / 400), 1300);
    }
    for (let j = 0; ; j++) { const y = 500 + 132 * Math.pow(1.22, j); if (y > 1300) break; ctx.moveTo(X0, y); ctx.lineTo(X1, y); }
    ctx.stroke();
    // light spill from the sun side
    const lg = ctx.createLinearGradient(X0, 0, 1900, 0);
    lg.addColorStop(0, 'rgba(255,230,180,0.2)'); lg.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = lg; ctx.fillRect(X0, 632, X1 - X0, 700);
    this.drawCracks(ctx, t);
  }

  drawCracks(ctx, t) {
    const ext = smooth(12, 40, t) * (t >= T_APPEAR ? 1 : 0);
    if (ext <= 0) return;
    const fx = BX, fy = 705;
    const dg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 380 * ext);
    dg.addColorStop(0, `rgba(20,16,14,${0.5 * ext})`); dg.addColorStop(1, 'rgba(20,16,14,0)');
    ctx.save(); ctx.translate(fx, fy); ctx.scale(1, 0.32); ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(0, 0, 380 * ext, 0, TAU); ctx.fill(); ctx.restore();
    ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? 'rgba(235,225,205,0.35)' : 'rgba(22,18,16,0.9)';
      ctx.lineWidth = pass ? 1 : 2.6;
      for (const c of this.cracks) {
        const L = c.len * ext;
        let px = fx, py = fy;
        ctx.beginPath(); ctx.moveTo(px, py + pass);
        const n = 9;
        for (let s = 1; s <= n; s++) {
          const a = c.a + (hash(c.seed + s * 4) - 0.5) * 0.5, d = (L / n);
          px += Math.cos(a) * d; py += Math.sin(a) * d * 0.32;
          ctx.lineTo(px, py + pass);
        }
        ctx.stroke();
      }
    }
  }

  drawLamp(ctx, x, baseY, s, t, seed) {
    const dmg = this.damage(t);
    const lean = Math.sign(BX - x) * dmg * (0.18 + 0.5 * (1 - clamp(Math.abs(x - BX) / 1000, 0, 1)));
    const flick = t > T_APPEAR && hash(Math.floor(t * 12) + seed) > 0.6 + 0.3 * (1 - dmg) ? 0.3 : 1;
    ctx.save(); ctx.translate(x, baseY); ctx.rotate(lean); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(2, -2, 90, 3);
    ctx.strokeStyle = '#2f3237'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -250); ctx.quadraticCurveTo(0, -278, 28, -278); ctx.stroke();
    ctx.fillStyle = '#d9d4c6'; ctx.fillRect(18, -276, 26, 7);
    ctx.fillStyle = `rgba(255,236,190,${0.9 * flick})`; ctx.fillRect(22, -270, 18, 3);
    ctx.restore();
  }

  drawBench(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-5, 0, 130, 6);
    ctx.fillStyle = '#6a4a33'; ctx.fillRect(0, -32, 120, 7); ctx.fillRect(0, -50, 120, 6);
    ctx.fillStyle = '#2f3237'; ctx.fillRect(6, -26, 5, 26); ctx.fillRect(109, -26, 5, 26);
    ctx.restore();
  }

  drawTree(ctx, x, y, s, t) {
    const sway = Math.sin(t * 0.8) * 3 + (t > T_APPEAR ? Math.sign(BX - x) * smooth(11, 40, t) * 24 : 0);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#4a3828'; ctx.fillRect(-9, -190, 18, 190);
    for (let i = 0; i < 9; i++) {
      const ox = Math.cos(i * 1.7) * 70 + sway, oy = -250 + Math.sin(i * 2.3) * 55;
      const g = ctx.createRadialGradient(ox - 14, oy - 14, 4, ox, oy, 70);
      g.addColorStop(0, '#6f9a52'); g.addColorStop(1, '#2f5a30');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, 62, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function wrap(x, a, b) { const w = b - a; return a + ((((x - a) % w) + w) % w); }

// -------------------------------------------------------------------------------------------
// Aerial (top-down) city and the regional high-altitude view. Stage coordinates, centre (800,450).
// -------------------------------------------------------------------------------------------
export class CityScaleRenderer {
  constructor(doc = document, seed = 11) {
    const R = mulberry32(seed);
    this.blocks = [];
    const roadX = 170, roadY = 140;
    for (let gx = -1100; gx < 2700; gx += roadX) {
      for (let gy = -800; gy < 1700; gy += roadY) {
        const park = R() < 0.09;
        const b = { x: gx + 12, y: gy + 12, w: roadX - 24, h: roadY - 24, park, bl: [] };
        if (!park) for (let i = 0; i < 4; i++) {
          const bw = b.w / 2 - 4, bh = b.h / 2 - 4;
          b.bl.push({ x: b.x + (i % 2) * (bw + 8) + 2, y: b.y + ((i / 2) | 0) * (bh + 8) + 2, w: bw, h: bh, ht: 6 + R() * 50, tone: R(), seed: R() * 100 });
        }
        this.blocks.push(b);
      }
    }
    this.debris = Array.from({ length: 900 }, () => ({ f: R(), a: R() * TAU, s: 1.2 + R() * 3, w: 0.6 + R() * 0.8 }));
    // regional ground texture
    const W = 512, H = 512;
    const c = doc.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const n = fbm3(i / 90, j / 90, 3.3, 5, 4), m = fbm3(i / 30, j / 30, 9.1, 3, 5);
      const o = (j * W + i) * 4;
      const land = n > 0.46;
      let r, gg, b;
      if (!land) { r = 30; gg = 70 + n * 60; b = 110 + n * 70; }
      else { const k = (n - 0.46) * 3; r = 86 + k * 90 + m * 30; gg = 112 + k * 40 + m * 25; b = 66 + k * 40; }
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.ground = c;
  }

  damageRadius(u) { return 70 + 470 * (1 - Math.pow(1 - u, 1.6)); }

  /** t6: seconds into the aerial shot (0..3) */
  drawAerial(ctx, t, t6) {
    const u = clamp(t6 / 3, 0, 1);
    const zoom = lerp(1.5, 0.85, smooth(0, 1, u));
    const rot = 0.2 * u;
    const Rd = this.damageRadius(u);
    ctx.save();
    ctx.translate(800, 450); ctx.scale(zoom, zoom); ctx.rotate(rot); ctx.translate(-800, -450);
    ctx.fillStyle = '#3c3f45'; ctx.fillRect(-1200, -900, 4000, 2800);
    for (const b of this.blocks) {
      if (b.x + b.w < -300 || b.x > 1900 || b.y + b.h < -250 || b.y > 1150) continue;
      ctx.fillStyle = '#868b81'; ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.park) { ctx.fillStyle = '#5d7d4f'; ctx.fillRect(b.x, b.y, b.w, b.h); continue; }
      for (const bl of b.bl) {
        const cx = bl.x + bl.w / 2, cy = bl.y + bl.h / 2;
        const d = Math.hypot(cx - 800, cy - 450);
        if (d < Rd * 0.3) continue;
        ctx.save();
        let ht = bl.ht;
        if (d < Rd) {
          const k = 1 - d / Rd;
          ctx.translate(800, 450); ctx.rotate(1.9 * Math.pow(k, 1.5) * (0.3 + u)); ctx.translate(-800, -450);
          ht *= 1 - 0.8 * k;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bl.x + ht * 0.4, bl.y + ht * 0.4, bl.w, bl.h);
        const tone = 150 + bl.tone * 70;
        const burnt = d < Rd ? 1 - d / Rd : 0;
        ctx.fillStyle = `rgb(${tone * (1 - burnt * 0.5) | 0},${tone * (1 - burnt * 0.55) | 0},${(tone - 8) * (1 - burnt * 0.6) | 0})`;
        ctx.fillRect(bl.x, bl.y, bl.w, bl.h);
        ctx.restore();
      }
    }
    // dust and heat inside the damaged area
    const dg = ctx.createRadialGradient(800, 450, 0, 800, 450, Rd * 1.25);
    dg.addColorStop(0, 'rgba(18,12,10,0.95)'); dg.addColorStop(0.35, 'rgba(60,40,30,0.55)'); dg.addColorStop(0.85, 'rgba(150,120,95,0.25)'); dg.addColorStop(1, 'rgba(150,120,95,0)');
    ctx.fillStyle = dg; ctx.fillRect(800 - Rd * 1.3, 450 - Rd * 1.3, Rd * 2.6, Rd * 2.6);
    // spiral debris
    ctx.fillStyle = '#e0cba5';
    for (const p of this.debris) {
      const r = Rd * (0.08 + 1.15 * Math.pow(p.f, 0.8));
      const th = p.a + (t * 0.9 * p.w) / (r / 90 + 0.6);
      const hot = 1 - clamp(r / (Rd * 0.5), 0, 1);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = hot > 0.3 ? '#ffb060' : '#e0cba5';
      ctx.fillRect(800 + Math.cos(th) * r, 450 + Math.sin(th) * r, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return { sx: 0, sy: 0, zoom };
  }

  /** t6: seconds into the regional shot (0..3) */
  drawRegion(ctx, t, t6) {
    const u = clamp(t6 / 3, 0, 1);
    const hy = lerp(360, 300, u);
    const sg = ctx.createLinearGradient(0, -400, 0, hy + 20);
    sg.addColorStop(0, '#01030a'); sg.addColorStop(0.55, '#0e2447'); sg.addColorStop(0.9, '#3f78bd'); sg.addColorStop(1, '#9fd0f5');
    ctx.fillStyle = sg; ctx.fillRect(-600, -600, 2800, hy + 640);
    // ground disc (large circle so the horizon curves)
    const Rg = 5200, cy = hy + Rg;
    ctx.save();
    ctx.beginPath(); ctx.arc(800, cy, Rg, 0, TAU); ctx.clip();
    const k = lerp(2.4, 1.5, u);
    ctx.translate(800, 640); ctx.scale(k, k * 0.62); ctx.rotate(0.1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.ground, -512, -512, 1024, 1024);
    ctx.restore();
    // haze toward the horizon
    const hg = ctx.createLinearGradient(0, hy - 10, 0, hy + 260);
    hg.addColorStop(0, 'rgba(190,220,250,0.85)'); hg.addColorStop(1, 'rgba(190,220,250,0)');
    ctx.fillStyle = hg; ctx.fillRect(-600, hy - 10, 2800, 270);
    // thin atmosphere along the limb
    const ag = ctx.createRadialGradient(800, cy, Rg - 20, 800, cy, Rg + 90);
    ag.addColorStop(0, 'rgba(120,180,255,0.0)'); ag.addColorStop(0.2, 'rgba(120,180,255,0.7)'); ag.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = ag; ctx.fillRect(-600, hy - 120, 2800, 220);
    // scar, swirling cloud arms and a rising dust column over the city
    const sx = 800, sy = 640;
    const sc = ctx.createRadialGradient(sx, sy, 0, sx, sy, 300);
    sc.addColorStop(0, 'rgba(10,6,5,0.95)'); sc.addColorStop(0.4, 'rgba(60,30,20,0.7)'); sc.addColorStop(1, 'rgba(60,40,30,0)');
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.5); ctx.translate(-sx, -sy); ctx.fillStyle = sc; ctx.fillRect(sx - 320, sy - 320, 640, 640); ctx.restore();
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.45);
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 46; i++) {
        const f = i / 46, r = 40 + f * 520, th = arm * (TAU / 3) + f * 5.2 + t * 0.35 / (0.4 + f);
        const g = ctx.createRadialGradient(Math.cos(th) * r, Math.sin(th) * r, 0, Math.cos(th) * r, Math.sin(th) * r, 46 + 40 * f);
        g.addColorStop(0, `rgba(235,235,240,${0.4 * (1 - f * 0.6)})`); g.addColorStop(1, 'rgba(235,235,240,0)');
        ctx.fillStyle = g; ctx.fillRect(Math.cos(th) * r - 100, Math.sin(th) * r - 100, 200, 200);
      }
    }
    ctx.restore();
    for (let i = 0; i < 14; i++) {
      const f = i / 14, y = sy - f * 330 * (0.6 + 0.4 * u), r = 22 + f * 70;
      const g = ctx.createRadialGradient(sx + Math.sin(t + i) * 8, y, 0, sx, y, r);
      g.addColorStop(0, 'rgba(120,100,88,0.55)'); g.addColorStop(1, 'rgba(120,100,88,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r - 20, y - r, r * 2 + 40, r * 2);
    }
    const eg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90);
    eg.addColorStop(0, 'rgba(255,150,70,0.65)'); eg.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = eg; ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.globalCompositeOperation = 'source-over';
    return { sx, sy };
  }
}
