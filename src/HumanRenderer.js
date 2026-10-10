// Procedural human figures. Every pose is an analytic function of time, so scrubbing is exact.
import { mulberry32, clamp, smooth, TAU } from './util.js';
import { STAGE, T_APPEAR } from './constants.js';

const SHIRTS = ['#b8483c', '#3d6a8c', '#d9b04a', '#4f7a5a', '#8a5a8f', '#e8e2d6', '#2f3a4a', '#c97b3e', '#5c8f9a'];
const PANTS = ['#2b2f3a', '#3c4a63', '#5a4a3c', '#222428', '#6b6358'];
const SKINS = ['#e3b48f', '#c98f66', '#8d5a3b', '#f0cba8', '#a86f4a', '#6a4129'];
const HAIRS = ['#1d1612', '#3a2a1c', '#7a5a34', '#b8a07a', '#2b2b2f', '#5a2c20'];

const WRAP_MIN = -140, WRAP_MAX = 1740;
const wrap = (x) => WRAP_MIN + ((((x - WRAP_MIN) % (WRAP_MAX - WRAP_MIN)) + (WRAP_MAX - WRAP_MIN)) % (WRAP_MAX - WRAP_MIN));
export const footY = (z) => 640 + 120 * z;
export const scaleAt = (z) => 0.75 + 0.6 * z;

export class HumanRenderer {
  constructor(seed = 7) {
    this.people = [];
    const R = mulberry32(seed);
    const pick = (a) => a[(R() * a.length) | 0];
    const make = (o) => ({
      x0: 800, z: 0.5, dir: R() < 0.5 ? -1 : 1, speed: 0, kind: 'walk', group: false, react: 'flee', delay: R() * 0.5,
      shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: (R() * 4) | 0,
      bag: R() < 0.35, height: 0.94 + R() * 0.12, phase: R() * TAU, reactTime: 0.7 + R() * 0.7, ...o,
    });
    // The group the black hole appears between: clear gap around x=800 so the hole is visible.
    const group = [
      { dx: -165, z: 0.46, kind: 'talk', react: 'fall', dir: 1 },
      { dx: -88, z: 0.64, kind: 'phone', react: 'flee', dir: 1 },
      { dx: 96, z: 0.4, kind: 'stand', react: 'fall', dir: -1 },
      { dx: 172, z: 0.56, kind: 'talk', react: 'flee', dir: -1 },
      { dx: 28, z: 0.1, kind: 'stand', react: 'freeze', dir: -1 },
      { dx: -34, z: 0.04, kind: 'phone', react: 'flee', dir: 1 },
    ];
    for (const g of group) this.people.push(make({ ...g, x0: 800 + g.dx, group: true, delay: R() * 0.25 }));
    for (let i = 0; i < 17; i++) {
      const z = R();
      const kind = R() < 0.25 ? 'phone' : 'walk';
      let x0 = -100 + R() * 1800;
      if (Math.abs(x0 - 800) < 260) x0 += (x0 < 800 ? -1 : 1) * 260; // keep the centre uncluttered
      this.people.push(make({ x0, z, kind, speed: (34 + R() * 34) * (0.7 + z * 0.6), react: R() < 0.2 ? 'freeze' : 'flee' }));
    }
    this.people.sort((a, b) => a.z - b.z);
    for (const p of this.people) p.notice = null;
  }

  basePos(p, t) {
    if (p.group && p.kind !== 'walk') return p.x0 + Math.sin(t * 0.5 + p.phase) * 3;
    if (p.kind === 'stand') return p.x0;
    return wrap(p.x0 + p.dir * p.speed * t);
  }

