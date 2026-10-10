# Coin-Sized Black Hole: A Cinematic Visualization

A hypothetical, scientifically labelled animation of a black hole with a ~2.4 cm event horizon (mass ≈ 8.1 × 10²⁴ kg ≈ 1.36 Earth masses) appearing among people in a city plaza, followed by nine scenes through to the quiet aftermath.

Built with HTML5 Canvas 2D, vanilla JavaScript (ES modules), HTML and CSS. No frameworks and no build step.

## Run it

ES modules need a static server (opening `index.html` from disk will not work).

```bash
cd cinematic-black-hole
npm start                 # or: node server.mjs 8080
# open http://localhost:8080
```

Any static server works too, for example `python3 -m http.server 8080`.

## Controls

| Control | Key |
|---|---|
| Play / pause | Space or K |
| Seek ±5 s | ← / → |
| Previous / next scene | [ / ] |
| Restart | R |
| Speed 0.5× / 1× / 2× / 4× | 1 / 2 / 3 / 4 |
| Cinematic mode (hides controls when idle) | C |
| Fullscreen | F |
| Sound on/off | M |

The timeline scrubber, scene chips, previous/next buttons and speed buttons are also on screen.

## Evidence legend (always visible)

- **GREEN**: established physics
- **AMBER**: model-dependent or uncertain outcomes
- **RED**: speculative cinematic visualization

The clock is **animation time**, not a physical prediction. No destruction countdown is claimed.

## Physics used

- Schwarzschild radius `r_s = 2GM/c²`; with M = 8.1 × 10²⁴ kg, r_s ≈ 1.2 cm.
- Newtonian pull `GM/r²` and tidal acceleration `2GMh/r³` are shown as facts. The real effects would be instant and lethal, so the animation slows and softens them to be visible, and says so.
- Thin-lens approximation for gravitational lensing; ISCO = 3 r_s; apparent shadow ≈ 2.6 r_s; accretion luminosity `L = η ṁ c²`.
- Disk brightness comes from how much matter the particle simulation actually feeds in, so it rises and falls with supply.

Everything about city damage, planetary deformation, breakup and the debris field is labelled as illustrative or speculative.

## Architecture (`src/`)

| Module | Role |
|---|---|
| `main.js` | Entry point, UI wiring, `requestAnimationFrame` loop (delta-time) |
| `SimulationController.js` | Playback state: play/pause/restart/seek/speed/scene jumps |
| `SceneManager.js` | Scene lookup, camera tracks, shake, cuts/fades, effect curves (pure functions of t) |
| `timeline.js` | Scene script, facts and uncertainty tags, summary text |
| `CanvasRenderer.js` | Compositor: camera, world selection, depth of field, bloom, grain, vignette, fades |
| `BlackHoleRenderer.js` | Lensing warp, dark horizon, accretion disk with lensed halo, appearance ring |
| `EarthRenderer.js` | Procedural planet texture, per-pixel sphere with tidal deformation and fractures, stars |
| `ParticleSystem.js` | Bounded SoA particle pool, fixed-step deterministic simulation, street and breakup scenarios |
| `HumanRenderer.js` | Procedural figures: walk cycles and individual reactions |
| `StreetRenderer.js` | Street plaza, plus aerial and regional views |
| `ScienceOverlay.js` | Captions, tagged facts, clock, gauge, summary and end card |
| `AudioEngine.js` | Procedural Web Audio sound design (no audio files) |
| `util.js`, `constants.js` | Seeded RNG, noise, keyframes, physical constants |

### Determinism and scrubbing

All poses and camera moves are analytic functions of time. Particle simulations use a fixed 1/60 s step with a seeded RNG, and rewind by resetting and replaying, so jumping around the timeline always shows the same frame for the same time.

### Performance and accessibility

- Particle pools are preallocated typed arrays; nothing is allocated per frame in the hot paths.
- The canvas honours `devicePixelRatio` (capped at 1.5) and resizes with the window.
- `prefers-reduced-motion` disables camera shake, ghosting and animated grain, and softens exposure changes. There are no strobing flashes.

## Notes

- Sound starts only after you press a Begin button (browser autoplay rules).
- The black hole is drawn at its true size on the street stage until the disk appears. In the aerial and space views it is enlarged for visibility, and the badge says so.
