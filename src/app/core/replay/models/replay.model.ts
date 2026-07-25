import type { Quat, Vec3 } from '../../flight/models/flight-state.model';

export const REPLAY_FORMAT_VERSION = 3;
export const REPLAY_SAMPLE_HZ = 30;
export const REPLAY_MAX_DURATION_MS = 5 * 60 * 1000;
/** Soft localStorage budget for a single replay JSON (~1.5 MB). */
export const REPLAY_STORAGE_MAX_BYTES = 1_500_000;
export const REPLAY_STORAGE_KEY = 'fpv-trainer.latest-replay.v1';

export interface ReplayVec3 {
  x: number;
  y: number;
  z: number;
}

export interface ReplayQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ReplayFrame {
  timestampMs: number;
  position: ReplayVec3;
  orientation: ReplayQuat;
  linearVelocity: ReplayVec3;
  angularVelocity: ReplayVec3;
  throttle: number;
  armed: boolean;
  crashed: boolean;
  currentGateIndex: number;
}

/** Compact collision event for replay v3+ (not every contact manifold). */
export interface ReplayCollisionEvent {
  timestampMs: number;
  objectId: string;
  material: string;
  impactStrength: number;
  collisionPoint: ReplayVec3;
  collisionNormal: ReplayVec3;
  outcome: string;
  crashState: boolean;
  crashReason?: string;
}

export interface ReplayMetadata {
  replayVersion: number;
  courseId: string;
  environmentId: string;
  startedAt: string;
  durationMs: number;
  completed: boolean;
  finalTimeMs: number;
  bestTimeAtCompletion: number | null;
  rateProfileId: string;
  frameIntervalMs: number;
  /** Optional v2+ fields for weather-aware playback / records. */
  environmentVersion?: number;
  weatherPresetId?: string;
  weatherCategory?: 'standard' | 'challenge';
  windSeed?: number;
  windParametersSnapshot?: {
    enabled: boolean;
    baseDirection: { x: number; y: number; z: number };
    baseSpeed: number;
    gustStrength: number;
    gustFrequency: number;
    turbulence: number;
    verticalDraftStrength: number;
    seed: number;
  };
  /** Optional v3+ collision / physics versioning. */
  collisionModelVersion?: string;
  colliderManifestVersion?: string;
  droneColliderVersion?: string;
  physicsEngineVersion?: string;
  environmentArtVersion?: string;
  /** Optional v4+ multi-aircraft fields. Legacy replays omit these. */
  aircraftId?: string;
  aircraftDefinitionVersion?: string;
  physicsProfileVersion?: string;
  colliderVersion?: string;
  visualVersion?: string;
  liveryId?: string;
  cameraProfileId?: string;
}

export interface FlightReplay {
  metadata: ReplayMetadata;
  frames: ReplayFrame[];
  /** Optional v3+ collision timeline (sparse). */
  collisionEvents?: ReplayCollisionEvent[];
}

export type ReplayPlaybackState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'error';

export function vec3ToReplay(v: Vec3): ReplayVec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function quatToReplay(q: Quat): ReplayQuat {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/** AngularVelocity (pitch/yaw/roll) → plain xyz for storage. */
export function angularToReplay(a: {
  pitch: number;
  yaw: number;
  roll: number;
}): ReplayVec3 {
  return { x: a.pitch, y: a.yaw, z: a.roll };
}
