// Procedural sound design with the Web Audio API (no audio files). Starts only after a user gesture.
import { clamp, smooth } from './util.js';
import { T_APPEAR } from './constants.js';

export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; this.lastT = 0; this.ready = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; nd[i] = last * 3.5; }
    this.noiseBuf = noiseBuf;
    const loopNoise = (type, freq, q) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { g, f };
    };
    this.city = loopNoise('lowpass', 900, 0.5);
    this.murmur = loopNoise('bandpass', 700, 0.8);
    this.rumble = loopNoise('lowpass', 110, 0.9);
    const osc = (type, freq) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; };
    const drone = ctx.createGain(); drone.gain.value = 0;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 220;
    [osc('sawtooth', 55), osc('sawtooth', 55.6), osc('sine', 27.5)].forEach((o) => { o.connect(dl); o.start(); });
    dl.connect(drone); drone.connect(this.master); this.drone = drone;
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 900;
    this.whineG = ctx.createGain(); this.whineG.gain.value = 0;
    this.whine.connect(this.whineG); this.whineG.connect(this.master); this.whine.start();
    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  boom() {
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, now); o.frequency.exponentialRampToValueAtTime(30, now + 1.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.9, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 2);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 2.1);
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, now); ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    s.connect(f); f.connect(ng); ng.connect(this.master); s.start(now); s.stop(now + 1);
  }

  update(t, playing, speed) {
    if (!this.ready) { this.lastT = t; return; }
    const ctx = this.ctx, now = ctx.currentTime, set = (p, v, tc = 0.15) => p.setTargetAtTime(v, now, tc);
    const on = playing ? 1 : 0;
    if (playing && this.lastT < T_APPEAR && t >= T_APPEAR && t - this.lastT < 0.5) this.boom();
    this.lastT = t;
    const calm = 1 - smooth(8, 14, t) * 0.8;
    const fadeOut = 1 - smooth(88, 96, t);
    set(this.city.g.gain, 0.16 * calm * (t < 46 ? 1 : 0) * on);
    set(this.murmur.g.gain, 0.1 * (1 - smooth(10, 13, t)) * on);
    set(this.drone.gain, (0.05 * smooth(5, 11, t) + 0.05 * smooth(26, 60, t)) * fadeOut * on);
    const rum = 0.05 * smooth(12, 30, t) + 0.5 * smooth(30, 66, t) * (t < 78 ? 1 : 1 - smooth(78, 90, t));
    set(this.rumble.g.gain, clamp(rum, 0, 0.8) * on);
    this.rumble.f.frequency.setTargetAtTime(90 + 140 * smooth(30, 66, t), now, 0.2);
    const acc = smooth(34, 40, t) * (1 - smooth(46, 52, t)) + 0.4 * smooth(70, 76, t) * (1 - smooth(82, 92, t));
    set(this.whineG.gain, 0.025 * acc * on);
    this.whine.frequency.setTargetAtTime(500 + 1800 * smooth(34, 46, t) + 400 * Math.sin(t), now, 0.3);
  }
}
