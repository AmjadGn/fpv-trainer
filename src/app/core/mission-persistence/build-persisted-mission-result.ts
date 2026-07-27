/**
 * Converts an immutable session mission result into a persisted DTO.
 * Does not re-score or mutate the session result.
 */

import {
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  buildMissionScopeKey,
  type PersistedMissionResultRecord,
} from '@fpv/mission-persistence';
import type { MissionDefinition, MissionResultRecord } from '@fpv/mission-domain';
import type { PhotoEvaluationResult } from '@fpv/photography-domain';
import { EVIDENCE_SCHEMA_VERSION } from '@fpv/photography-domain';

export interface MissionSessionPresentationImageRef {
  readonly objectiveId: string;
  readonly captureId: string | null;
  readonly mimeType: string | null;
  readonly byteLength: number | null;
  readonly hasBlob: boolean;
}

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
  readonly aircraftId?: string | null;
  readonly aircraftSourceType?: string | null;
  readonly aircraftDefinitionVersion?: string | null;
  readonly aircraftRuntimeCompatibilityVersion?: string | null;
  readonly presentationImages?: readonly MissionSessionPresentationImageRef[];
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

  const imageByObjective = new Map(
    (input.presentationImages ?? []).map((image) => [image.objectiveId, image]),
  );

  const objectives = input.record.objectiveResults.map((objective) => {
    const objectiveId = String(objective.objectiveId);
    const evaluation = input.evaluations.get(objectiveId);
    const declared = input.mission.objectives.find((o) => o.objectiveId === objective.objectiveId);
    const image = imageByObjective.get(objectiveId);
    return {
      objectiveId,
      objectiveVersion: declared ? '1.0.0' : null,
      status: objective.status,
      scorePoints: objective.scorePoints,
      maxPoints: objective.maxPoints,
      normalizedPhotographyScore: evaluation?.normalizedScore ?? null,
      attemptCount: input.attemptCounts.get(objectiveId) ?? 0,
      captureId: image?.captureId ?? null,
      evidenceRef: objective.photographyEvaluationRef ?? null,
      feedbackCodes: evaluation?.feedbackCodes ?? [],
      acceptedImageAvailable: Boolean(image?.hasBlob),
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
      acceptedImageAvailable: o.acceptedImageAvailable,
      captureId: o.captureId,
      evidenceRef: o.evidenceRef,
    })),
    savedAt: {
      savedAtEpochMs,
      savedAtIso: new Date(savedAtEpochMs).toISOString(),
    },
  };
}
