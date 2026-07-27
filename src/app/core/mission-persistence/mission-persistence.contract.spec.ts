import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  MISSION_RESULTS_RETENTION_LIMIT,
  buildMissionScopeKey,
  type PersistedMissionResultRecord,
} from '@fpv/mission-persistence';

import {
  MISSIONS_IDB_NAME,
  MISSIONS_IDB_STORES,
  createIndexedDbMissionPersistenceAdapter,
} from './indexed-db-mission-persistence.adapter';
import { createMemoryMissionPersistenceAdapter } from './memory-mission-persistence.adapter';

const SCOPE = String(
  buildMissionScopeKey({
    missionId: 'coastal-ruins-survey',
    missionVersion: '1.0.0',
    scoringPolicyVersion: '1.0.0',
  }),
);

function makeResult(
  overrides: Partial<PersistedMissionResultRecord> &
    Pick<PersistedMissionResultRecord, 'resultId' | 'totalScore' | 'status'>,
): PersistedMissionResultRecord {
  return {
    persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
    missionScopeKey: SCOPE,
    missionId: 'coastal-ruins-survey',
    missionVersion: '1.0.0',
    scoringPolicyVersion: '1.0.0',
    evidenceSchemaVersion: '2.0.0',
    sessionId: 'session-1',
    sessionGeneration: 1,
    locationId: 'mediterranean-expedition-region',
    locationVersion: '1.0.0',
    aircraftId: 'factory-demo',
    aircraftSourceType: 'factory',
    aircraftDefinitionVersion: '1.0.0',
    aircraftPhysicsProfileVersion: '1.0.0',
    aircraftRuntimeCompatibilityVersion: '1.0.0',
    failureReasonCode: null,
    maximumScore: 100,
    normalizedScore: overrides.totalScore / 100,
    requiredObjectiveSubtotal: overrides.requiredObjectiveSubtotal ?? overrides.totalScore,
    timeBonusPoints: 0,
    elapsedTicks: overrides.elapsedTicks ?? 1_000,
    fixedStepSeconds: 1 / 120,
    objectives: [
      {
        objectiveId: 'obj-photo-arch',
        objectiveVersion: '1.0.0',
        status: overrides.status === 'completed' ? 'completed' : 'incomplete',
        scorePoints: overrides.totalScore,
        maxPoints: 100,
        normalizedPhotographyScore: 1,
        attemptCount: 1,
        captureId: 'cap-1',
        evidenceRef: 'ev-1',
        feedbackCodes: [],
        acceptedImageExpected: overrides.status === 'completed',
        acceptedImagePersisted: false,
      },
    ],
    attemptCountTotal: 1,
    imageAvailability: [
      {
        objectiveId: 'obj-photo-arch',
        acceptedImageExpected: overrides.status === 'completed',
        acceptedImagePersisted: false,
        captureId: 'cap-1',
        evidenceRef: 'ev-1',
      },
    ],
    savedAt: {
      savedAtEpochMs: overrides.savedAt?.savedAtEpochMs ?? Date.now(),
      savedAtIso: overrides.savedAt?.savedAtIso ?? new Date().toISOString(),
    },
    ...overrides,
  };
}

