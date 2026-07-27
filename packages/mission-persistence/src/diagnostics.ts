/**
 * Structured diagnostic codes for mission persistence.
 * Adapters and the coordinator surface these; they never affect scoring.
 */

export const MISSION_PERSISTENCE_DIAGNOSTICS = {
  OPEN_FAILED: 'MISSION_PERSISTENCE_OPEN_FAILED',
  WRITE_FAILED: 'MISSION_PERSISTENCE_WRITE_FAILED',
  READ_FAILED: 'MISSION_PERSISTENCE_READ_FAILED',
  RECORD_INVALID: 'MISSION_PERSISTENCE_RECORD_INVALID',
  TRANSACTION_ABORTED: 'MISSION_PERSISTENCE_TRANSACTION_ABORTED',
  QUOTA_EXCEEDED: 'MISSION_PERSISTENCE_QUOTA_EXCEEDED',
  FALLBACK_MEMORY: 'MISSION_PERSISTENCE_FALLBACK_MEMORY',
  BEST_IMAGES_PERSIST_FAILED: 'MISSION_BEST_IMAGES_PERSIST_FAILED',
  CLEAR_FAILED: 'MISSION_PERSISTENCE_CLEAR_FAILED',
} as const;

export type MissionPersistenceDiagnosticCode =
  (typeof MISSION_PERSISTENCE_DIAGNOSTICS)[keyof typeof MISSION_PERSISTENCE_DIAGNOSTICS];

export interface MissionPersistenceDiagnostic {
  readonly code: MissionPersistenceDiagnosticCode | string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type MissionPersistenceStorageMode = 'indexeddb' | 'memory' | 'unavailable';

export type MissionBestImageStatus =
  | 'none'
  | 'pending'
  | 'complete'
  | 'partial'
  | 'failed';

export type MissionResultSaveUiStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'saved-new-personal-best-images-pending'
  | 'saved-new-personal-best'
  | 'saved-without-images'
  | 'memory-only'
  | 'attempt-saved'
  | 'save-failed';
