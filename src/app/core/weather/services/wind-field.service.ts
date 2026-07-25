import { Injectable } from '@angular/core';

import type { Vec3 } from '../../flight/models/flight-state.model';
import type { WindSample, WindState } from '../models/wind.models';
import {
  ZERO_WIND_STATE,
  normalizeWindDirection,
} from '../models/wind.models';
import { gustEnvelope, valueNoise3D } from '../utils/wind-noise';

const MAX_WIND_SPEED = 12;
const MAX_DRAFT = 1.5;
const MAX_TURBULENCE_SPEED = 3.5;

/**
 * Deterministic wind field sampler.
 * Produces world-space air velocity for physics (not visuals).
 */
@Injectable({ providedIn: 'root' })
export class WindFieldService {
  private state: WindState = { ...ZERO_WIND_STATE };
  private readonly scratchSample: WindSample = {
    velocity: { x: 0, y: 0, z: 0 },
    baseContribution: { x: 0, y: 0, z: 0 },
    gustContribution: { x: 0, y: 0, z: 0 },
    turbulenceContribution: { x: 0, y: 0, z: 0 },
    draftContribution: { x: 0, y: 0, z: 0 },
    speed: 0,
    gustActive: false,
  };

  setWindState(state: WindState | null): void {
    if (!state || !state.enabled) {
      this.state = { ...ZERO_WIND_STATE };
      return;
    }
    this.state = {
      ...state,
      baseDirection: normalizeWindDirection(state.baseDirection),
      baseSpeed: clampFinite(state.baseSpeed, 0, MAX_WIND_SPEED),
      gustStrength: clampFinite(state.gustStrength, 0, MAX_WIND_SPEED),
      gustFrequency: clampFinite(state.gustFrequency, 0, 2),
      turbulence: clampFinite(state.turbulence, 0, 2),
      verticalDraftStrength: clampFinite(
        state.verticalDraftStrength,
        -MAX_DRAFT,
        MAX_DRAFT,
      ),
      seed: Number.isFinite(state.seed) ? (state.seed | 0) : 0,
      enabled: true,
    };
  }

  getWindState(): WindState {
    return {
      ...this.state,
      baseDirection: { ...this.state.baseDirection },
    };
  }

  clear(): void {
    this.state = { ...ZERO_WIND_STATE };
  }

  /**
   * Sample wind at world position and simulation time.
   * Reuses an internal sample object — copy fields if retaining across calls.
   */
  sample(position: Vec3, timeSeconds: number): WindSample {
    const out = this.scratchSample;
    zeroVec(out.velocity);
    zeroVec(out.baseContribution);
    zeroVec(out.gustContribution);
    zeroVec(out.turbulenceContribution);
    zeroVec(out.draftContribution);
    out.speed = 0;
    out.gustActive = false;

    const wind = this.state;
    if (!wind.enabled) {
      return out;
    }

    const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    const px = Number.isFinite(position.x) ? position.x : 0;
    const py = Number.isFinite(position.y) ? position.y : 0;
    const pz = Number.isFinite(position.z) ? position.z : 0;

    const dir = wind.baseDirection;
    out.baseContribution.x = dir.x * wind.baseSpeed;
    out.baseContribution.y = 0;
    out.baseContribution.z = dir.z * wind.baseSpeed;

    const gustEnv = gustEnvelope(t, wind.gustFrequency, wind.seed);
    const gustSpeed = wind.gustStrength * gustEnv;
    out.gustContribution.x = dir.x * gustSpeed;
    out.gustContribution.y = 0;
    out.gustContribution.z = dir.z * gustSpeed;
    out.gustActive = gustEnv > 0.55 && wind.gustStrength > 0.2;

    if (wind.turbulence > 0) {
      const scale = 0.045;
      const n1 = valueNoise3D(px * scale, t * 0.35, pz * scale, wind.seed + 1);
      const n2 = valueNoise3D(
        px * scale + 40,
        t * 0.41,
        pz * scale - 17,
        wind.seed + 2,
      );
      const n3 = valueNoise3D(
        px * scale - 11,
        t * 0.29,
        pz * scale + 23,
        wind.seed + 3,
      );
      const turb = Math.min(
        MAX_TURBULENCE_SPEED,
        wind.turbulence * 2.2,
      );
      out.turbulenceContribution.x = (n1 * 2 - 1) * turb;
      out.turbulenceContribution.y = (n2 * 2 - 1) * turb * 0.35;
      out.turbulenceContribution.z = (n3 * 2 - 1) * turb;
    }

    if (wind.verticalDraftStrength !== 0) {
      const draftNoise =
        valueNoise3D(px * 0.03, t * 0.2, pz * 0.03, wind.seed + 9) * 2 - 1;
      const draft = clampFinite(
        wind.verticalDraftStrength * (0.65 + 0.35 * draftNoise),
        -MAX_DRAFT,
        MAX_DRAFT,
      );
      out.draftContribution.y = draft;
    }

    out.velocity.x =
      out.baseContribution.x +
      out.gustContribution.x +
      out.turbulenceContribution.x +
      out.draftContribution.x;
    out.velocity.y =
      out.baseContribution.y +
      out.gustContribution.y +
      out.turbulenceContribution.y +
      out.draftContribution.y;
    out.velocity.z =
      out.baseContribution.z +
      out.gustContribution.z +
      out.turbulenceContribution.z +
      out.draftContribution.z;

    // Sanitize NaN / Inf.
    if (!Number.isFinite(out.velocity.x)) out.velocity.x = 0;
    if (!Number.isFinite(out.velocity.y)) out.velocity.y = 0;
    if (!Number.isFinite(out.velocity.z)) out.velocity.z = 0;

    const speed = Math.hypot(out.velocity.x, out.velocity.y, out.velocity.z);
    if (speed > MAX_WIND_SPEED) {
      const s = MAX_WIND_SPEED / speed;
      out.velocity.x *= s;
      out.velocity.y *= s;
      out.velocity.z *= s;
      out.speed = MAX_WIND_SPEED;
    } else {
      out.speed = speed;
    }

    return out;
  }
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(min, value));
}

function zeroVec(v: Vec3): void {
  v.x = 0;
  v.y = 0;
  v.z = 0;
}