  /** Pose of person p at time t (stage coordinates). */
  pose(p, t) {
    const s = scaleAt(p.z) * p.height;
    const fy = footY(p.z);
    const walker = !(p.group && p.kind !== 'walk') && p.kind !== 'stand';
    const stride = 52 * s;
    let x = this.basePos(p, Math.min(t, 1e9));
    let gait = walker ? (x - p.x0) * p.dir / stride * Math.PI + p.phase : 0;
    let amp = walker ? 1 : 0.06;
    let facing = p.group && !walker ? (p.dir) : (p.dir || 1);
    let lean = 0, tilt = 0, lift = 0, alpha = 1, arms = p.kind === 'phone' ? 'phone' : p.kind === 'talk' ? 'talk' : 'swing';
    let pullN = 0;

    if (t >= T_APPEAR) {
      const xe = this.basePos(p, T_APPEAR);
      const dist = Math.abs(xe - STAGE.bhX) + Math.abs(fy - 700) * 0.6;
      const tN = T_APPEAR + p.delay + dist / 520;
      if (t < tN) { // not yet aware: keep going about their business
        x = this.basePos(p, t);
      } else {
        const xN = this.basePos(p, tN);
        const tau = t - tN;
        const fd = xN === STAGE.bhX ? 1 : Math.sign(xN - STAGE.bhX);
        facing = Math.sign(STAGE.bhX - xN) || 1;
        x = xN; amp = 0.04; gait = 0; arms = 'alert';
        const react0 = p.reactTime;
        const tp = tau - react0;
        if (tp > 0) {
          if (p.react === 'flee' || (p.react === 'freeze' && tau > react0 + 2.6)) {
            const tf = p.react === 'freeze' ? tp - 2.6 : tp;
            if (tf > 0) {
              const vmax = 150 * s, acc = 200 * s, tr = vmax / acc;
              const d = tf < tr ? 0.5 * acc * tf * tf : (vmax * vmax) / (2 * acc) + vmax * (tf - tr);
              x = xN + fd * d; facing = fd; amp = 1.7; arms = 'run';
              gait = (d / (48 * s)) * Math.PI + p.phase;
            }
          } else if (p.react === 'fall' && tau > react0 + 3.5) {
            const tf = tau - react0 - 3.5;
            const to = clamp(tf / 1.8, 0, 1);
            x = xN + (STAGE.bhX - xN) * (1 - Math.exp(-0.55 * tf * tf)) * 0.6;
            tilt = Math.sign(STAGE.bhX - xN) * 1.45 * smooth(0.15, 1.2, tf);
            lift = (fy - 88 * s - STAGE.bhY) * smooth(0.9, 3.0, tf) * 0.45;
            alpha = 1 - smooth(1.6, 2.8, tf);
            arms = 'brace'; amp = 0.03; if (to > 0.9) amp = 0.02;
          } else if (p.react === 'freeze') arms = 'alert';
        }
        const d = Math.abs(x - STAGE.bhX);
        const kn = smooth(11, 30, t);
        pullN = clamp(kn / (1 + (d / 240) * (d / 240)), 0, 1);
        const wob = Math.sin(t * 8 + p.phase) * 0.17 * pullN;
        lean = Math.sign(STAGE.bhX - x) * pullN * 0.3 + wob;
      }
    }
    return { x, fy: fy - lift, s, facing, gait, amp, lean, tilt, alpha, arms, pullN, pullDir: Math.sign(STAGE.bhX - x) || 1, t };
  }

  draw(ctx, t) {
    for (const p of this.people) {
      const o = this.pose(p, t);
      if (o.alpha <= 0.01 || o.x < -200 || o.x > 1800) continue;
      this.drawFigure(ctx, p, o);
    }
  }

