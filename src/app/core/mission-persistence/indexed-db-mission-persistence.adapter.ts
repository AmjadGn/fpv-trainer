/**
 * IndexedDB adapter for durable mission results (`fpv-missions-v1`).
 *
 * Core result/summary writes share one read-write transaction.
 * Image Blobs are stored outside that core transaction and never affect scores.
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

export const MISSIONS_IDB_NAME = 'fpv-missions-v1';
export const MISSIONS_IDB_VERSION = 1;

export const MISSIONS_IDB_STORES = {
  results: 'results',
  missionSummaries: 'missionSummaries',
  bestImages: 'bestImages',
  metadata: 'metadata',
} as const;

interface BestImageRow {
  readonly key: string;
  readonly persistenceSchemaVersion: string;
  readonly missionScopeKey: string;
  readonly personalBestResultId: string;
  readonly objectiveId: string;
  readonly mimeType: string;
  readonly byteLength: number;
  /**
   * Application-adapter binary payload.
   * Stored as ArrayBuffer for reliable IndexedDB structured clone; converted
   * to Blob at the presentation boundary when object URLs are created.
   */
  readonly data: ArrayBuffer;
}

function isIndexedDbAvailable(): boolean {
  try {
    return typeof (globalThis as { indexedDB?: IDBFactory }).indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function diagnoseQuota(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String((error as { name?: string }).name) : '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String((error as { name?: string }).name) : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'AbortError' || /abort/i.test(message);
}

export class IndexedDbMissionPersistenceAdapter implements MissionPersistencePort {
  private db: IDBDatabase | null = null;
  private openPromise: Promise<IDBDatabase> | null = null;
  private mode: MissionPersistenceStorageMode = 'unavailable';
  private readonly dbName: string;

  constructor(options: { readonly dbName?: string } = {}) {
    this.dbName = options.dbName ?? MISSIONS_IDB_NAME;
  }

  async open(): Promise<MissionPersistenceOpenResult> {
    if (!isIndexedDbAvailable()) {
      this.mode = 'unavailable';
      return {
        ok: false,
        storageMode: 'unavailable',
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.OPEN_FAILED,
          message: 'IndexedDB is not available in this environment',
        },
      };
    }
    try {
      await this.ensureDb();
      this.mode = 'indexeddb';
      return { ok: true, storageMode: 'indexeddb' };
    } catch (error) {
      this.mode = 'unavailable';
      this.db = null;
      this.openPromise = null;
      return {
        ok: false,
        storageMode: 'unavailable',
        diagnostic: {
          code: diagnoseQuota(error)
            ? MISSION_PERSISTENCE_DIAGNOSTICS.QUOTA_EXCEEDED
            : MISSION_PERSISTENCE_DIAGNOSTICS.OPEN_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  storageMode(): MissionPersistenceStorageMode {
    return this.mode;
  }

  async saveMissionResult(
    result: PersistedMissionResultRecord,
  ): Promise<MissionResultSaveOutcome> {
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

    try {
      const db = await this.ensureDb();
      const outcome = await this.runCoreSaveTransaction(db, validated.value);
      if (outcome.ok && !outcome.duplicate) {
        await this.runRetention(db, String(validated.value.missionScopeKey), outcome.summary);
      }
      return outcome;
    } catch (error) {
      return {
        ok: false,
        resultId: result.resultId,
        becamePersonalBest: false,
        duplicate: false,
        summary: null,
        diagnostic: {
          code: diagnoseQuota(error)
            ? MISSION_PERSISTENCE_DIAGNOSTICS.QUOTA_EXCEEDED
            : error instanceof Error && error.message.includes('aborted')
              ? MISSION_PERSISTENCE_DIAGNOSTICS.TRANSACTION_ABORTED
              : MISSION_PERSISTENCE_DIAGNOSTICS.WRITE_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async getMissionSummary(
    missionScopeKey: string,
  ): Promise<MissionPersistenceSummaryResult> {
    try {
      const db = await this.ensureDb();
      const raw = await idbGet<PersistedMissionSummaryRecord>(
        db,
        MISSIONS_IDB_STORES.missionSummaries,
        missionScopeKey,
      );
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
    } catch (error) {
      return {
        ok: false,
        summary: null,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.READ_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async getPersonalBest(
    missionScopeKey: string,
  ): Promise<MissionPersistencePersonalBestResult> {
    const summaryResult = await this.getMissionSummary(missionScopeKey);
    if (!summaryResult.ok) {
      return { ok: false, result: null, diagnostic: summaryResult.diagnostic };
    }
    const pbId = summaryResult.summary?.personalBestResultId;
    if (!pbId) {
      return { ok: true, result: null };
    }
    try {
      const db = await this.ensureDb();
      const raw = await idbGet<PersistedMissionResultRecord>(
        db,
        MISSIONS_IDB_STORES.results,
        pbId,
      );
      if (!raw) {
        return {
          ok: false,
          result: null,
          diagnostic: {
            code: MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID,
            message: 'Personal Best pointer references a missing result',
          },
        };
      }
      const validated = validatePersistedMissionResult(raw);
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
    } catch (error) {
      return {
        ok: false,
        result: null,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.READ_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async listRecentResults(
    missionScopeKey: string,
    limit = 20,
  ): Promise<MissionPersistenceListResult> {
    try {
      const db = await this.ensureDb();
      const rawRows = await idbGetAllByIndex<PersistedMissionResultRecord>(
        db,
        MISSIONS_IDB_STORES.results,
        'missionScopeKey',
        missionScopeKey,
      );
      const valid: PersistedMissionResultRecord[] = [];
      let invalidCount = 0;
      for (const raw of rawRows) {
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
    } catch (error) {
      return {
        ok: false,
        results: [],
        invalidCount: 0,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.READ_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async saveBestImages(
    missionScopeKey: string,
    personalBestResultId: string,
    images: readonly MissionBestImagePayload[],
    expectedObjectiveIds: readonly string[],
  ): Promise<MissionBestImagesSaveOutcome> {
    try {
      const db = await this.ensureDb();
      return await this.runAtomicBestImageReplacement(
        db,
        missionScopeKey,
        personalBestResultId,
        images,
        expectedObjectiveIds,
      );
    } catch (error) {
      // Transaction abort preserves prior image rows. Attempt a safe follow-up
      // status update to `failed` without mutating image bytes.
      try {
        const db = this.db;
        if (db) {
          await this.markImageStatusFailed(db, missionScopeKey, personalBestResultId);
        }
      } catch {
        // Best-effort status update only.
      }
      return {
        ok: false,
        status: 'failed',
        storedObjectiveIds: [],
        diagnostic: {
          code: diagnoseQuota(error)
            ? MISSION_PERSISTENCE_DIAGNOSTICS.QUOTA_EXCEEDED
            : isAbortError(error)
              ? MISSION_PERSISTENCE_DIAGNOSTICS.TRANSACTION_ABORTED
              : MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async getBestImages(
    missionScopeKey: string,
    personalBestResultId: string,
  ): Promise<MissionPersistenceImagesResult> {
    try {
      const db = await this.ensureDb();
      const summaryRaw = await idbGet<PersistedMissionSummaryRecord>(
        db,
        MISSIONS_IDB_STORES.missionSummaries,
        missionScopeKey,
      );
      const summaryValidated = summaryRaw
        ? validatePersistedMissionSummary(summaryRaw)
        : null;
      const currentPbId = summaryValidated?.ok
        ? summaryValidated.value.personalBestResultId
        : null;
      // Never present orphaned rows that do not match the current PB pointer.
      if (currentPbId !== personalBestResultId) {
        return { ok: true, images: [] };
      }

      const rows = await idbGetAll<BestImageRow>(db, MISSIONS_IDB_STORES.bestImages);
      const images: MissionBestImageRecord[] = [];
      for (const row of rows) {
        if (String(row.missionScopeKey) !== missionScopeKey) {
          continue;
        }
        if (row.personalBestResultId !== personalBestResultId) {
          continue;
        }
        if (row.personalBestResultId !== currentPbId) {
          continue;
        }
        images.push({
          manifest: {
            persistenceSchemaVersion: row.persistenceSchemaVersion,
            missionScopeKey: row.missionScopeKey,
            personalBestResultId: row.personalBestResultId,
            objectiveId: row.objectiveId,
            mimeType: row.mimeType,
            byteLength: row.byteLength,
          },
          data: row.data.slice(0),
        });
      }
      return { ok: true, images };
    } catch (error) {
      return {
        ok: false,
        images: [],
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.READ_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async clearMissionScope(missionScopeKey: string): Promise<MissionPersistenceClearResult> {
    try {
      const db = await this.ensureDb();
      const results = await idbGetAllByIndex<PersistedMissionResultRecord>(
        db,
        MISSIONS_IDB_STORES.results,
        'missionScopeKey',
        missionScopeKey,
      );
      await idbRunReadWrite(db, [
        MISSIONS_IDB_STORES.results,
        MISSIONS_IDB_STORES.missionSummaries,
        MISSIONS_IDB_STORES.bestImages,
      ], (stores) => {
        for (const result of results) {
          stores[MISSIONS_IDB_STORES.results].delete(result.resultId);
        }
        stores[MISSIONS_IDB_STORES.missionSummaries].delete(missionScopeKey);
      });
      await this.deleteImagesForScope(db, missionScopeKey);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.CLEAR_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async clearAllMissionData(): Promise<MissionPersistenceClearResult> {
    try {
      const db = await this.ensureDb();
      await idbRunReadWrite(db, [
        MISSIONS_IDB_STORES.results,
        MISSIONS_IDB_STORES.missionSummaries,
        MISSIONS_IDB_STORES.bestImages,
        MISSIONS_IDB_STORES.metadata,
      ], async (stores) => {
        stores[MISSIONS_IDB_STORES.results].clear();
        stores[MISSIONS_IDB_STORES.missionSummaries].clear();
        stores[MISSIONS_IDB_STORES.bestImages].clear();
        stores[MISSIONS_IDB_STORES.metadata].clear();
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        diagnostic: {
          code: MISSION_PERSISTENCE_DIAGNOSTICS.CLEAR_FAILED,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.openPromise = null;
    this.mode = 'unavailable';
  }

  /** Test helper — closes without deleting the database. */
  async resetConnection(): Promise<void> {
    await this.close();
  }

  /**
   * Test seam: abort the next atomic image replacement after validation and
   * after mutation requests are queued, simulating a transaction abort that
   * must preserve the prior image set.
   */
  abortNextImageTransactionForTests = false;

  private runAtomicBestImageReplacement(
    db: IDBDatabase,
    missionScopeKey: string,
    personalBestResultId: string,
    images: readonly MissionBestImagePayload[],
    expectedObjectiveIds: readonly string[],
  ): Promise<MissionBestImagesSaveOutcome> {
    // Validate the complete settled payload list before opening the mutation TX.
    const maxCount = Math.min(expectedObjectiveIds.length, MISSION_BEST_IMAGES_MAX_COUNT);
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

    return new Promise((resolve, reject) => {
      let outcome: MissionBestImagesSaveOutcome | null = null;
      try {
        const tx = db.transaction(
          [MISSIONS_IDB_STORES.bestImages, MISSIONS_IDB_STORES.missionSummaries],
          'readwrite',
        );
        const imagesStore = tx.objectStore(MISSIONS_IDB_STORES.bestImages);
        const summariesStore = tx.objectStore(MISSIONS_IDB_STORES.missionSummaries);
        const imageIndex = imagesStore.index('missionScopeKey');

        const summaryReq = summariesStore.get(missionScopeKey);
        summaryReq.onsuccess = () => {
          const summaryRaw = summaryReq.result as PersistedMissionSummaryRecord | undefined;
          const summaryValidated = summaryRaw
            ? validatePersistedMissionSummary(summaryRaw)
            : null;
          if (
            !summaryValidated?.ok ||
            summaryValidated.value.personalBestResultId !== personalBestResultId
          ) {
            outcome = {
              ok: false,
              status: 'failed',
              storedObjectiveIds: [],
              diagnostic: {
                code: MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
                message: 'Images rejected: result is not the current Personal Best',
              },
            };
            return;
          }

          const keysReq = imageIndex.getAllKeys(missionScopeKey);
          keysReq.onsuccess = () => {
            const keys = (keysReq.result as IDBValidKey[]) ?? [];
            for (const key of keys) {
              imagesStore.delete(key);
            }

            const storedObjectiveIds: string[] = [];
            for (const image of accepted) {
              const row: BestImageRow = {
                key: bestImageStoreKey(missionScopeKey, image.objectiveId),
                persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
                missionScopeKey,
                personalBestResultId,
                objectiveId: image.objectiveId,
                mimeType: image.mimeType,
                byteLength: image.byteLength,
                data: image.data.slice(0),
              };
              imagesStore.put(row);
              storedObjectiveIds.push(image.objectiveId);
            }

            let status: MissionBestImagesSaveOutcome['status'] = 'complete';
            if (storedObjectiveIds.length === 0) {
              status = expectedObjectiveIds.length === 0 ? 'none' : 'failed';
            } else if (storedObjectiveIds.length < expectedObjectiveIds.length) {
              status = 'partial';
            }

            summariesStore.put(withImageStatus(summaryValidated.value, status));
            outcome = {
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

            if (this.abortNextImageTransactionForTests) {
              this.abortNextImageTransactionForTests = false;
              try {
                tx.abort();
              } catch {
                // ignore
              }
            }
          };
        };

        tx.oncomplete = () => {
          resolve(
            outcome ?? {
              ok: false,
              status: 'failed',
              storedObjectiveIds: [],
              diagnostic: {
                code: MISSION_PERSISTENCE_DIAGNOSTICS.WRITE_FAILED,
                message: 'Image transaction completed without outcome',
              },
            },
          );
        };
        tx.onabort = () => {
          reject(new Error(tx.error?.message ?? 'transaction aborted'));
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('transaction error'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private async markImageStatusFailed(
    db: IDBDatabase,
    missionScopeKey: string,
    personalBestResultId: string,
  ): Promise<void> {
    const summaryRaw = await idbGet<PersistedMissionSummaryRecord>(
      db,
      MISSIONS_IDB_STORES.missionSummaries,
      missionScopeKey,
    );
    if (!summaryRaw) {
      return;
    }
    const validated = validatePersistedMissionSummary(summaryRaw);
    if (!validated.ok || validated.value.personalBestResultId !== personalBestResultId) {
      return;
    }
    await idbPut(
      db,
      MISSIONS_IDB_STORES.missionSummaries,
      withImageStatus(validated.value, 'failed'),
    );
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }
    if (this.openPromise) {
      return this.openPromise;
    }
    const indexedDB = (globalThis as { indexedDB: IDBFactory }).indexedDB;
    this.openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, MISSIONS_IDB_VERSION);
      req.onblocked = () => {
        reject(new Error('IndexedDB open blocked by another connection'));
      };
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MISSIONS_IDB_STORES.results)) {
          const results = db.createObjectStore(MISSIONS_IDB_STORES.results, {
            keyPath: 'resultId',
          });
          results.createIndex('missionScopeKey', 'missionScopeKey', { unique: false });
          results.createIndex('savedAtEpochMs', 'savedAt.savedAtEpochMs', { unique: false });
          results.createIndex(
            'missionScopeKey_savedAt',
            ['missionScopeKey', 'savedAt.savedAtEpochMs'],
            { unique: false },
          );
        }
        if (!db.objectStoreNames.contains(MISSIONS_IDB_STORES.missionSummaries)) {
          db.createObjectStore(MISSIONS_IDB_STORES.missionSummaries, {
            keyPath: 'missionScopeKey',
          });
        }
        if (!db.objectStoreNames.contains(MISSIONS_IDB_STORES.bestImages)) {
          const images = db.createObjectStore(MISSIONS_IDB_STORES.bestImages, {
            keyPath: 'key',
          });
          images.createIndex('missionScopeKey', 'missionScopeKey', { unique: false });
          images.createIndex('personalBestResultId', 'personalBestResultId', {
            unique: false,
          });
        }
        if (!db.objectStoreNames.contains(MISSIONS_IDB_STORES.metadata)) {
          db.createObjectStore(MISSIONS_IDB_STORES.metadata, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          if (this.db === db) {
            this.db = null;
            this.openPromise = null;
            this.mode = 'unavailable';
          }
        };
        this.db = db;
        resolve(db);
      };
      req.onerror = () => {
        this.openPromise = null;
        reject(req.error ?? new Error('IndexedDB open failed'));
      };
    });
    try {
      return await this.openPromise;
    } catch (error) {
      this.openPromise = null;
      throw error;
    }
  }

  private runCoreSaveTransaction(
    db: IDBDatabase,
    result: PersistedMissionResultRecord,
  ): Promise<MissionResultSaveOutcome> {
    return new Promise((resolve, reject) => {
      let outcome: MissionResultSaveOutcome | null = null;
      try {
        const tx = db.transaction(
          [MISSIONS_IDB_STORES.results, MISSIONS_IDB_STORES.missionSummaries],
          'readwrite',
        );
        const resultsStore = tx.objectStore(MISSIONS_IDB_STORES.results);
        const summariesStore = tx.objectStore(MISSIONS_IDB_STORES.missionSummaries);

        const existingReq = resultsStore.get(result.resultId);
        existingReq.onsuccess = () => {
          if (existingReq.result) {
            const summaryReq = summariesStore.get(String(result.missionScopeKey));
            summaryReq.onsuccess = () => {
              outcome = {
                ok: true,
                resultId: result.resultId,
                becamePersonalBest: false,
                duplicate: true,
                summary: (summaryReq.result as PersistedMissionSummaryRecord | undefined) ?? null,
              };
            };
            return;
          }

          const summaryReq = summariesStore.get(String(result.missionScopeKey));
          summaryReq.onsuccess = () => {
            const current = (summaryReq.result as PersistedMissionSummaryRecord | undefined) ?? null;
            const applied = applyResultToSummary(current, result);
            resultsStore.put(result);
            summariesStore.put(applied.summary);
            outcome = {
              ok: true,
              resultId: result.resultId,
              becamePersonalBest: applied.becamePersonalBest,
              duplicate: false,
              summary: applied.summary,
            };
          };
        };

        tx.oncomplete = () => {
          resolve(
            outcome ?? {
              ok: false,
              resultId: result.resultId,
              becamePersonalBest: false,
              duplicate: false,
              summary: null,
              diagnostic: {
                code: MISSION_PERSISTENCE_DIAGNOSTICS.WRITE_FAILED,
                message: 'Transaction completed without outcome',
              },
            },
          );
        };
        tx.onabort = () => {
          reject(new Error(tx.error?.message ?? 'transaction aborted'));
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('transaction error'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private async runRetention(
    db: IDBDatabase,
    missionScopeKey: string,
    summary: PersistedMissionSummaryRecord | null,
  ): Promise<void> {
    if (!summary) {
      return;
    }
    const rows = await idbGetAllByIndex<PersistedMissionResultRecord>(
      db,
      MISSIONS_IDB_STORES.results,
      'missionScopeKey',
      missionScopeKey,
    );
    const plan = planMissionResultRetention({
      candidates: rows.map((r) => ({
        resultId: r.resultId,
        savedAtEpochMs: r.savedAt?.savedAtEpochMs ?? 0,
      })),
      personalBestResultId: summary.personalBestResultId,
    });
    if (plan.deleteIds.length === 0) {
      return;
    }
    await idbRunReadWrite(db, [MISSIONS_IDB_STORES.results], async (stores) => {
      for (const id of plan.deleteIds) {
        stores[MISSIONS_IDB_STORES.results].delete(id);
      }
    });
  }

  private async deleteImagesForScope(db: IDBDatabase, missionScopeKey: string): Promise<void> {
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(MISSIONS_IDB_STORES.bestImages, 'readonly');
      const req = tx
        .objectStore(MISSIONS_IDB_STORES.bestImages)
        .index('missionScopeKey')
        .getAllKeys(missionScopeKey);
      req.onsuccess = () => resolve((req.result as IDBValidKey[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('getAllKeys failed'));
    });
    if (keys.length === 0) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MISSIONS_IDB_STORES.bestImages, 'readwrite');
      const store = tx.objectStore(MISSIONS_IDB_STORES.bestImages);
      for (const key of keys) {
        store.delete(key);
      }
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(tx.error?.message ?? 'delete images aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('delete images failed'));
    });
  }
}

export function createIndexedDbMissionPersistenceAdapter(
  options?: { readonly dbName?: string },
): IndexedDbMissionPersistenceAdapter {
  return new IndexedDbMissionPersistenceAdapter(options);
}

async function idbGet<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error ?? new Error('idb get failed'));
  });
}

async function idbPut(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error(tx.error?.message ?? 'put aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('put failed'));
  });
}

async function idbGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('idb getAll failed'));
  });
}

async function idbGetAllByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index(indexName).getAll(key);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('idb getAll failed'));
  });
}

async function idbRunReadWrite(
  db: IDBDatabase,
  storeNames: string[],
  work: (stores: Record<string, IDBObjectStore>) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    const stores: Record<string, IDBObjectStore> = {};
    for (const name of storeNames) {
      stores[name] = tx.objectStore(name);
    }
    try {
      work(stores);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // ignore
      }
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error(tx.error?.message ?? 'transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('transaction error'));
  });
}
