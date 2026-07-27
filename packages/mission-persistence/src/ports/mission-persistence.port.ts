/**
 * Pure port surface for mission persistence.
 *
 * Binary image payloads use ArrayBuffer (not Blob) so this package stays
 * free of DOM APIs. Application adapters may wrap Blob ↔ ArrayBuffer.
 */

import type {
  MissionBestImageStatus,
  MissionPersistenceDiagnostic,
  MissionPersistenceStorageMode,
} from '../diagnostics';
import type {
  PersistedBestImageManifestEntry,
  PersistedMissionResultRecord,
  PersistedMissionSummaryRecord,
} from '../records/persisted-result';

export interface MissionPersistenceOpenResult {
  readonly ok: boolean;
  readonly storageMode: MissionPersistenceStorageMode;
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

export interface MissionResultSaveOutcome {
  readonly ok: boolean;
  readonly resultId: string;
  readonly becamePersonalBest: boolean;
  readonly duplicate: boolean;
  readonly summary: PersistedMissionSummaryRecord | null;
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

export interface MissionBestImagePayload {
  readonly objectiveId: string;
  readonly mimeType: string;
  readonly byteLength: number;
  /** Pure binary payload — adapters convert from Blob when needed. */
  readonly data: ArrayBuffer;
}

export interface MissionBestImageRecord {
  readonly manifest: PersistedBestImageManifestEntry;
  readonly data: ArrayBuffer;
}

export interface MissionBestImagesSaveOutcome {
  readonly ok: boolean;
  readonly status: MissionBestImageStatus;
  readonly storedObjectiveIds: readonly string[];
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

export interface MissionPersistenceListResult {
  readonly ok: boolean;
  readonly results: readonly PersistedMissionResultRecord[];
  readonly invalidCount: number;
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

export interface MissionPersistenceSummaryResult {
  readonly ok: boolean;
  readonly summary: PersistedMissionSummaryRecord | null;
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

export interface MissionPersistencePersonalBestResult {
  readonly ok: boolean;
  readonly result: PersistedMissionResultRecord | null;
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

export interface MissionPersistenceImagesResult {
  readonly ok: boolean;
  readonly images: readonly MissionBestImageRecord[];
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

export interface MissionPersistenceClearResult {
  readonly ok: boolean;
  readonly diagnostic?: MissionPersistenceDiagnostic;
}

/**
 * Application-facing persistence port.
 * Implementations must not expose raw IDBDatabase / transactions / DOMException.
 */
export interface MissionPersistencePort {
  open(): Promise<MissionPersistenceOpenResult>;
  storageMode(): MissionPersistenceStorageMode;
  saveMissionResult(
    result: PersistedMissionResultRecord,
  ): Promise<MissionResultSaveOutcome>;
  getMissionSummary(
    missionScopeKey: string,
  ): Promise<MissionPersistenceSummaryResult>;
  getPersonalBest(
    missionScopeKey: string,
  ): Promise<MissionPersistencePersonalBestResult>;
  listRecentResults(
    missionScopeKey: string,
    limit?: number,
  ): Promise<MissionPersistenceListResult>;
  saveBestImages(
    missionScopeKey: string,
    personalBestResultId: string,
    images: readonly MissionBestImagePayload[],
    expectedObjectiveIds: readonly string[],
  ): Promise<MissionBestImagesSaveOutcome>;
  getBestImages(
    missionScopeKey: string,
    personalBestResultId: string,
  ): Promise<MissionPersistenceImagesResult>;
  clearMissionScope(missionScopeKey: string): Promise<MissionPersistenceClearResult>;
  clearAllMissionData(): Promise<MissionPersistenceClearResult>;
  close(): Promise<void>;
}
