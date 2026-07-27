/**
 * Helpers to build empty / updated mission summaries after a result save.
 * Pure — no storage I/O.
 */

import { MISSION_PERSISTENCE_SCHEMA_VERSION } from './constants';
import type { MissionBestImageStatus } from './diagnostics';
import {
  isBetterPersonalBest,
  toPersonalBestComparable,
} from './comparator';
import { parseMissionScopeKey } from './scope-key';
import type {
  PersistedMissionResultRecord,
  PersistedMissionSummaryRecord,
} from './records/persisted-result';

export interface ApplyResultToSummaryOutput {
  readonly summary: PersistedMissionSummaryRecord;
  readonly becamePersonalBest: boolean;
  readonly previousPersonalBestResultId: string | null;
}

export function createEmptyMissionSummary(
  missionScopeKey: string,
): PersistedMissionSummaryRecord {
  const parts = parseMissionScopeKey(missionScopeKey);
  if (!parts) {
    throw new Error('MISSION_SCOPE_KEY_INVALID');
  }
  return {
    persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
    missionScopeKey,
    missionId: parts.missionId,
    missionVersion: parts.missionVersion,
    scoringPolicyVersion: parts.scoringPolicyVersion,
    latestResultId: null,
    personalBestResultId: null,
    completed: false,
    completionCount: 0,
    totalAttemptCount: 0,
    latestScore: null,
    bestScore: null,
    lastPlayedAtEpochMs: null,
    lastPlayedAtIso: null,
    personalBestImageStatus: 'none',
    personalBest: {
      resultId: null,
      totalScore: null,
      requiredObjectiveSubtotal: null,
      elapsedTicks: null,
    },
  };
}

export function applyResultToSummary(
  current: PersistedMissionSummaryRecord | null,
  result: PersistedMissionResultRecord,
  options: { readonly resetImageStatusOnNewBest?: boolean } = {},
): ApplyResultToSummaryOutput {
  const base =
    current ?? createEmptyMissionSummary(String(result.missionScopeKey));
  const previousPersonalBestResultId = base.personalBestResultId;
  const currentPbComparable =
    previousPersonalBestResultId && base.personalBest.resultId
      ? {
          resultId: previousPersonalBestResultId,
          missionScopeKey: String(base.missionScopeKey),
          status: 'completed' as const,
          totalScore: base.personalBest.totalScore ?? 0,
          requiredObjectiveSubtotal:
            base.personalBest.requiredObjectiveSubtotal ?? 0,
          elapsedTicks: base.personalBest.elapsedTicks ?? 0,
        }
      : null;

  const candidate = toPersonalBestComparable(result);
  const becamePersonalBest = isBetterPersonalBest(candidate, currentPbComparable);

  let personalBestImageStatus: MissionBestImageStatus = base.personalBestImageStatus;
  if (becamePersonalBest && options.resetImageStatusOnNewBest !== false) {
    personalBestImageStatus = 'pending';
  }

  const summary: PersistedMissionSummaryRecord = {
    ...base,
    persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
    latestResultId: result.resultId,
    latestScore: result.totalScore,
    totalAttemptCount: base.totalAttemptCount + 1,
    completionCount:
      result.status === 'completed'
        ? base.completionCount + 1
        : base.completionCount,
    completed: base.completed || result.status === 'completed',
    lastPlayedAtEpochMs: result.savedAt.savedAtEpochMs,
    lastPlayedAtIso: result.savedAt.savedAtIso,
    personalBestResultId: becamePersonalBest
      ? result.resultId
      : base.personalBestResultId,
    bestScore: becamePersonalBest
      ? result.totalScore
      : base.bestScore,
    personalBestImageStatus,
    personalBest: becamePersonalBest
      ? {
          resultId: result.resultId,
          totalScore: result.totalScore,
          requiredObjectiveSubtotal: result.requiredObjectiveSubtotal,
          elapsedTicks: result.elapsedTicks,
        }
      : base.personalBest,
  };

  return {
    summary,
    becamePersonalBest,
    previousPersonalBestResultId,
  };
}

export function withImageStatus(
  summary: PersistedMissionSummaryRecord,
  status: MissionBestImageStatus,
): PersistedMissionSummaryRecord {
  return { ...summary, personalBestImageStatus: status };
}
