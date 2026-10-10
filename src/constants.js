// Physical constants and the numbers that anchor the whole animation.
export const G = 6.6743e-11; // m^3 kg^-1 s^-2
export const C = 299792458; // m/s
export const M_EARTH = 5.972e24; // kg
export const R_EARTH = 6.371e6; // m

/** Schwarzschild radius for a non-rotating black hole: r_s = 2GM/c^2 */
export const schwarzschildRadius = (massKg) => (2 * G * massKg) / (C * C);

export const BH_MASS = 8.1e24; // kg (chosen so r_s is ~1.2 cm)
export const BH_RS = schwarzschildRadius(BH_MASS); // metres (~0.01203)
export const BH_DIAMETER = 2 * BH_RS;
export const BH_EARTH_MASSES = BH_MASS / M_EARTH; // ~1.36

// Derived facts shown in the science overlay (all plain Newtonian / GR formulae).
export const REST_ENERGY = BH_MASS * C * C; // J, M c^2
export const GM = G * BH_MASS;
export const ACCEL_AT_1M = GM / 1; // m/s^2
export const ACCEL_AT_1KM = GM / 1e6;
export const ACCEL_AT_EARTH_RADIUS = GM / (R_EARTH * R_EARTH);
export const TIDAL_AT_1M_OVER_BODY = (2 * GM * 1.75) / 1; // across 1.75 m body at 1 m
export const ISCO = 3 * BH_RS; // innermost stable circular orbit (non-rotating)
export const SHADOW_RADIUS = 2.598 * BH_RS; // apparent "shadow" (critical impact parameter)

// Stage = the virtual 1600x900 world used for the street scene.
export const STAGE = {
  w: 1600,
  h: 900,
  pxPerM: 102, // 1.75 m person ~ 178 px at mid depth
  bhX: 800,
  bhY: 590, // torso height above the plaza
};
export const BH_RS_PX = BH_RS * STAGE.pxPerM; // ~1.23 px: the true size of the horizon on the stage

export const T_APPEAR = 11; // animation seconds at which the black hole appears
export const STREET_SIM_END = 52; // street particle sim stops here (no street shots after)
export const SPACE_SIM_START = 70; // planetary debris sim starts here
export const EARTH_R_UNITS = 200; // Earth radius in the debris sim's units

export const fmtSci = (x, digits = 1) => {
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  const sup = String(e).replace(/-/g, '⁻').replace(/[0-9]/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
  return `${m.toFixed(digits)} × 10${sup}`;
};
