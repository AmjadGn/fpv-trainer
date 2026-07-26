import {
  MISSION_CAPTURE_ASPECT_RATIO,
  PROJECTION_MODEL_VERSION,
  type Vec3,
} from '@fpv/simulation-contracts';

/**
 * One authoritative base-camera contract for both:
 * - deterministic photography camera snapshots
 * - Three.js FPV base camera pose
 *
 * Presentation effects (shake, look lag, impact, cosmetic FOV) are applied
 * only after this rig's base pose and must never enter scoring evidence.
 */

export type FlightCameraResolutionStrategy =
  | 'legacy-renderer-compatible-v1'
  | 'aircraft-profile-v1';

export interface SourceCameraProfileMetadata {
  readonly profileId: string | null;
  readonly profileVersion: string | null;
  readonly sourceLocalPosition: Vec3 | null;
  readonly sourceCameraAngleDeg: number | null;
  readonly sourceDefaultFov: number | null;
  readonly mismatchDiagnostics: readonly string[];
}

export interface ResolvedFlightCameraRig {
  readonly rigId: string;
  readonly rigVersion: string;
  readonly resolutionStrategy: FlightCameraResolutionStrategy;
  readonly localMountPosition: Vec3;
  /** Pitch-up tilt relative to body forward (radians). */
  readonly localCameraTiltRad: number;
  readonly baseVerticalFovDegrees: number;
  readonly missionCaptureAspectRatio: number;
  readonly nearMeters: number;
  readonly farMeters: number;
  readonly projectionModelVersion: string;
  readonly sourceCameraProfile: SourceCameraProfileMetadata;
  readonly legacyCompatibilityUsed: boolean;
  readonly templateDerivedCamera: boolean;
  /** Always true for this contract — cosmetics are never part of the rig. */
  readonly cosmeticEffectsExcluded: true;
}

/** Hardcoded FPV mount used by the live Three.js renderer before profile normalization. */
export const LEGACY_FPV_MOUNT_POSITION: Vec3 = { x: 0, y: 0.12, z: -0.18 };

/** Hardcoded base FOV used by the live Three.js PerspectiveCamera. */
export const LEGACY_FPV_BASE_FOV_DEGREES = 75;

export const LEGACY_FPV_NEAR_METERS = 0.05;
export const LEGACY_FPV_FAR_METERS = 900;

export const RESOLVED_FLIGHT_CAMERA_RIG_VERSION = '1.0.0';

export const DEFAULT_MISSION_CAPTURE_ASPECT = MISSION_CAPTURE_ASPECT_RATIO;
export const DEFAULT_PROJECTION_MODEL_VERSION = PROJECTION_MODEL_VERSION;
