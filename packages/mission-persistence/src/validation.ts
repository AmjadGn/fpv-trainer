/**
 * Validation and corruption diagnostics for persisted mission records.
 *
 * Invalid records are never treated as a valid Personal Best. Adapters may
 * ignore them on read and optionally delete them during retention cleanup.
 */

import { MISSION_PERSISTENCE_SCHEMA_VERSION } from './constants';
import type { MissionBestImageStatus } from './diagnostics';
import { isMissionScopeKey, parseMissionScopeKey } from './scope-key';
import type {
  PersistedBestImageManifestEntry,
  PersistedMissionObjectiveRecord,
  PersistedMissionResultRecord,
  PersistedMissionSummaryRecord,
} from './records/persisted-result';

export type ValidatedPersistenceResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly raw: unknown;
      /** Policy: invalid records are ignored on read; adapters may delete on cleanup. */
      readonly disposition: 'ignore';
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegInt(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

const OBJECTIVE_STATUSES = new Set([
  'completed',
  'failed',
  'skipped',
  'incomplete',
]);

const IMAGE_STATUSES = new Set([
  'none',
  'pending',
  'complete',
  'partial',
  'failed',
]);

export function validatePersistedMissionResult(
  raw: unknown,
): ValidatedPersistenceResult<PersistedMissionResultRecord> {
  if (!isObject(raw)) {
    return fail('not an object', raw);
  }
  if (raw['persistenceSchemaVersion'] !== MISSION_PERSISTENCE_SCHEMA_VERSION) {
    return fail('unknown or missing persistence schema version', raw);
  }
  if (!isString(raw['resultId']) || !raw['resultId']) {
    return fail('invalid resultId', raw);
  }
  if (!isMissionScopeKey(raw['missionScopeKey'])) {
    return fail('invalid missionScopeKey', raw);
  }
  const scope = parseMissionScopeKey(String(raw['missionScopeKey']));
  if (!scope) {
    return fail('unparseable missionScopeKey', raw);
  }
  if (raw['missionId'] !== scope.missionId) {
    return fail('missionId does not match scope key', raw);
  }
  if (raw['missionVersion'] !== scope.missionVersion) {
    return fail('missionVersion does not match scope key', raw);
  }
  if (raw['scoringPolicyVersion'] !== scope.scoringPolicyVersion) {
    return fail('scoringPolicyVersion does not match scope key', raw);
  }
  if (!isString(raw['evidenceSchemaVersion']) || !raw['evidenceSchemaVersion']) {
    return fail('invalid evidenceSchemaVersion', raw);
  }
  if (!isString(raw['sessionId']) || !raw['sessionId']) {
    return fail('invalid sessionId', raw);
  }
  if (!isNonNegInt(raw['sessionGeneration'])) {
    return fail('invalid sessionGeneration', raw);
  }
  if (!isString(raw['locationId']) || !isString(raw['locationVersion'])) {
    return fail('invalid location identity', raw);
  }
  if (raw['status'] !== 'completed' && raw['status'] !== 'failed') {
    return fail('invalid status', raw);
  }
  if (
    raw['failureReasonCode'] !== null &&
    raw['failureReasonCode'] !== undefined &&
    !isString(raw['failureReasonCode'])
  ) {
    return fail('invalid failureReasonCode', raw);
  }
  if (!isNonNegInt(raw['totalScore']) || !isNonNegInt(raw['maximumScore'])) {
    return fail('invalid scores', raw);
  }
  if (!isFiniteNumber(raw['normalizedScore']) || raw['normalizedScore'] < 0) {
    return fail('invalid normalizedScore', raw);
  }
  if (!isNonNegInt(raw['requiredObjectiveSubtotal'])) {
    return fail('invalid requiredObjectiveSubtotal', raw);
  }
  if (!isNonNegInt(raw['timeBonusPoints'])) {
    return fail('invalid timeBonusPoints', raw);
  }
  if (!isNonNegInt(raw['elapsedTicks'])) {
    return fail('invalid elapsedTicks', raw);
  }
  if (!isFiniteNumber(raw['fixedStepSeconds']) || raw['fixedStepSeconds'] <= 0) {
    return fail('invalid fixedStepSeconds', raw);
  }
  if (!Array.isArray(raw['objectives'])) {
    return fail('objectives must be an array', raw);
  }
  const objectives: PersistedMissionObjectiveRecord[] = [];
  for (const entry of raw['objectives']) {
    const objective = validateObjective(entry);
    if (!objective.ok) {
      return fail(objective.reason, raw);
    }
    objectives.push(objective.value);
  }
  if (!isNonNegInt(raw['attemptCountTotal'])) {
    return fail('invalid attemptCountTotal', raw);
  }
  if (!Array.isArray(raw['imageAvailability'])) {
    return fail('imageAvailability must be an array', raw);
  }
  const savedAt = raw['savedAt'];
  if (!isObject(savedAt) || !isNonNegInt(savedAt['savedAtEpochMs']) || !isString(savedAt['savedAtIso'])) {
    return fail('invalid savedAt metadata', raw);
  }

  const record: PersistedMissionResultRecord = {
    persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
    resultId: raw['resultId'],
    missionScopeKey: raw['missionScopeKey'],
    missionId: String(raw['missionId']),
    missionVersion: String(raw['missionVersion']),
    scoringPolicyVersion: String(raw['scoringPolicyVersion']),
    evidenceSchemaVersion: String(raw['evidenceSchemaVersion']),
    sessionId: String(raw['sessionId']),
    sessionGeneration: raw['sessionGeneration'],
    locationId: String(raw['locationId']),
    locationVersion: String(raw['locationVersion']),
    aircraftId: nullableString(raw['aircraftId']),
    aircraftSourceType: nullableString(raw['aircraftSourceType']),
    aircraftDefinitionVersion: nullableString(raw['aircraftDefinitionVersion']),
    aircraftRuntimeCompatibilityVersion: nullableString(
      raw['aircraftRuntimeCompatibilityVersion'],
    ),
    status: raw['status'],
    failureReasonCode: nullableString(raw['failureReasonCode']),
    totalScore: raw['totalScore'],
    maximumScore: raw['maximumScore'],
    normalizedScore: raw['normalizedScore'],
    requiredObjectiveSubtotal: raw['requiredObjectiveSubtotal'],
    timeBonusPoints: raw['timeBonusPoints'],
    elapsedTicks: raw['elapsedTicks'],
    fixedStepSeconds: raw['fixedStepSeconds'],
    objectives,
    attemptCountTotal: raw['attemptCountTotal'],
    imageAvailability: raw['imageAvailability'].map((item) => {
      const row = isObject(item) ? item : {};
      return {
        acceptedImageAvailable: Boolean(row['acceptedImageAvailable']),
        captureId: nullableString(row['captureId']),
        evidenceRef: nullableString(row['evidenceRef']),
      };
    }),
    savedAt: {
      savedAtEpochMs: savedAt['savedAtEpochMs'] as number,
      savedAtIso: String(savedAt['savedAtIso']),
    },
  };
  return { ok: true, value: record };
}

function validateObjective(
  raw: unknown,
): ValidatedPersistenceResult<PersistedMissionObjectiveRecord> {
  if (!isObject(raw)) {
    return fail('objective not an object', raw);
  }
  if (!isString(raw['objectiveId']) || !raw['objectiveId']) {
    return fail('invalid objectiveId', raw);
  }
  if (!OBJECTIVE_STATUSES.has(String(raw['status']))) {
    return fail('invalid objective status', raw);
  }
  if (!isNonNegInt(raw['scorePoints']) || !isNonNegInt(raw['maxPoints'])) {
    return fail('invalid objective scores', raw);
  }
  if (
    raw['normalizedPhotographyScore'] !== null &&
    raw['normalizedPhotographyScore'] !== undefined &&
    !isFiniteNumber(raw['normalizedPhotographyScore'])
  ) {
    return fail('invalid normalizedPhotographyScore', raw);
  }
  if (!isNonNegInt(raw['attemptCount'])) {
    return fail('invalid attemptCount', raw);
  }
  if (!Array.isArray(raw['feedbackCodes'])) {
    return fail('feedbackCodes must be an array', raw);
  }
  return {
    ok: true,
    value: {
      objectiveId: raw['objectiveId'],
      objectiveVersion: nullableString(raw['objectiveVersion']),
      status: raw['status'] as PersistedMissionObjectiveRecord['status'],
      scorePoints: raw['scorePoints'] as number,
      maxPoints: raw['maxPoints'] as number,
      normalizedPhotographyScore:
        raw['normalizedPhotographyScore'] === undefined
          ? null
          : (raw['normalizedPhotographyScore'] as number | null),
      attemptCount: raw['attemptCount'] as number,
      captureId: nullableString(raw['captureId']),
      evidenceRef: nullableString(raw['evidenceRef']),
      feedbackCodes: (raw['feedbackCodes'] as unknown[]).map(String),
      acceptedImageAvailable: Boolean(raw['acceptedImageAvailable']),
    },
  };
}

export function validatePersistedMissionSummary(
  raw: unknown,
): ValidatedPersistenceResult<PersistedMissionSummaryRecord> {
  if (!isObject(raw)) {
    return fail('summary not an object', raw);
  }
  if (raw['persistenceSchemaVersion'] !== MISSION_PERSISTENCE_SCHEMA_VERSION) {
    return fail('unknown or missing persistence schema version', raw);
  }
  if (!isMissionScopeKey(raw['missionScopeKey'])) {
    return fail('invalid missionScopeKey', raw);
  }
  if (!isString(raw['missionId']) || !isString(raw['missionVersion']) || !isString(raw['scoringPolicyVersion'])) {
    return fail('invalid mission identity', raw);
  }
  if (!IMAGE_STATUSES.has(String(raw['personalBestImageStatus']))) {
    return fail('invalid personalBestImageStatus', raw);
  }
  if (!isNonNegInt(raw['completionCount']) || !isNonNegInt(raw['totalAttemptCount'])) {
    return fail('invalid attempt counters', raw);
  }
  if (typeof raw['completed'] !== 'boolean') {
    return fail('invalid completed flag', raw);
  }
  const pb = raw['personalBest'];
  if (!isObject(pb)) {
    return fail('invalid personalBest reference', raw);
  }

  const summary: PersistedMissionSummaryRecord = {
    persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
    missionScopeKey: raw['missionScopeKey'],
    missionId: String(raw['missionId']),
    missionVersion: String(raw['missionVersion']),
    scoringPolicyVersion: String(raw['scoringPolicyVersion']),
    latestResultId: nullableString(raw['latestResultId']),
    personalBestResultId: nullableString(raw['personalBestResultId']),
    completed: raw['completed'] as boolean,
    completionCount: raw['completionCount'] as number,
    totalAttemptCount: raw['totalAttemptCount'] as number,
    latestScore: nullableNumber(raw['latestScore']),
    bestScore: nullableNumber(raw['bestScore']),
    lastPlayedAtEpochMs: nullableNumber(raw['lastPlayedAtEpochMs']),
    lastPlayedAtIso: nullableString(raw['lastPlayedAtIso']),
    personalBestImageStatus: raw['personalBestImageStatus'] as MissionBestImageStatus,
    personalBest: {
      resultId: nullableString(pb['resultId']),
      totalScore: nullableNumber(pb['totalScore']),
      requiredObjectiveSubtotal: nullableNumber(pb['requiredObjectiveSubtotal']),
      elapsedTicks: nullableNumber(pb['elapsedTicks']),
    },
  };
  return { ok: true, value: summary };
}

export function validatePersistedBestImageManifest(
  raw: unknown,
): ValidatedPersistenceResult<PersistedBestImageManifestEntry> {
  if (!isObject(raw)) {
    return fail('image manifest not an object', raw);
  }
  if (raw['persistenceSchemaVersion'] !== MISSION_PERSISTENCE_SCHEMA_VERSION) {
    return fail('unknown image schema version', raw);
  }
  if (!isMissionScopeKey(raw['missionScopeKey'])) {
    return fail('invalid image missionScopeKey', raw);
  }
  if (!isString(raw['personalBestResultId']) || !raw['personalBestResultId']) {
    return fail('invalid personalBestResultId', raw);
  }
  if (!isString(raw['objectiveId']) || !raw['objectiveId']) {
    return fail('invalid objectiveId', raw);
  }
  if (!isString(raw['mimeType']) || !raw['mimeType']) {
    return fail('invalid mimeType', raw);
  }
  if (!isNonNegInt(raw['byteLength'])) {
    return fail('invalid byteLength', raw);
  }
  return {
    ok: true,
    value: {
      persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
      missionScopeKey: raw['missionScopeKey'],
      personalBestResultId: String(raw['personalBestResultId']),
      objectiveId: String(raw['objectiveId']),
      mimeType: String(raw['mimeType']),
      byteLength: raw['byteLength'] as number,
    },
  };
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return isString(value) ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return isFiniteNumber(value) ? value : null;
}

function fail<T>(reason: string, raw: unknown): ValidatedPersistenceResult<T> {
  return { ok: false, reason, raw, disposition: 'ignore' };
}
