/**
 * Converts an immutable session mission result into a persisted DTO.
 * Does not re-score or mutate the session result.
 *
 * Expected-image metadata comes from completed photography evidence references,
 * never from whether a presentation Blob has arrived yet.
 */

import {
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  buildMissionScopeKey,
  type PersistedMissionResultRecord,
} from '@fpv/mission-persistence';
import type { MissionDefinition, MissionResultRecord } from '@fpv/mission-domain';
import type { PhotoEvaluationResult } from '@fpv/photography-domain';
import { EVIDENCE_SCHEMA_VERSION } from '@fpv/photography-domain';

export interface BuildPersistedMissionResultInput {
  readonly record: MissionResultRecord;
  readonly mission: MissionDefinition;
  readonly scoringPolicyVersion: string;
  readonly sessionGeneration: number;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly evaluations: ReadonlyMap<string, PhotoEvaluationResult>;
  readonly attemptCounts: ReadonlyMap<string, number>;
  readonly fixedStepSeconds: number;
  /** Authored photography-objective versions keyed by mission objective id. */
  readonly objectiveVersions?: ReadonlyMap<string, string>;
  readonly aircraftId?: string | null;
  readonly aircraftSourceType?: string | null;
  readonly aircraftDefinitionVersion?: string | null;
  readonly aircraftPhysicsProfileVersion?: string | null;
  readonly aircraftRuntimeCompatibilityVersion?: string | null;
  readonly savedAtEpochMs?: number;
  readonly evidenceSchemaVersion?: string;
}

export function buildPersistedMissionResult(
  input: BuildPersistedMissionResultInput,
): PersistedMissionResultRecord {
  const missionVersion = String(input.mission.versions.version);
  const scopeKey = buildMissionScopeKey({
    missionId: String(input.record.missionId),
    missionVersion,
    scoringPolicyVersion: input.scoringPolicyVersion,
  });

  const objectives = input.record.objectiveResults.map((objective) => {
    const objectiveId = String(objective.objectiveId);
    const evaluation = input.evaluations.get(objectiveId);
    const evidenceRef = objective.photographyEvaluationRef ?? null;
    const captureId = evidenceRef;
    const acceptedImageExpected =
      objective.status === 'completed' && Boolean(evidenceRef);
    const authoredVersion = input.objectiveVersions?.get(objectiveId) ?? null;
    return {
      objectiveId,
      objectiveVersion: authoredVersion,
      status: objective.status,
      scorePoints: objective.scorePoints,
      maxPoints: objective.maxPoints,
      normalizedPhotographyScore: evaluation?.normalizedScore ?? null,
      attemptCount: input.attemptCounts.get(objectiveId) ?? 0,
      captureId,
      evidenceRef,
      feedbackCodes: evaluation?.feedbackCodes ?? [],
      acceptedImageExpected,
      // Core DTO never embeds presentation bytes.
      acceptedImagePersisted: false,
    };
  });

  const attemptCountTotal = objectives.reduce((sum, o) => sum + o.attemptCount, 0);
  const totalScore = input.record.score.finalScore;
  const maximumScore = input.record.score.maxScore;
  const savedAtEpochMs = input.savedAtEpochMs ?? Date.now();

  return {
    persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
    resultId: String(input.record.resultId),
    missionScopeKey: scopeKey,
    missionId: String(input.record.missionId),
    missionVersion,
    scoringPolicyVersion: input.scoringPolicyVersion,
    evidenceSchemaVersion: input.evidenceSchemaVersion ?? EVIDENCE_SCHEMA_VERSION,
    sessionId: String(input.record.sessionId),
    sessionGeneration: input.sessionGeneration,
    locationId: input.locationId,
    locationVersion: input.locationVersion,
    aircraftId: input.aircraftId ?? null,
    aircraftSourceType: input.aircraftSourceType ?? null,
    aircraftDefinitionVersion: input.aircraftDefinitionVersion ?? null,
    aircraftPhysicsProfileVersion: input.aircraftPhysicsProfileVersion ?? null,
    aircraftRuntimeCompatibilityVersion:
      input.aircraftRuntimeCompatibilityVersion ?? null,
    status: input.record.status,
    failureReasonCode: input.record.failureReasonCode ?? null,
    totalScore,
    maximumScore,
    normalizedScore: maximumScore > 0 ? totalScore / maximumScore : 0,
    requiredObjectiveSubtotal: input.record.score.requiredPoints,
    timeBonusPoints: input.record.score.timeBonusPoints,
    elapsedTicks: input.record.elapsedTicks as unknown as number,
    fixedStepSeconds: input.fixedStepSeconds,
    objectives,
    attemptCountTotal,
    imageAvailability: objectives.map((o) => ({
      objectiveId: o.objectiveId,
      acceptedImageExpected: o.acceptedImageExpected,
      acceptedImagePersisted: o.acceptedImagePersisted,
      captureId: o.captureId,
      evidenceRef: o.evidenceRef,
    })),
    savedAt: {
      savedAtEpochMs,
      savedAtIso: new Date(savedAtEpochMs).toISOString(),
    },
  };
}
