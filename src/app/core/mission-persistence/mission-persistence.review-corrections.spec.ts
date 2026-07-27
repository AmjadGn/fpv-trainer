import { describe, expect, it, vi } from 'vitest';

import {
  MISSION_PERSISTENCE_DIAGNOSTICS,
  buildMissionScopeKey,
  type MissionPersistencePort,
  type PersistedMissionResultRecord,
} from '@fpv/mission-persistence';
import { asMissionResultId, asMissionSessionId, createMissionResultRecord } from '@fpv/mission-domain';
import { asElapsedTicks } from '@fpv/simulation-contracts';

import { getCoastalRuinsSurveyMission } from '../../content/locations/mediterranean-expedition-region/missions/coastal-ruins-survey';
import { COASTAL_RUINS_PHOTO_OBJECTIVES } from '../../content/locations/mediterranean-expedition-region/missions/photography-objectives';
import { MissionPersistenceCoordinator } from './mission-persistence.coordinator';
import { buildPersistedMissionResult } from './build-persisted-mission-result';
import {
  createIndexedDbMissionPersistenceAdapter,
} from './indexed-db-mission-persistence.adapter';
import { createMemoryMissionPersistenceAdapter } from './memory-mission-persistence.adapter';
import {
  MissionPresentationSettlementRegistry,
} from '../mission/services/mission-presentation-image-settlement';

import 'fake-indexeddb/auto';

const MISSION = getCoastalRuinsSurveyMission();
const PHOTO_OBJECTIVES = COASTAL_RUINS_PHOTO_OBJECTIVES;
const REQUIRED_IDS =
  MISSION.grouping.mode === 'sequential' ? MISSION.grouping.requiredObjectiveIds : [];
const SCOPE = String(
  buildMissionScopeKey({
    missionId: String(MISSION.missionId),
    missionVersion: String(MISSION.versions.version),
    scoringPolicyVersion: '1.0.0',
  }),
);

function objectiveVersions(
  overrides?: ReadonlyMap<string, string> | Record<string, string>,
): ReadonlyMap<string, string> {
  if (overrides instanceof Map) {
    return overrides;
  }
  if (overrides) {
    return new Map(Object.entries(overrides));
  }
  const map = new Map<string, string>();
  for (const declared of MISSION.objectives) {
    if (declared.kind !== 'photography') {
      continue;
    }
    const photo = PHOTO_OBJECTIVES.find(
      (entry) => String(entry.objectiveId) === declared.photographyObjectiveId,
    );
    if (photo) {
      map.set(String(declared.objectiveId), photo.version);
    }
  }
  return map;
}

function sessionRecord(
  resultId: string,
  options: {
    readonly status?: 'completed' | 'failed';
    readonly scorePoints?: number;
    readonly elapsedTicks?: number;
  } = {},
) {
  const status = options.status ?? 'completed';
  const scorePoints = options.scorePoints ?? 28;
  const objectiveResults = REQUIRED_IDS.map((objectiveId) => ({
    objectiveId,
    status: status === 'completed' ? ('completed' as const) : ('incomplete' as const),
    scorePoints: status === 'completed' ? scorePoints : 0,
    maxPoints: 29,
    photographyEvaluationRef: `evidence-${String(objectiveId)}`,
  }));
  return createMissionResultRecord({
    resultId: asMissionResultId(resultId),
    missionId: MISSION.missionId,
    sessionId: asMissionSessionId(`session-${resultId}`),
    objectiveResults,
    requiredObjectiveIds: REQUIRED_IDS,
    scoreAggregationPolicy: MISSION.scoreAggregationPolicy,
    timePolicy: MISSION.timePolicy,
    elapsedTicks: asElapsedTicks(options.elapsedTicks ?? 1_000),
    ...(status === 'failed' ? { failureReasonCode: 'AIRCRAFT_CRASHED' as const } : {}),
  });
}

