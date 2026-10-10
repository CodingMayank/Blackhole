// Playback state: time, play/pause, speed, seeking. Knows nothing about drawing.
import { clamp } from './util.js';

export const SPEEDS = [0.5, 1, 2, 4];

export class SimulationController {
  constructor(sceneManager) {
    this.sm = sceneManager;
    this.time = 0;
    this.speed = 1;
    this.playing = false;
    this.ended = false;
    this._listeners = {};
  }

  on(evt, fn) { (this._listeners[evt] ||= []).push(fn); return this; }
  _emit(evt, data) { (this._listeners[evt] || []).forEach((fn) => fn(data)); }

  get total() { return this.sm.total; }

  play() {
    if (this.ended || this.time >= this.total - 1e-3) { this.time = 0; this.ended = false; }
    this.playing = true;
    this._emit('state', this);
  }
  pause() { this.playing = false; this._emit('state', this); }
  toggle() { this.playing ? this.pause() : this.play(); }
  restart() { this.time = 0; this.ended = false; this._emit('seek', this); this.play(); }

  seek(t) {
    this.time = clamp(t, 0, this.total);
    this.ended = this.time >= this.total - 1e-3;
    this._emit('seek', this);
    this._emit('state', this);
  }

  setSpeed(s) { this.speed = s; this._emit('state', this); }

  goToScene(i) {
    const idx = clamp(i, 0, this.sm.scenes.length - 1);
    this.seek(this.sm.scenes[idx].start + 0.001);
  }
  nextScene() {
    const { index } = this.sm.locate(this.time);
    if (index < this.sm.scenes.length - 1) this.goToScene(index + 1);
    else this.seek(this.total);
  }
  prevScene() {
    const { index, local } = this.sm.locate(this.time);
    this.goToScene(local > 1.5 ? index : index - 1);
  }

  /** Advance by real elapsed seconds (already clamped by the caller). */
  tick(dtReal) {
    if (!this.playing) return;
    this.time += dtReal * this.speed;
    if (this.time >= this.total) {
      this.time = this.total;
      this.playing = false;
      this.ended = true;
      this._emit('state', this);
    }
  }
}