async function deleteDb(name = MISSIONS_IDB_NAME): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('IndexedDbMissionPersistenceAdapter', () => {
  const dbName = `${MISSIONS_IDB_NAME}-test`;

  beforeEach(async () => {
    await deleteDb(dbName);
  });

  afterEach(async () => {
    await deleteDb(dbName);
  });

  it('creates stores and indexes, then reopens', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    const opened = await adapter.open();
    expect(opened.ok).toBe(true);
    expect(opened.storageMode).toBe('indexeddb');

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect([...db.objectStoreNames].sort()).toEqual(
      [
        MISSIONS_IDB_STORES.bestImages,
        MISSIONS_IDB_STORES.metadata,
        MISSIONS_IDB_STORES.missionSummaries,
        MISSIONS_IDB_STORES.results,
      ].sort(),
    );
    const tx = db.transaction(MISSIONS_IDB_STORES.results, 'readonly');
    const store = tx.objectStore(MISSIONS_IDB_STORES.results);
    expect(store.indexNames.contains('missionScopeKey')).toBe(true);
    expect(store.indexNames.contains('savedAtEpochMs')).toBe(true);
    db.close();

    await adapter.close();
    const again = createIndexedDbMissionPersistenceAdapter({ dbName });
    const reopened = await again.open();
    expect(reopened.ok).toBe(true);
    await again.close();
  });

  it('atomically saves result and summary; duplicate is idempotent', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    const result = makeResult({ resultId: 'r1', totalScore: 70, status: 'completed' });
    const first = await adapter.saveMissionResult(result);
    expect(first.ok).toBe(true);
    expect(first.becamePersonalBest).toBe(true);
    expect(first.duplicate).toBe(false);

    const duplicate = await adapter.saveMissionResult(result);
    expect(duplicate.ok).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.becamePersonalBest).toBe(false);

    const summary = await adapter.getMissionSummary(SCOPE);
    expect(summary.summary?.totalAttemptCount).toBe(1);
    expect(summary.summary?.personalBestResultId).toBe('r1');
    await adapter.close();
  });

  it('keeps failed results in history but never as Personal Best', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    await adapter.saveMissionResult(
      makeResult({ resultId: 'fail', totalScore: 99, status: 'failed' }),
    );
    const pb = await adapter.getPersonalBest(SCOPE);
    expect(pb.result).toBeNull();
    const recent = await adapter.listRecentResults(SCOPE);
    expect(recent.results).toHaveLength(1);
    expect(recent.results[0]?.status).toBe('failed');
    await adapter.close();
  });

  it('isolates mission scopes and pins Personal Best under retention', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    await adapter.saveMissionResult(
      makeResult({
        resultId: 'best',
        totalScore: 90,
        status: 'completed',
        savedAt: { savedAtEpochMs: 1, savedAtIso: '2026-01-01T00:00:00.000Z' },
      }),
    );
    for (let i = 0; i < MISSION_RESULTS_RETENTION_LIMIT + 2; i += 1) {
      await adapter.saveMissionResult(
        makeResult({
          resultId: `later-${i}`,
          totalScore: 10,
          status: 'completed',
          savedAt: {
            savedAtEpochMs: 100 + i,
            savedAtIso: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
          },
        }),
      );
    }
    const pb = await adapter.getPersonalBest(SCOPE);
    expect(pb.result?.resultId).toBe('best');
    const recent = await adapter.listRecentResults(SCOPE, 100);
    expect(recent.results.some((r) => r.resultId === 'best')).toBe(true);
    expect(recent.results.length).toBeLessThanOrEqual(MISSION_RESULTS_RETENTION_LIMIT + 1);

    const otherScope = String(
      buildMissionScopeKey({
        missionId: 'other-mission',
        missionVersion: '1.0.0',
        scoringPolicyVersion: '1.0.0',
      }),
    );
    await adapter.saveMissionResult(
      makeResult({
        resultId: 'other-1',
        totalScore: 50,
        status: 'completed',
        missionScopeKey: otherScope,
        missionId: 'other-mission',
      }),
    );
    const coastal = await adapter.listRecentResults(SCOPE, 100);
    expect(coastal.results.every((r) => String(r.missionScopeKey) === SCOPE)).toBe(true);
    await adapter.close();
  });

  it('persists Personal Best images only and cleans on replacement', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    await adapter.saveMissionResult(
      makeResult({ resultId: 'pb1', totalScore: 40, status: 'completed' }),
    );
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const firstImages = await adapter.saveBestImages(
      SCOPE,
      'pb1',
      [
        {
          objectiveId: 'obj-photo-arch',
          mimeType: 'image/jpeg',
          byteLength: 4,
          data: bytes,
        },
      ],
      ['obj-photo-arch'],
    );
    expect(firstImages.status).toBe('complete');

    await adapter.saveMissionResult(
      makeResult({ resultId: 'pb2', totalScore: 80, status: 'completed' }),
    );
    const replaced = await adapter.saveBestImages(
      SCOPE,
      'pb2',
      [
        {
          objectiveId: 'obj-photo-arch',
          mimeType: 'image/jpeg',
          byteLength: 4,
          data: bytes,
        },
      ],
      ['obj-photo-arch'],
    );
    expect(replaced.status).toBe('complete');
    const oldImages = await adapter.getBestImages(SCOPE, 'pb1');
    expect(oldImages.images).toHaveLength(0);
    const newImages = await adapter.getBestImages(SCOPE, 'pb2');
    expect(newImages.images).toHaveLength(1);

    // Non-best cannot store images.
    await adapter.saveMissionResult(
      makeResult({ resultId: 'worse', totalScore: 10, status: 'completed' }),
    );
    const rejected = await adapter.saveBestImages(
      SCOPE,
      'worse',
      [
        {
          objectiveId: 'obj-photo-arch',
          mimeType: 'image/jpeg',
          byteLength: 4,
          data: bytes,
        },
      ],
      ['obj-photo-arch'],
    );
    expect(rejected.ok).toBe(false);
    await adapter.close();
  });

  it('rejects oversized images without invalidating the result', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    await adapter.saveMissionResult(
      makeResult({ resultId: 'pb', totalScore: 50, status: 'completed' }),
    );
    const huge = new ArrayBuffer(9 * 1024 * 1024);
    const outcome = await adapter.saveBestImages(
      SCOPE,
      'pb',
      [
        {
          objectiveId: 'obj-photo-arch',
          mimeType: 'image/jpeg',
          byteLength: huge.byteLength,
          data: huge,
        },
      ],
      ['obj-photo-arch'],
    );
    expect(outcome.status).toBe('failed');
    const pb = await adapter.getPersonalBest(SCOPE);
    expect(pb.result?.resultId).toBe('pb');
    await adapter.close();
  });

  it('clears scope and all data', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    await adapter.saveMissionResult(
      makeResult({ resultId: 'r1', totalScore: 30, status: 'completed' }),
    );
    await adapter.clearMissionScope(SCOPE);
    expect((await adapter.listRecentResults(SCOPE)).results).toHaveLength(0);
    expect((await adapter.getMissionSummary(SCOPE)).summary).toBeNull();

    await adapter.saveMissionResult(
      makeResult({ resultId: 'r2', totalScore: 30, status: 'completed' }),
    );
    await adapter.clearAllMissionData();
    expect((await adapter.listRecentResults(SCOPE)).results).toHaveLength(0);
    await adapter.close();
  });

  it('ignores corrupt records on read', async () => {
    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    await adapter.saveMissionResult(
      makeResult({ resultId: 'good', totalScore: 20, status: 'completed' }),
    );
    // Inject corrupt row directly.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MISSIONS_IDB_STORES.results, 'readwrite');
      tx.objectStore(MISSIONS_IDB_STORES.results).put({
        resultId: 'corrupt',
        missionScopeKey: SCOPE,
        persistenceSchemaVersion: '0.0.0',
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const listed = await adapter.listRecentResults(SCOPE, 20);
    expect(listed.results.every((r) => r.resultId !== 'corrupt')).toBe(true);
    expect(listed.invalidCount).toBeGreaterThanOrEqual(1);
    await adapter.close();
  });
});

describe('MemoryMissionPersistenceAdapter', () => {
  it('follows the same Personal Best and retention contract', async () => {
    const adapter = createMemoryMissionPersistenceAdapter();
    const opened = await adapter.open();
    expect(opened.storageMode).toBe('memory');
    expect(opened.diagnostic?.code).toBe('MISSION_PERSISTENCE_FALLBACK_MEMORY');

    await adapter.saveMissionResult(
      makeResult({ resultId: 'm1', totalScore: 55, status: 'completed' }),
    );
    await adapter.saveMissionResult(
      makeResult({ resultId: 'm2', totalScore: 40, status: 'completed' }),
    );
    const pb = await adapter.getPersonalBest(SCOPE);
    expect(pb.result?.resultId).toBe('m1');
    await adapter.clearAllMissionData();
    expect((await adapter.listRecentResults(SCOPE)).results).toHaveLength(0);
    await adapter.close();
  });
});
