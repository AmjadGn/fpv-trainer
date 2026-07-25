import type { AngularVelocity, Quat, Vec3 } from '../../flight/models/flight-state.model';
import type {
  CameraEffectsIntensity,
  TrainerCameraEffectsSettings,
} from '../../settings/models/trainer-settings.model';

export interface CameraEffectsInput {
  position: Vec3;
  orientation: Quat;
  velocity: Vec3;
  angularVelocity: AngularVelocity;
  throttle: number;
  armed: boolean;
  crashed: boolean;
  /** Forward speed magnitude (m/s). */
  speed: number;
  /** World altitude (m). */
  altitude: number;
  paused: boolean;
  /** Prefer reduced-motion media query. */
  prefersReducedMotion: boolean;
  /** User explicitly re-enabled effects despite reduced motion. */
  forceEffectsDespiteReducedMotion: boolean;
  settings: TrainerCameraEffectsSettings;
  /** When true, skip continuous vibration (replay comfort). */
  replayMode?: boolean;
}

export interface CameraEffectsOutput {
  /** Local-space positional offset applied to the rendered camera only. */
  positionOffset: Vec3;
  /** Extra FOV degrees above base. */
  fovOffsetDegrees: number;
  /** Small orientation lag quaternion delta (applied as soft look offset). */
  lookLagPitch: number;
  lookLagYaw: number;
  lookLagRoll: number;
}

export const NEUTRAL_CAMERA_EFFECTS: Readonly<CameraEffectsOutput> = {
  positionOffset: { x: 0, y: 0, z: 0 },
  fovOffsetDegrees: 0,
  lookLagPitch: 0,
  lookLagYaw: 0,
  lookLagRoll: 0,
};

const INTENSITY_SCALE: Record<CameraEffectsIntensity, number> = {
  off: 0,
  low: 0.45,
  medium: 0.75,
  high: 1,
};

/** Deterministic layered sine noise — no Math.random per frame. */
export function smoothNoise(t: number, seed: number): number {
  return (
    Math.sin(t * 37.1 + seed * 12.9898) * 0.5 +
    Math.sin(t * 61.7 + seed * 78.233) * 0.3 +
    Math.sin(t * 19.3 + seed * 45.164) * 0.2
  );
}

export function intensityMultiplier(
  intensity: CameraEffectsIntensity,
): number {
  return INTENSITY_SCALE[intensity] ?? 0;
}

export function shouldSuppressContinuousEffects(
  input: Pick<
    CameraEffectsInput,
    'prefersReducedMotion' | 'forceEffectsDespiteReducedMotion' | 'paused' | 'replayMode'
  >,
): boolean {
  if (input.paused) {
    return true;
  }
  if (input.replayMode) {
    return true;
  }
  if (
    input.prefersReducedMotion &&
    !input.forceEffectsDespiteReducedMotion
  ) {
    return true;
  }
  return false;
}

export function clampFovOffset(
  degrees: number,
  maxStrength: number,
): number {
  const max = Math.min(8, Math.max(0, maxStrength));
  return Math.min(max, Math.max(0, degrees));
}
