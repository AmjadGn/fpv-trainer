import type { Vec3 } from '../../flight/models/flight-state.model';

/** Persistent wind configuration used by the deterministic wind field. */
export interface WindState {
  enabled: boolean;
  /** Unit direction in XZ (y ignored for base horizontal wind). */
  baseDirection: Vec3;
  /** Steady horizontal wind speed (m/s). */
  baseSpeed: number;
  /** Peak additional gust speed (m/s). */
  gustStrength: number;
  /** Gust oscillation frequency (Hz-like). */
  gustFrequency: number;
  /** Position/time turbulence intensity (0–1+). */
  turbulence: number;
  /** Mild vertical draft strength (m/s). */
  verticalDraftStrength: number;
  /** Deterministic seed. */
  seed: number;
}

/** Sampled wind at a world position / simulation time. */
export interface WindSample {
  /** Total air velocity (m/s) in world space. */
  velocity: Vec3;
  /** Steady base contribution. */
  baseContribution: Vec3;
  /** Gust contribution. */
  gustContribution: Vec3;
  /** Turbulence contribution. */
  turbulenceContribution: Vec3;
  /** Vertical draft contribution. */
  draftContribution: Vec3;
  /** Scalar speed of total velocity. */
  speed: number;
  /** True when a gust envelope is active above a threshold. */
  gustActive: boolean;
}

export const ZERO_WIND_STATE: WindState = {
  enabled: false,
  baseDirection: { x: 1, y: 0, z: 0 },
  baseSpeed: 0,
  gustStrength: 0,
  gustFrequency: 0,
  turbulence: 0,
  verticalDraftStrength: 0,
  seed: 0,
};

export function cloneWindState(wind: WindState): WindState {
  return {
    ...wind,
    baseDirection: { ...wind.baseDirection },
  };
}

/** Normalize horizontal direction; falls back to +X. */
export function normalizeWindDirection(dir: Vec3): Vec3 {
  const len = Math.hypot(dir.x, dir.z);
  if (!(len > 1e-8) || !Number.isFinite(len)) {
    return { x: 1, y: 0, z: 0 };
  }
  return { x: dir.x / len, y: 0, z: dir.z / len };
}