function baseRequest(
  resultId: string,
  extras: Partial<Parameters<MissionPersistenceCoordinator['saveSessionResult']>[0]> = {},
) {
  return {
    record: sessionRecord(resultId),
    mission: MISSION,
    scoringPolicyVersion: '1.0.0',
    sessionGeneration: 1,
    locationId: 'mediterranean-expedition-region',
    locationVersion: '1.0.0',
    evaluations: new Map(),
    attemptCounts: new Map(),
    fixedStepSeconds: 1 / 120,
    objectiveVersions: objectiveVersions(),
    aircraftId: 'factory-demo',
    aircraftSourceType: 'factory' as const,
    aircraftDefinitionVersion: '1.0.0',
    aircraftPhysicsProfileVersion: '1.0.0',
    aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
    presentationSettlement: null,
    ...extras,
  };
}

function jpegBlob(label: string): Blob {
  return new Blob([`jpeg-${label}`], { type: 'image/jpeg' });
}

describe('buildPersistedMissionResult review corrections', () => {
  it('marks images expected from evidence, not Blob presence', () => {
    const dto = buildPersistedMissionResult({
      record: sessionRecord('expected-images'),
      mission: MISSION,
      scoringPolicyVersion: '1.0.0',
      sessionGeneration: 1,
      locationId: 'mediterranean-expedition-region',
      locationVersion: '1.0.0',
      evaluations: new Map(),
      attemptCounts: new Map(),
      fixedStepSeconds: 1 / 120,
      objectiveVersions: objectiveVersions(),
      aircraftId: 'factory-demo',
      aircraftSourceType: 'factory',
      aircraftDefinitionVersion: '1.0.0',
      aircraftPhysicsProfileVersion: '1.0.0',
      aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
    });

    expect(dto.objectives).toHaveLength(3);
    for (const objective of dto.objectives) {
      expect(objective.acceptedImageExpected).toBe(true);
      expect(objective.acceptedImagePersisted).toBe(false);
      expect(objective.captureId).toBe(`evidence-${objective.objectiveId}`);
      expect(objective.objectiveVersion).toBe('1.0.0');
    }
    expect(dto.imageAvailability.every((entry) => entry.objectiveId)).toBe(true);
    expect(dto.aircraftPhysicsProfileVersion).toBe('1.0.0');
  });

  it('persists mixed authored objective versions', () => {
    const versions = new Map([
      [String(REQUIRED_IDS[0]), '1.0.0'],
      [String(REQUIRED_IDS[1]), '1.1.0'],
      [String(REQUIRED_IDS[2]), '2.0.0'],
    ]);
    const dto = buildPersistedMissionResult({
      record: sessionRecord('mixed-versions'),
      mission: MISSION,
      scoringPolicyVersion: '1.0.0',
      sessionGeneration: 1,
      locationId: 'mediterranean-expedition-region',
      locationVersion: '1.0.0',
      evaluations: new Map(),
      attemptCounts: new Map(),
      fixedStepSeconds: 1 / 120,
      objectiveVersions: versions,
      aircraftId: 'factory-demo',
      aircraftSourceType: 'factory',
      aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
    });
    expect(dto.objectives.map((o) => o.objectiveVersion)).toEqual([
      '1.0.0',
      '1.1.0',
      '2.0.0',
    ]);
  });

  it('does not hardcode objective versions when the map is empty', () => {
    const dto = buildPersistedMissionResult({
      record: sessionRecord('no-versions'),
      mission: MISSION,
      scoringPolicyVersion: '1.0.0',
      sessionGeneration: 1,
      locationId: 'mediterranean-expedition-region',
      locationVersion: '1.0.0',
      evaluations: new Map(),
      attemptCounts: new Map(),
      fixedStepSeconds: 1 / 120,
      objectiveVersions: new Map(),
    });
    expect(dto.objectives.every((o) => o.objectiveVersion === null)).toBe(true);
  });
});

