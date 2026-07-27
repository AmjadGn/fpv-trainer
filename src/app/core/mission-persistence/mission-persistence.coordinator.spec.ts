import { describe, expect, it, vi } from 'vitest';

import {
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  buildMissionScopeKey,
  type MissionPersistencePort,
  type PersistedMissionResultRecord,
} from '@fpv/mission-persistence';
import { asMissionResultId, asMissionSessionId, createMissionResultRecord } from '@fpv/mission-domain';
import { asElapsedTicks } from '@fpv/simulation-contracts';

import { getCoastalRuinsSurveyMission } from '../../content/locations/mediterranean-expedition-region/missions/coastal-ruins-survey';
import { MissionPersistenceCoordinator } from './mission-persistence.coordinator';
import { createMemoryMissionPersistenceAdapter } from './memory-mission-persistence.adapter';

const MISSION = getCoastalRuinsSurveyMission();
const REQUIRED_IDS =
  MISSION.grouping.mode === 'sequential' ? MISSION.grouping.requiredObjectiveIds : [];

function sessionRecord(resultId: string, status: 'completed' | 'failed' = 'completed') {
  const objectiveResults = REQUIRED_IDS.map((objectiveId) => ({
    objectiveId,
    status: status === 'completed' ? ('completed' as const) : ('incomplete' as const),
    scorePoints: status === 'completed' ? 28 : 0,
    maxPoints: 29,
    photographyEvaluationRef: `evidence-${String(objectiveId)}`,
  }));
  return createMissionResultRecord({
    resultId: asMissionResultId(resultId),
    missionId: MISSION.missionId,
    sessionId: asMissionSessionId('session-coord'),
    objectiveResults,
    requiredObjectiveIds: REQUIRED_IDS,
    scoreAggregationPolicy: MISSION.scoreAggregationPolicy,
    timePolicy: MISSION.timePolicy,
    elapsedTicks: asElapsedTicks(1_000),
    ...(status === 'failed' ? { failureReasonCode: 'AIRCRAFT_CRASHED' as const } : {}),
  });
}

describe('MissionPersistenceCoordinator', () => {
  it('saves a result once and ignores duplicate renders', async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(memory);
    await coordinator.ensureReady();

    const record = sessionRecord('session-coord:result');
    const request = {
      record,
      mission: MISSION,
      scoringPolicyVersion: '1.0.0',
      sessionGeneration: 1,
      locationId: 'mediterranean-expedition-region',
      locationVersion: '1.0.0',
      evaluations: new Map(),
      attemptCounts: new Map(),
      fixedStepSeconds: 1 / 120,
      presentationImages: [],
    };

    await coordinator.saveSessionResult(request);
    await coordinator.saveSessionResult(request);

    const listed = await memory.listRecentResults(
      String(
        buildMissionScopeKey({
          missionId: String(MISSION.missionId),
          missionVersion: String(MISSION.versions.version),
          scoringPolicyVersion: '1.0.0',
        }),
      ),
    );
    expect(listed.results).toHaveLength(1);
    expect(coordinator.saveStatus()).toMatch(/saved|memory-only|attempt-saved|saved-new-personal-best/);
  });

  it('rejects stale callbacks after invalidatePending', async () => {
    let resolveSave!: (value: unknown) => void;
    const deferred = new Promise((resolve) => {
      resolveSave = resolve;
    });
    const slowPort: MissionPersistencePort = {
      async open() {
        return { ok: true, storageMode: 'memory' };
      },
      storageMode: () => 'memory',
      async saveMissionResult(result: PersistedMissionResultRecord) {
        await deferred;
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
    coordinator.usePortForTests(slowPort);
    await coordinator.ensureReady();

    const pending = coordinator.saveSessionResult({
      record: sessionRecord('slow:result'),
      mission: MISSION,
      scoringPolicyVersion: '1.0.0',
      sessionGeneration: 1,
      locationId: 'mediterranean-expedition-region',
      locationVersion: '1.0.0',
      evaluations: new Map(),
      attemptCounts: new Map(),
      fixedStepSeconds: 1 / 120,
      presentationImages: [],
    });
    await vi.waitFor(() => {
      expect(coordinator.saveStatus()).toBe('saving');
    });
    coordinator.invalidatePending();
    resolveSave(undefined);
    await pending;
    // Stale completion must not force a newer "saved" UI state after invalidate.
    expect(coordinator.saveStatus()).toBe('saving');
  });

  it('reports memory fallback truthfully', async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(memory);
    await coordinator.ensureReady();
    expect(coordinator.storageMode()).toBe('memory');
    expect(coordinator.isMemoryOnly()).toBe(true);
    expect(coordinator.diagnostic()?.code).toBe('MISSION_PERSISTENCE_FALLBACK_MEMORY');
  });
});

describe('schema constant lock', () => {
  it('keeps persistence schema at 1.0.0', () => {
    expect(MISSION_PERSISTENCE_SCHEMA_VERSION).toBe('1.0.0');
  });
});

// Silence unused import if tree-shaken oddly in some runners.
void vi;
