import type { FlightReplay } from '../../replay/models/replay.model';

export const GHOST_RECORD_VERSION = 1;
export const GHOST_STORAGE_KEY_PREFIX = 'fpv-trainer.course-ghost.v1.';
/** Soft localStorage budget for a single ghost JSON (~1.5 MB). */
export const GHOST_STORAGE_MAX_BYTES = 1_500_000;

export type GhostRaceState =
  | 'unavailable'
  | 'loading'
  | 'ready'
  | 'waiting'
  | 'racing'
  | 'finished'
  | 'error';

export type GhostComparisonMode = 'gateSplits' | 'approximateLive' | 'both';

export type GhostAheadState = 'ahead' | 'behind' | 'tied' | 'unknown';

/**
 * Persisted best-run ghost for a single course.
 * Stores a validated FlightReplay (same format as latest replay).
 */
export interface CourseGhostRecord {
  version: number;
  courseId: string;
  courseVersion: number;
  environmentId: string;
  finalTimeMs: number;
  replay: FlightReplay;
  rateProfileId: string;
  createdAt: string;
  environmentVersion?: number;
  weatherCategory?: 'standard' | 'challenge';
  weatherPresetId?: string;
  /** Multi-aircraft: original craft used for this ghost replay. */
  aircraftId?: string;
  aircraftDefinitionVersion?: string;
  visualVersion?: string;
}

export interface GhostMetadata {
  courseId: string;
  courseVersion: number;
  environmentId: string;
  finalTimeMs: number;
  rateProfileId: string;
  createdAt: string;
  frameCount: number;
}

export interface GhostGateSplit {
  gateIndex: number;
  /** Elapsed time when the ghost first reached this completed gate count. */
  timeMs: number;
}

export interface GhostComparisonSnapshot {
  aheadState: GhostAheadState;
  /** Signed seconds: negative = player ahead, positive = behind. */
  splitDeltaSeconds: number | null;
  /** Optional continuous estimate between gates. */
  liveDeltaSeconds: number | null;
  /** World-space distance to ghost (m), or null if unavailable. */
  distanceMeters: number | null;
  /** Player gate progress minus ghost gate progress. */
  progressDelta: number;
  /** Gate index used for the current exact split comparison. */
  splitGateIndex: number;
  smoothedDeltaSeconds: number | null;
}

export interface GhostRaceHudState {
  raceState: GhostRaceState;
  enabled: boolean;
  bestTimeMs: number | null;
  comparison: GhostComparisonSnapshot | null;
  message: string | null;
  unavailableReason: string | null;
  ghostBeaten: boolean | null;
  finalDeltaSeconds: number | null;
}

export type GhostStorageStatus =
  | 'empty'
  | 'memory'
  | 'persisted'
  | 'quota_exceeded'
  | 'corrupt'
  | 'course_mismatch';

export function ghostStorageKey(
  courseId: string,
  weatherCategory: 'standard' | 'challenge' = 'standard',
): string {
  if (weatherCategory === 'standard') {
    return `${GHOST_STORAGE_KEY_PREFIX}${courseId}`;
  }
  return `${GHOST_STORAGE_KEY_PREFIX}${courseId}.${weatherCategory}`;
}