describe('presentation settlement registry', () => {
  it('awaits late Blobs after result creation and retains them after UI revoke', async () => {
    const registry = new MissionPresentationSettlementRegistry();
    const objectiveIds = REQUIRED_IDS.map(String);
    for (const [index, objectiveId] of objectiveIds.entries()) {
      registry.beginTask({
        sessionGeneration: 3,
        objectiveId,
        captureId: `cap-${index}`,
      });
    }

    const settlement = registry.createSettlement({
      sessionId: 'session-late',
      sessionGeneration: 3,
      resultId: 'result-late',
      expectedObjectiveIds: objectiveIds,
    });

    // Final objective still rendering after setResult.
    const lateComplete = Promise.resolve().then(() => {
      for (const [index, objectiveId] of objectiveIds.entries()) {
        registry.completeTask({
          sessionGeneration: 3,
          objectiveId,
          captureId: `cap-${index}`,
          status: 'available',
          blob: jpegBlob(objectiveId),
          mimeType: 'image/jpeg',
          byteLength: jpegBlob(objectiveId).size,
        });
      }
    });

    const settled = await settlement.waitForSettled();
    await lateComplete;
    expect(settled).toHaveLength(3);
    expect(settled.every((entry) => entry.status === 'available' && entry.blob)).toBe(true);
    settlement.release();
  });

  it('resolves presentation timeout as failed with a stable diagnostic', async () => {
    vi.useFakeTimers();
    const registry = new MissionPresentationSettlementRegistry();
    registry.beginTask({
      sessionGeneration: 1,
      objectiveId: 'obj-a',
      captureId: 'cap-a',
      timeoutMs: 50,
    });
    const settlement = registry.createSettlement({
      sessionId: 's',
      sessionGeneration: 1,
      resultId: 'r',
      expectedObjectiveIds: ['obj-a'],
    });
    const pending = settlement.waitForSettled();
    await vi.advanceTimersByTimeAsync(50);
    const settled = await pending;
    expect(settled[0]?.status).toBe('failed');
    expect(settled[0]?.diagnosticCode).toBe('PHOTO_PRESENTATION_SETTLEMENT_TIMEOUT');
    settlement.release();
    vi.useRealTimers();
  });
});