  drawFigure(ctx, p, o) {
    const s = o.s;
    ctx.save();
    ctx.globalAlpha = o.alpha;
    // contact shadow (low sun from the left throws it right)
    if (o.tilt === 0) {
      ctx.fillStyle = 'rgba(30,24,20,0.28)';
      ctx.beginPath(); ctx.ellipse(o.x + 34 * s, o.fy + 2, 46 * s, 7 * s, 0, 0, TAU); ctx.fill();
    }
    ctx.translate(o.x, o.fy);
    // falling rotates about the hip; leaning about the feet
    ctx.rotate(o.lean);
    if (o.tilt) { ctx.translate(0, -88 * s); ctx.rotate(o.tilt); ctx.translate(0, 88 * s); }
    ctx.scale(s, s);
    const f = o.facing >= 0 ? 1 : -1;
    ctx.scale(f, 1);
    const g = o.gait, A = o.amp;
    const sw = Math.sin(g), sw2 = Math.sin(g + Math.PI);
    const bob = Math.abs(Math.cos(g)) * 2.2 * Math.min(A, 1.4);
    const hipY = -88 - bob, shY = -140 - bob;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    const leg = (ph, col) => {
      const a = Math.sin(ph) * 0.55 * A;
      const kx = Math.sin(a) * 44, ky = Math.cos(a) * 44;
      const a2 = a * 0.35 - Math.max(0, -Math.sin(ph - 0.6)) * 0.7 * A;
      const fx = kx + Math.sin(a2) * 44, fyy = ky + Math.cos(a2) * 44;
      ctx.strokeStyle = col; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(kx, hipY + ky); ctx.lineTo(fx, hipY + fyy); ctx.stroke();
      ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(fx, hipY + fyy); ctx.lineTo(fx + 8, hipY + fyy + 0.5); ctx.stroke();
    };
    const darker = '#00000033';
    const pantsFar = p.pants;
    leg(g + Math.PI, pantsFar); // far leg
    ctx.fillStyle = darker; // cheap shading on the far leg
    // back arm
    const arm = (side, ang, bend, col) => {
      const ex = Math.sin(ang) * 31, ey = Math.cos(ang) * 31;
      const hx = ex + Math.sin(ang + bend) * 29, hy = ey + Math.cos(ang + bend) * 29;
      ctx.strokeStyle = col; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(side * 2, shY + 4); ctx.lineTo(ex, shY + 4 + ey); ctx.lineTo(hx, shY + 4 + hy); ctx.stroke();
      ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(hx, shY + 4 + hy, 4.2, 0, TAU); ctx.fill();
      return [hx, shY + 4 + hy];
    };
    const shirtDark = shade(p.shirt, -0.22);
    const mode = o.arms;
    const flutter = Math.sin(o.t * 11 + p.phase) * 0.12;
    let backArm, frontArm;
    if (mode === 'run') { backArm = [sw2 * 1.1, 1.3]; frontArm = [sw * 1.1, 1.3]; }
    else if (mode === 'alert') { backArm = [-0.4, -0.9]; frontArm = [0.5, -1.2]; }
    else if (mode === 'brace') { backArm = [-2.6 + flutter, 0.4]; frontArm = [-2.2 - flutter, 0.7]; }
    else if (mode === 'phone') { backArm = [sw2 * 0.35 * A, 0.1]; frontArm = [-2.1, -1.8]; }
    else if (mode === 'talk') { backArm = [0.2, -0.3]; frontArm = [-0.6 + Math.sin(o.t * 2 + p.phase) * 0.4, -1.5 + Math.sin(o.t * 3 + p.phase) * 0.3]; }
    else { backArm = [sw2 * 0.55 * A, 0.25]; frontArm = [sw * 0.55 * A, 0.25]; }
    arm(-1, backArm[0], backArm[1], shirtDark);

    // torso + clothing tail that streams toward the hole
    const pull = o.pullN * o.pullDir * f;
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.moveTo(-14, shY); ctx.lineTo(14, shY); ctx.lineTo(12 + pull * 6, hipY + 6); ctx.lineTo(-12 + pull * 6, hipY + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,225,180,0.22)'; ctx.fillRect(-14, shY, 4, hipY - shY);
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(7, shY, 7, hipY - shY);
    if (p.bag) { ctx.fillStyle = '#2a2a2e'; ctx.fillRect(-19, shY + 8, 8, 30); }
    leg(g, p.pants); // near leg
    frontArm = arm(1, frontArm[0], frontArm[1], p.shirt);
    if (mode === 'phone') {
      ctx.fillStyle = '#16161a'; ctx.fillRect(frontArm[0] - 2, frontArm[1] - 8, 5, 11);
      ctx.fillStyle = 'rgba(160,210,255,0.9)'; ctx.fillRect(frontArm[0] - 1, frontArm[1] - 7, 3, 8);
    }
    // neck + head
    ctx.fillStyle = p.skin; ctx.fillRect(-3.5, shY - 8, 7, 9);
    const headTilt = p.kind === 'phone' && mode === 'phone' ? 4 : 0;
    const hx = headTilt, hy = shY - 18 + headTilt * 0.5;
    ctx.beginPath(); ctx.ellipse(hx, hy, 9.5, 11, 0, 0, TAU); ctx.fill();
    // hair (strands lean toward the hole)
    ctx.fillStyle = p.hair;
    const hairPull = pull * 7 + Math.sin(o.t * 12 + p.phase) * 1.2 * o.pullN;
    if (p.hairStyle === 0) { ctx.beginPath(); ctx.ellipse(hx - 1, hy - 4, 10, 8, 0, Math.PI, TAU); ctx.fill(); }
    else if (p.hairStyle === 1) {
      ctx.beginPath(); ctx.ellipse(hx - 1, hy - 3, 10.5, 9, 0, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = p.hair; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(hx - 8, hy - 2); ctx.quadraticCurveTo(hx - 12 + hairPull, hy + 14, hx - 8 + hairPull * 1.6, hy + 26); ctx.stroke();
    } else if (p.hairStyle === 2) {
      ctx.beginPath(); ctx.ellipse(hx, hy - 6, 11, 6, 0, Math.PI, TAU); ctx.fill();
      ctx.fillRect(hx - 2, hy - 8, 15, 3);
    } else { ctx.beginPath(); ctx.ellipse(hx - 2, hy - 5, 9, 6, 0, Math.PI, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,235,200,0.25)'; ctx.beginPath(); ctx.ellipse(hx - 4, hy - 1, 2.5, 6, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v * (1 + amt)), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
