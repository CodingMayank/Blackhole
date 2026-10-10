// Entry point: builds the modules, wires the UI, runs the requestAnimationFrame loop.
import { SCENES } from './timeline.js';
import { SceneManager } from './SceneManager.js';
import { SimulationController, SPEEDS } from './SimulationController.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { BlackHoleRenderer } from './BlackHoleRenderer.js';
import { EarthRenderer } from './EarthRenderer.js';
import { HumanRenderer } from './HumanRenderer.js';
import { StreetRenderer, CityScaleRenderer } from './StreetRenderer.js';
import { ParticleSystem, makeBlob, streetEmitter, streetField, spaceEmitter, spaceField } from './ParticleSystem.js';
import { ScienceOverlay } from './ScienceOverlay.js';
import { AudioEngine } from './AudioEngine.js';
import { STAGE } from './constants.js';

const $ = (id) => document.getElementById(id);

function boot() {
  const sm = new SceneManager(SCENES);
  const sim = new SimulationController(sm);
  const overlay = new ScienceOverlay(SCENES, sm.total);
  const audio = new AudioEngine();

  const streetParticles = new ParticleSystem({ capacity: 3200, cx: STAGE.bhX, cy: STAGE.bhY, soft: 4, capture: 1.6, kField: streetField, emitter: streetEmitter, seed: 17 });
  streetParticles.blob = makeBlob();
  const spaceParticles = new ParticleSystem({ capacity: 2800, cx: 0, cy: 0, soft: 5, capture: 6, kField: spaceField, emitter: spaceEmitter, seed: 29 });
  const earth = new EarthRenderer();
  const canvas = $('view');
  const renderer = new CanvasRenderer(canvas, {
    sceneManager: sm, street: new StreetRenderer(), city: new CityScaleRenderer(), humans: new HumanRenderer(),
    bh: new BlackHoleRenderer(), earth, streetParticles, spaceParticles,
  });
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const applyMotion = () => { renderer.reducedMotion = mq.matches; $('motionNote').hidden = !mq.matches; };
  applyMotion(); mq.addEventListener && mq.addEventListener('change', applyMotion);

  const stage = $('stage'), app = $('app');
  const playBtn = $('playBtn');
  let needsDraw = true;

  const syncUI = () => {
    playBtn.textContent = sim.playing ? '❚❚' : sim.ended ? '↻' : '▶';
    playBtn.setAttribute('aria-label', sim.playing ? 'Pause' : sim.ended ? 'Replay' : 'Play');
    document.querySelectorAll('.speed button').forEach((b) => b.classList.toggle('active', +b.dataset.s === sim.speed));
    app.classList.toggle('playing', sim.playing);
  };
  sim.on('state', () => { syncUI(); needsDraw = true; });
  sim.on('seek', () => { renderer.lastT = -1; needsDraw = true; });

  const begin = (withSound) => {
    $('startgate').classList.add('gone');
    if (withSound) { audio.start(); $('muteBtn').textContent = '🔊'; } else { audio.muted = true; $('muteBtn').textContent = '🔇'; }
    sim.play();
  };
  $('beginSound').addEventListener('click', () => begin(true));
  $('beginSilent').addEventListener('click', () => begin(false));

  playBtn.addEventListener('click', () => { if (!$('startgate').classList.contains('gone')) return begin(true); sim.toggle(); });
  $('restartBtn').addEventListener('click', () => sim.restart());
  $('prevBtn').addEventListener('click', () => sim.prevScene());
  $('nextBtn').addEventListener('click', () => sim.nextScene());
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => sim.setSpeed(+b.dataset.s)));
  $('sceneChips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) sim.goToScene(+c.dataset.i); });
  const scrub = $('scrubber');
  scrub.addEventListener('input', () => sim.seek((scrub.value / 1000) * sm.total));
  $('muteBtn').addEventListener('click', () => {
    if (!audio.ctx) { audio.muted = false; audio.start(); $('muteBtn').textContent = '🔊'; return; }
    audio.setMuted(!audio.muted); $('muteBtn').textContent = audio.muted ? '🔇' : '🔊';
  });
  const setCinematic = (on) => { app.classList.toggle('cinematic', on); $('cineBtn').classList.toggle('active', on); setTimeout(resize, 50); };
  $('cineBtn').addEventListener('click', () => setCinematic(!app.classList.contains('cinematic')));
  $('fsBtn').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await app.requestFullscreen(); setCinematic(true); }
    } catch (e) { setCinematic(!app.classList.contains('cinematic')); }
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setCinematic(false); resize(); });

  // idle auto-hide of controls in cinematic mode
  let idle;
  const wake = () => { app.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => app.classList.add('idle'), 2800); };
  ['mousemove', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
  wake();

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'range' && (e.key === ' ')) e.preventDefault();
    const k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); playBtn.click(); }
    else if (k === 'ArrowRight') sim.seek(sim.time + 5);
    else if (k === 'ArrowLeft') sim.seek(sim.time - 5);
    else if (k === ']' || k === 'n') sim.nextScene();
    else if (k === '[' || k === 'p') sim.prevScene();
    else if (k === 'r') sim.restart();
    else if (k === 'f') $('fsBtn').click();
    else if (k === 'c') $('cineBtn').click();
    else if (k === 'm') $('muteBtn').click();
    else if (['1', '2', '3', '4'].includes(k)) sim.setSpeed(SPEEDS[+k - 1]);
  });

  const resize = () => { renderer.resize(); needsDraw = true; };
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    sim.tick(dt);
    if (sim.playing || needsDraw) {
      renderer.render(sim.time);
      const loc = sm.locate(sim.time);
      overlay.update(sim.time, loc, renderer.hud);
      audio.update(sim.time, sim.playing, sim.speed);
      needsDraw = false;
    }
    requestAnimationFrame(frame);
  };

  // Build the planet texture behind a loading card, then show the start gate.
  setTimeout(() => {
    earth.buildTextures();
    $('loading').classList.add('gone');
    syncUI();
    requestAnimationFrame((n) => { last = n; frame(n); });
  }, 30);

  // Hooks for automated checks.
  window.__sim = { sim, renderer, sm, overlay };
}

boot();