describe('MissionPersistenceCoordinator save recovery', () => {
  it('dedupes concurrent in-flight saves and keeps successful saves idempotent', async () => {
    let writes = 0;
    let resolveWrite!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const port: MissionPersistencePort = {
      async open() {
        return { ok: true, storageMode: 'memory' };
      },
      storageMode: () => 'memory',
      async saveMissionResult(result) {
        writes += 1;
        await gate;
        return {
          ok: true,
          resultId: result.resultId,
          becamePersonalBest: false,
          duplicate: writes > 1,
          summary: null,
        };
      },
      async getMissionSummary() {
        return { ok: true, summary: null };
      },
      async getPersonalBest() {
        return { ok: true, result: null };
      },
      async listRecentResults() {
        return { ok: true, results: [], invalidCount: 0 };
      },
      async saveBestImages() {
        return { ok: true, status: 'none', storedObjectiveIds: [] };
      },
      async getBestImages() {
        return { ok: true, images: [] };
      },
      async clearMissionScope() {
        return { ok: true };
      },
      async clearAllMissionData() {
        return { ok: true };
      },
      async close() {},
    };

    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(port);
    await coordinator.ensureReady();
    const request = baseRequest('inflight:result');
    const first = coordinator.saveSessionResult(request);
    const second = coordinator.saveSessionResult(request);
    resolveWrite();
    await Promise.all([first, second]);
    expect(writes).toBe(1);
    await coordinator.saveSessionResult(request);
    expect(writes).toBe(1);
  });

  it('allows retry of a failed write with the same result ID', async () => {
    let attempts = 0;
    const savedIds: string[] = [];
    const port: MissionPersistencePort = {
      async open() {
        return { ok: true, storageMode: 'indexeddb' };
      },
      storageMode: () => 'indexeddb',
      async saveMissionResult(result) {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: false,
            resultId: result.resultId,
            becamePersonalBest: false,
            duplicate: false,
            summary: null,
            diagnostic: {
              code: MISSION_PERSISTENCE_DIAGNOSTICS.QUOTA_EXCEEDED,
              message: 'quota',
            },
          };
        }
        savedIds.push(result.resultId);
        return {
          ok: true,
          resultId: result.resultId,
          becamePersonalBest: false,
          duplicate: false,
          summary: null,
        };
      },
      async getMissionSummary() {
        return { ok: true, summary: null };
      },
      async getPersonalBest() {
        return { ok: true, result: null };
      },
      async listRecentResults() {
        return { ok: true, results: [], invalidCount: 0 };
      },
      async saveBestImages() {
        return { ok: true, status: 'none', storedObjectiveIds: [] };
      },
      async getBestImages() {
        return { ok: true, images: [] };
      },
      async clearMissionScope() {
        return { ok: true };
      },
      async clearAllMissionData() {
        return { ok: true };
      },
      async close() {},
    };

    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(port);
    await coordinator.ensureReady();
    const request = baseRequest('retry:same-id');
    await coordinator.saveSessionResult(request);
    expect(coordinator.saveStatus()).toBe('save-failed');
    await coordinator.retryLastFailedSave();
    expect(attempts).toBe(2);
    expect(savedIds).toEqual([String(request.record.resultId)]);
    expect(coordinator.saveStatus()).toBe('saved');
  });

  it('treats idempotent duplicate adapter responses as saved', async () => {
    const port: MissionPersistencePort = {
      async open() {
        return { ok: true, storageMode: 'indexeddb' };
      },
      storageMode: () => 'indexeddb',
      async saveMissionResult(result) {
        return {
          ok: true,
          resultId: result.resultId,
          becamePersonalBest: false,
          duplicate: true,
          summary: null,
        };
      },
      async getMissionSummary() {
        return { ok: true, summary: null };
      },
      async getPersonalBest() {
        return { ok: true, result: null };
      },
      async listRecentResults() {
        return { ok: true, results: [], invalidCount: 0 };
      },
      async saveBestImages() {
        return { ok: true, status: 'none', storedObjectiveIds: [] };
      },
      async getBestImages() {
        return { ok: true, images: [] };
      },
      async clearMissionScope() {
        return { ok: true };
      },
      async clearAllMissionData() {
        return { ok: true };
      },
      async close() {},
    };
    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(port);
    await coordinator.ensureReady();
    await coordinator.saveSessionResult(baseRequest('dup:ok'));
    expect(coordinator.saveStatus()).toBe('saved');
  });

  it('reports images-pending before settlement completes on durable storage', async () => {
    let resolveImages!: () => void;
    const imagesGate = new Promise<void>((resolve) => {
      resolveImages = resolve;
    });
    const registry = new MissionPresentationSettlementRegistry();
    const objectiveIds = REQUIRED_IDS.map(String);
    for (const objectiveId of objectiveIds) {
      registry.beginTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `cap-${objectiveId}`,
      });
    }
    const settlement = registry.createSettlement({
      sessionId: 'session-pending-ui',
      sessionGeneration: 1,
      resultId: 'pb-pending-ui',
      expectedObjectiveIds: objectiveIds,
    });

    const port: MissionPersistencePort = {
      async open() {
        return { ok: true, storageMode: 'indexeddb' };
      },
      storageMode: () => 'indexeddb',
      async saveMissionResult(result) {
        return {
          ok: true,
          resultId: result.resultId,
          becamePersonalBest: true,
          duplicate: false,
          summary: null,
        };
      },
      async getMissionSummary() {
        return { ok: true, summary: null };
      },
      async getPersonalBest() {
        return { ok: true, result: null };
      },
      async listRecentResults() {
        return { ok: true, results: [], invalidCount: 0 };
      },
      async saveBestImages() {
        await imagesGate;
        return { ok: true, status: 'complete', storedObjectiveIds: [...objectiveIds] };
      },
      async getBestImages() {
        return { ok: true, images: [] };
      },
      async clearMissionScope() {
        return { ok: true };
      },
      async clearAllMissionData() {
        return { ok: true };
      },
      async close() {},
    };

    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(port);
    await coordinator.ensureReady();

    const savePromise = coordinator.saveSessionResult(
      baseRequest('pb-pending-ui', { presentationSettlement: settlement }),
    );
    await vi.waitFor(() => {
      expect(coordinator.saveStatus()).toBe('saved-new-personal-best-images-pending');
    });
    for (const objectiveId of objectiveIds) {
      registry.completeTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `cap-${objectiveId}`,
        status: 'available',
        blob: jpegBlob(objectiveId),
        mimeType: 'image/jpeg',
        byteLength: jpegBlob(objectiveId).size,
      });
    }
    resolveImages();
    await savePromise;
    expect(coordinator.saveStatus()).toBe('saved-new-personal-best');
  });

  it('awaits settlement for Personal Best images after core save', async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(memory);
    await coordinator.ensureReady();

    const registry = new MissionPresentationSettlementRegistry();
    const objectiveIds = REQUIRED_IDS.map(String);
    for (const objectiveId of objectiveIds) {
      registry.beginTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `cap-${objectiveId}`,
      });
    }
    const settlement = registry.createSettlement({
      sessionId: 'session-pb',
      sessionGeneration: 1,
      resultId: 'pb-settlement',
      expectedObjectiveIds: objectiveIds,
    });

    const savePromise = coordinator.saveSessionResult(
      baseRequest('pb-settlement', { presentationSettlement: settlement }),
    );

    await vi.waitFor(() => {
      expect(coordinator.becamePersonalBest()).toBe(true);
    });
    // Memory mode reports memory-only; IndexedDB would show images-pending.
    expect(coordinator.saveStatus()).toMatch(
      /saved-new-personal-best-images-pending|memory-only/,
    );

    for (const objectiveId of objectiveIds) {
      registry.completeTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `cap-${objectiveId}`,
        status: 'available',
        blob: jpegBlob(objectiveId),
        mimeType: 'image/jpeg',
        byteLength: jpegBlob(objectiveId).size,
      });
    }

    await savePromise;
    const images = await memory.getBestImages(SCOPE, 'pb-settlement');
    expect(images.images).toHaveLength(3);
    expect(coordinator.saveStatus()).toMatch(/saved-new-personal-best|memory-only/);
  });

  it('marks partial when the final settled image fails', async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(memory);
    await coordinator.ensureReady();

    const registry = new MissionPresentationSettlementRegistry();
    const objectiveIds = REQUIRED_IDS.map(String);
    for (const [index, objectiveId] of objectiveIds.entries()) {
      registry.beginTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `cap-${objectiveId}`,
      });
      if (index < 2) {
        registry.completeTask({
          sessionGeneration: 1,
          objectiveId,
          captureId: `cap-${objectiveId}`,
          status: 'available',
          blob: jpegBlob(objectiveId),
          mimeType: 'image/jpeg',
          byteLength: jpegBlob(objectiveId).size,
        });
      } else {
        registry.completeTask({
          sessionGeneration: 1,
          objectiveId,
          captureId: `cap-${objectiveId}`,
          status: 'failed',
          blob: null,
          mimeType: null,
          byteLength: 0,
          diagnosticCode: 'PHOTO_PRESENTATION_CAPTURE_FAILED',
        });
      }
    }
    const settlement = registry.createSettlement({
      sessionId: 'session-partial',
      sessionGeneration: 1,
      resultId: 'pb-partial',
      expectedObjectiveIds: objectiveIds,
    });

    await coordinator.saveSessionResult(
      baseRequest('pb-partial', { presentationSettlement: settlement }),
    );
    const summary = await memory.getMissionSummary(SCOPE);
    expect(summary.summary?.personalBestImageStatus).toBe('partial');
    const images = await memory.getBestImages(SCOPE, 'pb-partial');
    expect(images.images).toHaveLength(2);
  });

  it('rejects older pending images when a newer Personal Best supersedes', async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(memory);
    await coordinator.ensureReady();

    const registry = new MissionPresentationSettlementRegistry();
    const objectiveIds = REQUIRED_IDS.map(String);
    for (const objectiveId of objectiveIds) {
      registry.beginTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `a-${objectiveId}`,
      });
    }
    const settlementA = registry.createSettlement({
      sessionId: 'session-a',
      sessionGeneration: 1,
      resultId: 'pb-a',
      expectedObjectiveIds: objectiveIds,
    });

    const saveA = coordinator.saveSessionResult(
      baseRequest('pb-a', {
        record: sessionRecord('pb-a', { scorePoints: 20 }),
        presentationSettlement: settlementA,
      }),
    );

    await vi.waitFor(() => expect(coordinator.becamePersonalBest()).toBe(true));

    // Newer better PB arrives before A images settle.
    await coordinator.saveSessionResult(
      baseRequest('pb-b', {
        record: sessionRecord('pb-b', { scorePoints: 28 }),
        presentationSettlement: null,
      }),
    );

    for (const objectiveId of objectiveIds) {
      registry.completeTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `a-${objectiveId}`,
        status: 'available',
        blob: jpegBlob(`old-${objectiveId}`),
        mimeType: 'image/jpeg',
        byteLength: jpegBlob(`old-${objectiveId}`).size,
      });
    }
    await saveA;

    const summary = await memory.getMissionSummary(SCOPE);
    expect(summary.summary?.personalBestResultId).toBe('pb-b');
    const stale = await memory.getBestImages(SCOPE, 'pb-a');
    expect(stale.images).toHaveLength(0);
    const current = await memory.getBestImages(SCOPE, 'pb-b');
    expect(current.images).toHaveLength(0);
  });

  it('continues persistence after invalidatePendingUi (retry/exit)', async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(memory);
    await coordinator.ensureReady();

    const registry = new MissionPresentationSettlementRegistry();
    const objectiveIds = REQUIRED_IDS.map(String);
    for (const objectiveId of objectiveIds) {
      registry.beginTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `cap-${objectiveId}`,
      });
    }
    const settlement = registry.createSettlement({
      sessionId: 'session-exit',
      sessionGeneration: 1,
      resultId: 'pb-exit',
      expectedObjectiveIds: objectiveIds,
    });

    const savePromise = coordinator.saveSessionResult(
      baseRequest('pb-exit', { presentationSettlement: settlement }),
    );
    await vi.waitFor(() => expect(coordinator.becamePersonalBest()).toBe(true));
    coordinator.invalidatePendingUi();
    coordinator.resetSaveStatus();

    for (const objectiveId of objectiveIds) {
      registry.completeTask({
        sessionGeneration: 1,
        objectiveId,
        captureId: `cap-${objectiveId}`,
        status: 'available',
        blob: jpegBlob(objectiveId),
        mimeType: 'image/jpeg',
        byteLength: jpegBlob(objectiveId).size,
      });
    }
    await savePromise;

    const listed = await memory.listRecentResults(SCOPE);
    expect(listed.results.some((r) => r.resultId === 'pb-exit')).toBe(true);
    const images = await memory.getBestImages(SCOPE, 'pb-exit');
    expect(images.images).toHaveLength(3);
  });
});

