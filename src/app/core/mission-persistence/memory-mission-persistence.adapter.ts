/**
 * In-memory mission persistence adapter.
 * Used when IndexedDB is unavailable, blocked, or permanently unsafe.
 * Same behavioral contract for the current page lifetime; storageMode = memory.
 *
 * Image-set replacement is atomic with respect to the in-memory maps: validate
 * first, snapshot prior rows, mutate, and restore the snapshot on failure.
 */

import {
  MISSION_BEST_IMAGES_MAX_COUNT,
  MISSION_BEST_IMAGE_MAX_BYTES,
  MISSION_PERSISTENCE_DIAGNOSTICS,
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  applyResultToSummary,
  bestImageStoreKey,
  planMissionResultRetention,
  sortResultsForHistory,
  validatePersistedMissionResult,
  validatePersistedMissionSummary,
  withImageStatus,
  type MissionBestImagePayload,
  type MissionBestImageRecord,
  type MissionBestImagesSaveOutcome,
  type MissionPersistenceClearResult,
  type MissionPersistenceImagesResult,
  type MissionPersistenceListResult,
  type MissionPersistenceOpenResult,
  type MissionPersistencePersonalBestResult,
  type MissionPersistencePort,
  type MissionPersistenceStorageMode,
  type MissionPersistenceSummaryResult,
  type MissionResultSaveOutcome,
  type PersistedMissionResultRecord,
  type PersistedMissionSummaryRecord,
} from '@fpv/mission-persistence';

type ImageEntry = {
  readonly manifest: MissionBestImageRecord['manifest'];
  readonly data: ArrayBuffer;
};

export class MemoryMissionPersistenceAdapter implements MissionPersistencePort {
  private readonly results = new Map<string, PersistedMissionResultRecord>();
  private readonly summaries = new Map<string, PersistedMissionSummaryRecord>();
  private readonly images = new Map<string, ImageEntry>();
  private opened = false;
  private mode: MissionPersistenceStorageMode = 'unavailable';

  /** Test seam: fail the next image replacement after validation. */
  failNextImageWriteForTests = false;

  async open(): Promise<MissionPersistenceOpenResult> {
    this.opened = true;
    this.mode = 'memory';
    return {
      ok: true,
      storageMode: 'memory',
      diagnostic: {
        code: MISSION_PERSISTENCE_DIAGNOSTICS.FALLBACK_MEMORY,
        message:
          'Mission results are stored in memory only for this session and will not survive reload.',
      },
    };
  }

  storageMode(): MissionPersistenceStorageMode {
    return this.mode;
  }

  async saveMissionResult(
    result: PersistedMissionResultRecord,
  ): Promise<MissionResultSaveOutcome> {
    this.assertOpen();
    const validated = validatePersistedMissionResult(result);
    if (!validated.ok) {
      return {
        ok: false,
        resultId: result.resultId,
        becamePersonalBest: false,
        duplicate: false,
        summary: null,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID,
          message: validated.reason,
        },
      };
    }

    const existing = this.results.get(validated.value.resultId);
    if (existing) {
      const summary = this.summaries.get(String(validated.value.missionScopeKey)) ?? null;
      return {
        ok: true,
        resultId: validated.value.resultId,
        becamePersonalBest: false,
        duplicate: true,
        summary,
      };
    }

    const scopeKey = String(validated.value.missionScopeKey);
    const applied = applyResultToSummary(this.summaries.get(scopeKey) ?? null, validated.value);
    this.results.set(validated.value.resultId, validated.value);
    this.summaries.set(scopeKey, applied.summary);
    this.applyRetention(scopeKey, applied.summary.personalBestResultId);

