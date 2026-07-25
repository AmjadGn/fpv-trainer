import { applyCenteredExpo, applyThrottleCurve } from '../utils/input-expo';
import type { FlightInput } from '../models/flight-input.model';

export type RateProfileId = 'beginner' | 'normal' | 'acro';

export interface RateProfile {
  id: RateProfileId;
  name: string;
  maxPitchRate: number;
  maxRollRate: number;
  maxYawRate: number;
  throttleExpo: number;
  yawExpo: number;
  pitchExpo: number;
  rollExpo: number;
  throttleCurveMidpoint: number;
  angularResponse: number;
  angularDamping: number;
  angularInputSmoothing: number;
}

export const RATE_PROFILES: Record<RateProfileId, RateProfile> = {
  beginner: {
    id: 'beginner',
    name: 'Beginner',
    maxPitchRate: 2.6,
    maxRollRate: 2.6,
    maxYawRate: 2.0,
    throttleExpo: 0.35,
    yawExpo: 0.4,
    pitchExpo: 0.4,
    rollExpo: 0.4,
    throttleCurveMidpoint: 0.5,
    angularResponse: 8,
    angularDamping: 5.5,
    angularInputSmoothing: 10,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    maxPitchRate: 4.2,
    maxRollRate: 4.2,
    maxYawRate: 3.0,
    throttleExpo: 0.25,
    yawExpo: 0.3,
    pitchExpo: 0.3,
    rollExpo: 0.3,
    throttleCurveMidpoint: 0.5,
    angularResponse: 11,
    angularDamping: 4,
    angularInputSmoothing: 14,
  },
  acro: {
    id: 'acro',
    name: 'Acro',
    maxPitchRate: 6.5,
    maxRollRate: 6.5,
    maxYawRate: 4.5,
    throttleExpo: 0.15,
    yawExpo: 0.18,
    pitchExpo: 0.18,
    rollExpo: 0.18,
    throttleCurveMidpoint: 0.48,
    angularResponse: 16,
    angularDamping: 2.5,
    angularInputSmoothing: 22,
  },
};

export const DEFAULT_RATE_PROFILE_ID: RateProfileId = 'beginner';

export const RATE_PROFILE_STORAGE_KEY = 'fpv-trainer.rate-profile.v1';

export function isRateProfileId(value: unknown): value is RateProfileId {
  return value === 'beginner' || value === 'normal' || value === 'acro';
}

export function loadRateProfileId(): RateProfileId {
  try {
    const raw = localStorage.getItem(RATE_PROFILE_STORAGE_KEY);
    if (isRateProfileId(raw)) {
      return raw;
    }
  } catch {
    // Ignore.
  }
  return DEFAULT_RATE_PROFILE_ID;
}

export function saveRateProfileId(id: RateProfileId): void {
  try {
    localStorage.setItem(RATE_PROFILE_STORAGE_KEY, id);
  } catch {
    // Ignore.
  }
}

/** Apply profile expo curves to a raw merged stick input. */
export function applyProfileExpo(
  input: FlightInput,
  profile: RateProfile,
): FlightInput {
  return {
    throttle: applyThrottleCurve(
      input.throttle,
      profile.throttleExpo,
      profile.throttleCurveMidpoint,
    ),
    yaw: applyCenteredExpo(input.yaw, profile.yawExpo),
    pitch: applyCenteredExpo(input.pitch, profile.pitchExpo),
    roll: applyCenteredExpo(input.roll, profile.rollExpo),
  };
}