describe('atomic Personal Best image replacement', () => {
  it('memory adapter restores prior images when mutation fails', async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    await memory.open();
    await memory.saveMissionResult(
      buildPersistedMissionResult({
        record: sessionRecord('mem-pb1', { scorePoints: 20 }),
        mission: MISSION,
        scoringPolicyVersion: '1.0.0',
        sessionGeneration: 1,
        locationId: 'mediterranean-expedition-region',
        locationVersion: '1.0.0',
        evaluations: new Map(),
        attemptCounts: new Map(),
        fixedStepSeconds: 1 / 120,
        objectiveVersions: objectiveVersions(),
        aircraftId: 'factory-demo',
        aircraftSourceType: 'factory',
        aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
      }),
    );

    const firstPayload = {
      objectiveId: String(REQUIRED_IDS[0]),
      mimeType: 'image/jpeg',
      byteLength: 4,
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    };
    await memory.saveBestImages(SCOPE, 'mem-pb1', [firstPayload], [firstPayload.objectiveId]);

    await memory.saveMissionResult(
      buildPersistedMissionResult({
        record: sessionRecord('mem-pb2', { scorePoints: 28 }),
        mission: MISSION,
        scoringPolicyVersion: '1.0.0',
        sessionGeneration: 2,
        locationId: 'mediterranean-expedition-region',
        locationVersion: '1.0.0',
        evaluations: new Map(),
        attemptCounts: new Map(),
        fixedStepSeconds: 1 / 120,
        objectiveVersions: objectiveVersions(),
        aircraftId: 'factory-demo',
        aircraftSourceType: 'factory',
        aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
      }),
    );

    memory.failNextImageWriteForTests = true;
    const failed = await memory.saveBestImages(
      SCOPE,
      'mem-pb2',
      [
        {
          objectiveId: String(REQUIRED_IDS[0]),
          mimeType: 'image/jpeg',
          byteLength: 4,
          data: new Uint8Array([9, 9, 9, 9]).buffer,
        },
      ],
      [String(REQUIRED_IDS[0])],
    );
    expect(failed.ok).toBe(false);
    expect(failed.status).toBe('failed');

    const summary = await memory.getMissionSummary(SCOPE);
    expect(summary.summary?.personalBestResultId).toBe('mem-pb2');
    expect(summary.summary?.personalBestImageStatus).toBe('failed');
    // Old PB rows must never display for the new PB.
    const forNew = await memory.getBestImages(SCOPE, 'mem-pb2');
    expect(forNew.images).toHaveLength(0);
    const forOld = await memory.getBestImages(SCOPE, 'mem-pb1');
    expect(forOld.images).toHaveLength(0);
  });

  it('IndexedDB abort preserves prior transaction state and rejects stale rows', async () => {
    const dbName = 'fpv-missions-v1-atomic-abort';
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });

    const adapter = createIndexedDbMissionPersistenceAdapter({ dbName });
    await adapter.open();
    await adapter.saveMissionResult(
      buildPersistedMissionResult({
        record: sessionRecord('idb-pb1', { scorePoints: 20 }),
        mission: MISSION,
        scoringPolicyVersion: '1.0.0',
        sessionGeneration: 1,
        locationId: 'mediterranean-expedition-region',
        locationVersion: '1.0.0',
        evaluations: new Map(),
        attemptCounts: new Map(),
        fixedStepSeconds: 1 / 120,
        objectiveVersions: objectiveVersions(),
        aircraftId: 'factory-demo',
        aircraftSourceType: 'factory',
        aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
      }),
    );
    const objectiveId = String(REQUIRED_IDS[0]);
    await adapter.saveBestImages(
      SCOPE,
      'idb-pb1',
      [
        {
          objectiveId,
          mimeType: 'image/jpeg',
          byteLength: 3,
          data: new Uint8Array([1, 2, 3]).buffer,
        },
      ],
      [objectiveId],
    );

    await adapter.saveMissionResult(
      buildPersistedMissionResult({
        record: sessionRecord('idb-pb2', { scorePoints: 28 }),
        mission: MISSION,
        scoringPolicyVersion: '1.0.0',
        sessionGeneration: 2,
        locationId: 'mediterranean-expedition-region',
        locationVersion: '1.0.0',
        evaluations: new Map(),
        attemptCounts: new Map(),
        fixedStepSeconds: 1 / 120,
        objectiveVersions: objectiveVersions(),
        aircraftId: 'factory-demo',
        aircraftSourceType: 'factory',
        aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
      }),
    );

    adapter.abortNextImageTransactionForTests = true;
    const aborted = await adapter.saveBestImages(
      SCOPE,
      'idb-pb2',
      [
        {
          objectiveId,
          mimeType: 'image/jpeg',
          byteLength: 3,
          data: new Uint8Array([7, 7, 7]).buffer,
        },
      ],
      [objectiveId],
    );
    expect(aborted.ok).toBe(false);
    expect([
      MISSION_PERSISTENCE_DIAGNOSTICS.TRANSACTION_ABORTED,
      MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
    ]).toContain(aborted.diagnostic?.code);

    const summary = await adapter.getMissionSummary(SCOPE);
    expect(summary.summary?.personalBestResultId).toBe('idb-pb2');
    expect(summary.summary?.personalBestImageStatus).toBe('failed');
    const forNew = await adapter.getBestImages(SCOPE, 'idb-pb2');
    expect(forNew.images).toHaveLength(0);

    await adapter.close();
  });
});

