// Scene script: durations, narration and the physics-honesty labels.
// tag: 'green' = established physics, 'amber' = model-dependent / uncertain, 'red' = speculative visualization.
import {
  BH_MASS, BH_RS, BH_EARTH_MASSES, REST_ENERGY, ACCEL_AT_1M, ACCEL_AT_1KM, ACCEL_AT_EARTH_RADIUS,
  TIDAL_AT_1M_OVER_BODY, ISCO, SHADOW_RADIUS, fmtSci,
} from './constants.js';

const cm = (m) => (m * 100).toFixed(1);

export const SCENES = [
  {
    id: 'ordinary', title: 'Ordinary Life', duration: 11, tag: 'green', shot: 'Documentary establishing shot',
    description: 'A late-afternoon plaza in a busy city. People walk, talk and scroll through their phones. Nothing is wrong yet.',
    facts: [
      { tag: 'green', at: 0.05, text: 'Everything in this scene is ordinary, well-understood physics: daylight, sound, people, traffic.' },
      { tag: 'amber', at: 0.55, text: `Hypothetical premise: a black hole of about ${fmtSci(BH_MASS)} kg is about to appear. No known process does this.` },
    ],
  },
  {
    id: 'appearance', title: 'The Black Hole Appears', duration: 5, tag: 'amber', shot: 'Push-in, shallow depth of field',
    description: 'Between several people, at torso height, a perfectly dark sphere simply exists. The event horizon is coin-sized. Background light bends around it.',
    facts: [
      { tag: 'green', at: 0.1, text: `Event-horizon radius r_s = 2GM/c² ≈ ${cm(BH_RS)} cm for M = ${fmtSci(BH_MASS)} kg, so a diameter of about 2.4 cm.` },
      { tag: 'green', at: 0.4, text: 'Light bends around any mass. Here the lensing is a thin-lens approximation; the horizon itself is black, not a glowing ball.' },
      { tag: 'amber', at: 0.65, text: `Making this mass from nothing has no known mechanism. Its rest energy, Mc² ≈ ${fmtSci(REST_ENERGY)} J, is not something a coin can supply.` },
      { tag: 'red', at: 0.85, text: 'The expanding ring and brief exposure dip are cinematic cues, not a physical shockwave.' },
    ],
  },
  {
    id: 'first-effects', title: 'First Gravitational Effects', duration: 10, tag: 'amber', shot: 'Close-ups, then a widening shot',
    description: 'Dust, paper and loose objects curve toward the dark point. People lose their footing. Nothing falls straight in: each path depends on distance, speed and angular momentum.',
    facts: [
      { tag: 'green', at: 0.05, text: `Newtonian pull at 1 m from this mass is GM/r² ≈ ${fmtSci(ACCEL_AT_1M)} m/s². Real effects on people would be instant and lethal; the animation slows and softens them so they can be seen.` },
      { tag: 'green', at: 0.35, text: `Tidal acceleration across a 1.75 m body at 1 m is ≈ ${fmtSci(TIDAL_AT_1M_OVER_BODY)} m/s²: the difference in pull between head and feet.` },
      { tag: 'amber', at: 0.6, text: 'Particle paths depend on starting distance, velocity and angular momentum. Some spiral in, some swing past, some are flung outward.' },
      { tag: 'red', at: 0.82, text: 'Ground cracks, clothing and hair motion are illustrative.' },
    ],
  },
  {
    id: 'local-destruction', title: 'Escalating Local Destruction', duration: 10, tag: 'amber', shot: 'Handheld, controlled shake',
    description: 'Structures lean, lamp posts bend, vehicles are dragged sideways. People run. Dust clouds thicken and the first light appears at the centre.',
    facts: [
      { tag: 'amber', at: 0.1, text: 'Air, pavement and buildings would respond far faster and more violently than shown. The damage here is illustrative.' },
      { tag: 'green', at: 0.4, text: 'Matter that orbits loses angular momentum through collisions and drag, and spirals inward. That is how an accretion flow forms.' },
      { tag: 'green', at: 0.7, text: 'Any glow comes from infalling matter heating up outside the horizon. The horizon is not a fiery surface.' },
      { tag: 'red', at: 0.9, text: 'Camera shake, dust clouds and debris trails are staging devices.' },
    ],
  },
  {
    id: 'accretion', title: 'Accretion Disk and Extreme Heating', duration: 10, tag: 'amber', shot: 'Extreme close-up',
    description: 'Infalling matter forms a lopsided, rotating disk. It brightens as more material arrives and fades when supply thins. The centre stays completely dark.',
    scaleNote: 'Disk and ring brightness are stylized',
    gauge: 'accretion',
    facts: [
      { tag: 'green', at: 0.05, text: 'Radiated luminosity L = η ṁ c². The temperature and brightness depend on the accretion rate ṁ and on what the infalling matter is made of.' },
      { tag: 'green', at: 0.35, text: `Innermost stable orbit for a non-rotating hole: 3 r_s ≈ ${cm(ISCO)} cm. The apparent dark "shadow" is larger than the horizon: ≈ 2.6 r_s ≈ ${cm(SHADOW_RADIUS)} cm radius.` },
      { tag: 'amber', at: 0.6, text: 'A bright disk is not guaranteed. With little matter nearby it could be faint or absent.' },
      { tag: 'red', at: 0.85, text: 'The layered orange, white and blue colouring is stylized for legibility.' },
    ],
  },
  {
    id: 'city', title: 'City-Scale Consequences', duration: 12, tag: 'red', shot: 'Street · Close-up · Aerial · Regional',
    description: 'The view cuts between street level, the infalling matter, an aerial look at the city, and a high-altitude view of the region.',
    scaleNote: 'Black hole enlarged in aerial and regional views',
    facts: [
      { tag: 'green', at: 0.05, text: `Gravity falls off as 1/r²: even at 1 km this mass would pull at ≈ ${fmtSci(ACCEL_AT_1KM)} m/s², and at Earth's radius ≈ ${ACCEL_AT_EARTH_RADIUS.toFixed(0)} m/s².` },
      { tag: 'amber', at: 0.4, text: 'How far the damage spreads depends on the hole’s path and the matter around it. This animation does not calculate it.' },
      { tag: 'red', at: 0.7, text: 'All large-scale destruction in this scene is a hypothetical visualization, not a calculated sequence.' },
    ],
  },
  {
    id: 'planet', title: 'Planetary Gravitational Disruption', duration: 12, tag: 'red', shot: 'Rising to orbit',
    description: 'From high altitude the planet itself is deforming. Fractures glow, atmosphere is stripped away, and the crust is pulled toward the hidden centre of attraction.',
    scaleNote: 'Black hole position is schematic',
    facts: [
      { tag: 'green', at: 0.05, text: `The hole is ${BH_EARTH_MASSES.toFixed(2)} Earth masses. Earth and the hole would orbit a common centre of mass, with enormous tidal stresses across the planet.` },
      { tag: 'amber', at: 0.4, text: 'The outcome depends on the hole’s mass and trajectory, Earth’s initial conditions, the angular momentum of the material, and how gravity, matter and radiation interact.' },
      { tag: 'red', at: 0.7, text: 'Deformation, glowing fractures and atmospheric stripping are conceptual. No destruction countdown is claimed.' },
    ],
  },
  {
    id: 'breakup', title: 'Earth Breakup and Debris Evolution', duration: 14, tag: 'red', shot: 'Wide, from space',
    description: 'In this speculative outcome, the planet comes apart. Fragments, gas and dust follow different orbits: some fall in, some form a flow around the hole, some escape.',
    scaleNote: 'Event horizon enlarged',
    gauge: 'accretion',
    facts: [
      { tag: 'green', at: 0.05, text: 'A black hole’s gravity depends on its mass, not its size. A 1.2 cm horizon does not mean a 1.2 cm sphere of influence.' },
      { tag: 'amber', at: 0.4, text: 'Material with enough angular momentum orbits instead of falling in, and some gains enough energy to escape.' },
      { tag: 'red', at: 0.7, text: 'Fragment shapes and the exact debris distribution are speculative. This is one possible outcome, not a unique or inevitable one.' },
    ],
  },
  {
    id: 'aftermath', title: 'Final Aftermath', duration: 12, tag: 'amber', shot: 'Quiet, wide, dark',
    description: 'The debris thins out. A dark point remains, ringed by an irregular flow of material on many different orbits, some still slowly falling in.',
    scaleNote: 'Event horizon enlarged',
    gauge: 'accretion',
    facts: [
      { tag: 'amber', at: 0.1, text: 'The final planetary state depends on the initial conditions and on how the matter behaves. This is one visualization of many possibilities.' },
    ],
    summary: true,
  },
];

export const SUMMARY_ROWS = [
  ['Initial event-horizon diameter', '≈ 2.4 cm', 'green'],
  ['Schwarzschild radius', `≈ ${cm(BH_RS)} cm  (r_s = 2GM/c²)`, 'green'],
  ['Implied mass', `≈ ${fmtSci(BH_MASS)} kg  ≈ ${BH_EARTH_MASSES.toFixed(2)} Earth masses`, 'green'],
  ['Final planetary state', 'Depends on initial conditions and matter dynamics', 'amber'],
  ['Exact destruction timeline', 'Not established by this animation', 'amber'],
];

export const END_MESSAGE = {
  established: 'Event horizons, the Schwarzschild radius, gravity set by mass, gravitational lensing, tidal forces and accretion heating are established physics.',
  hypothetical: 'The sudden appearance of this black hole, the human reactions, the city damage, the breakup of Earth and the final debris field are hypothetical, cinematic visualizations, not predictions.',
};