    return {
      ok: true,
      resultId: validated.value.resultId,
      becamePersonalBest: applied.becamePersonalBest,
      duplicate: false,
      summary: applied.summary,
    };
  }

  async getMissionSummary(
    missionScopeKey: string,
  ): Promise<MissionPersistenceSummaryResult> {
    this.assertOpen();
    const raw = this.summaries.get(missionScopeKey) ?? null;
    if (!raw) {
      return { ok: true, summary: null };
    }
    const validated = validatePersistedMissionSummary(raw);
    if (!validated.ok) {
      return {
        ok: false,
        summary: null,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID,
          message: validated.reason,
        },
      };
    }
    return { ok: true, summary: validated.value };
  }

  async getPersonalBest(
    missionScopeKey: string,
  ): Promise<MissionPersistencePersonalBestResult> {
    this.assertOpen();
    const summary = this.summaries.get(missionScopeKey);
    const pbId = summary?.personalBestResultId;
    if (!pbId) {
      return { ok: true, result: null };
    }
    const result = this.results.get(pbId) ?? null;
    if (!result) {
      return {
        ok: false,
        result: null,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID,
          message: 'Personal Best pointer references a missing result',
        },
      };
    }
    const validated = validatePersistedMissionResult(result);
    if (!validated.ok || validated.value.status !== 'completed') {
      return {
        ok: false,
        result: null,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID,
          message: 'Personal Best record is invalid or not completed',
        },
      };
    }
    return { ok: true, result: validated.value };
  }

  async listRecentResults(
    missionScopeKey: string,
    limit = 20,
  ): Promise<MissionPersistenceListResult> {
    this.assertOpen();
    const valid: PersistedMissionResultRecord[] = [];
    let invalidCount = 0;
    for (const raw of this.results.values()) {
      if (String(raw.missionScopeKey) !== missionScopeKey) {
        continue;
      }
      const validated = validatePersistedMissionResult(raw);
      if (!validated.ok) {
        invalidCount += 1;
        continue;
      }
      valid.push(validated.value);
    }
    const sorted = sortResultsForHistory(
      valid.map((r) => ({
        resultId: r.resultId,
        savedAtEpochMs: r.savedAt.savedAtEpochMs,
        record: r,
      })),
    ).map((entry) => entry.record);
    return { ok: true, results: sorted.slice(0, limit), invalidCount };
  }

  async saveBestImages(
    missionScopeKey: string,
    personalBestResultId: string,
    images: readonly MissionBestImagePayload[],
    expectedObjectiveIds: readonly string[],
  ): Promise<MissionBestImagesSaveOutcome> {
    this.assertOpen();
    const summary = this.summaries.get(missionScopeKey);
    if (!summary || summary.personalBestResultId !== personalBestResultId) {
      return {
        ok: false,
        status: 'failed',
        storedObjectiveIds: [],
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
          message: 'Images rejected: result is not the current Personal Best',
        },
      };
    }

    const maxCount = Math.min(
      expectedObjectiveIds.length,
      MISSION_BEST_IMAGES_MAX_COUNT,
    );
    const accepted: MissionBestImagePayload[] = [];
    for (const image of images) {
      if (!expectedObjectiveIds.includes(image.objectiveId)) {
        continue;
      }
      if (image.byteLength <= 0 || image.byteLength > MISSION_BEST_IMAGE_MAX_BYTES) {
        continue;
      }
      if (image.data.byteLength !== image.byteLength) {
        continue;
      }
      if (!image.mimeType.startsWith('image/')) {
        continue;
      }
      accepted.push(image);
      if (accepted.length >= maxCount) {
        break;
      }
    }

    // Snapshot prior scope images so a failed mutation can restore them.
    const prior = new Map<string, ImageEntry>();
    for (const [key, entry] of this.images.entries()) {
      if (key.startsWith(`${missionScopeKey}:`)) {
        prior.set(key, entry);
      }
    }

    if (this.failNextImageWriteForTests) {
      this.failNextImageWriteForTests = false;
      this.summaries.set(missionScopeKey, withImageStatus(summary, 'failed'));
      return {
        ok: false,
        status: 'failed',
        storedObjectiveIds: [],
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.TRANSACTION_ABORTED,
          message: 'Injected image transaction failure',
        },
      };
    }

    try {
      this.deleteImagesForScope(missionScopeKey);
      const storedObjectiveIds: string[] = [];
      for (const image of accepted) {
        const key = bestImageStoreKey(missionScopeKey, image.objectiveId);
        this.images.set(key, {
          manifest: {
            persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
            missionScopeKey,
            personalBestResultId,
            objectiveId: image.objectiveId,
            mimeType: image.mimeType,
            byteLength: image.byteLength,
          },
          data: image.data.slice(0),
        });
        storedObjectiveIds.push(image.objectiveId);
      }

      let status: MissionBestImagesSaveOutcome['status'] = 'complete';
      if (storedObjectiveIds.length === 0) {
        status = expectedObjectiveIds.length === 0 ? 'none' : 'failed';
      } else if (storedObjectiveIds.length < expectedObjectiveIds.length) {
        status = 'partial';
      }

      this.summaries.set(missionScopeKey, withImageStatus(summary, status));
      return {
        ok: status === 'complete' || status === 'none',
        status,
        storedObjectiveIds,
        diagnostic:
          status === 'complete' || status === 'none'
            ? undefined
            : {
                code: MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
                message: `Stored ${storedObjectiveIds.length} of ${expectedObjectiveIds.length} Personal Best images`,
              },
      };
    } catch (error) {
      this.deleteImagesForScope(missionScopeKey);
      for (const [key, entry] of prior.entries()) {
        this.images.set(key, entry);
      }
      this.summaries.set(missionScopeKey, withImageStatus(summary, 'failed'));
      return {
        ok: false,
        status: 'failed',
        storedObjectiveIds: [],
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async getBestImages(
    missionScopeKey: string,
    personalBestResultId: string,
  ): Promise<MissionPersistenceImagesResult> {
    this.assertOpen();
    const summary = this.summaries.get(missionScopeKey);
    if (summary?.personalBestResultId !== personalBestResultId) {
      return { ok: true, images: [] };
    }
    const images: MissionBestImageRecord[] = [];
    for (const entry of this.images.values()) {
      if (String(entry.manifest.missionScopeKey) !== missionScopeKey) {
        continue;
      }
      if (entry.manifest.personalBestResultId !== personalBestResultId) {
        continue;
      }
      if (entry.manifest.personalBestResultId !== summary.personalBestResultId) {
        continue;
      }
      images.push({
        manifest: entry.manifest,
        data: entry.data.slice(0),
      });
    }
    return { ok: true, images };
  }

  async clearMissionScope(missionScopeKey: string): Promise<MissionPersistenceClearResult> {
    this.assertOpen();
    for (const [id, result] of [...this.results.entries()]) {
      if (String(result.missionScopeKey) === missionScopeKey) {
        this.results.delete(id);
      }
    }
    this.summaries.delete(missionScopeKey);
    this.deleteImagesForScope(missionScopeKey);
    return { ok: true };
  }

  async clearAllMissionData(): Promise<MissionPersistenceClearResult> {
    this.assertOpen();
    this.results.clear();
    this.summaries.clear();
    this.images.clear();
    return { ok: true };
  }

  async close(): Promise<void> {
    this.opened = false;
    this.mode = 'unavailable';
  }

  private applyRetention(scopeKey: string, personalBestResultId: string | null): void {
    const candidates = [...this.results.values()]
      .filter((r) => String(r.missionScopeKey) === scopeKey)
      .map((r) => ({
        resultId: r.resultId,
        savedAtEpochMs: r.savedAt.savedAtEpochMs,
      }));
    const plan = planMissionResultRetention({
      candidates,
      personalBestResultId,
    });
    for (const id of plan.deleteIds) {
      this.results.delete(id);
    }
  }

  private deleteImagesForScope(missionScopeKey: string): void {
    for (const key of [...this.images.keys()]) {
      if (key.startsWith(`${missionScopeKey}:`)) {
        this.images.delete(key);
      }
    }
  }

  private assertOpen(): void {
    if (!this.opened) {
      throw new Error('MemoryMissionPersistenceAdapter is not open');
    }
  }
}

export function createMemoryMissionPersistenceAdapter(): MemoryMissionPersistenceAdapter {
  return new MemoryMissionPersistenceAdapter();
}