describe('aircraft metadata wiring helpers', () => {
  it('persists factory and compiled aircraft fields from trusted context', () => {
    for (const source of ['factory', 'user-compiled'] as const) {
      const dto = buildPersistedMissionResult({
        record: sessionRecord(`aircraft-${source}`),
        mission: MISSION,
        scoringPolicyVersion: '1.0.0',
        sessionGeneration: 1,
        locationId: 'mediterranean-expedition-region',
        locationVersion: '1.0.0',
        evaluations: new Map(),
        attemptCounts: new Map(),
        fixedStepSeconds: 1 / 120,
        objectiveVersions: objectiveVersions(),
        aircraftId: `craft-${source}`,
        aircraftSourceType: source,
        aircraftDefinitionVersion: 'def-1',
        aircraftPhysicsProfileVersion: 'phys-1',
        aircraftRuntimeCompatibilityVersion: '1.3.0-runtime-c3',
      });
      expect(dto.aircraftId).toBe(`craft-${source}`);
      expect(dto.aircraftSourceType).toBe(source);
      expect(dto.aircraftDefinitionVersion).toBe('def-1');
      expect(dto.aircraftPhysicsProfileVersion).toBe('phys-1');
      expect(dto.aircraftRuntimeCompatibilityVersion).toBe('1.3.0-runtime-c3');
    }
  });
});

void vi;
