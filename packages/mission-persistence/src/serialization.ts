/**
 * Pure serialization helpers for mission persistence DTOs.
 * Round-trips through JSON-compatible plain objects (no Blob).
 */

import type {
  PersistedMissionResultRecord,
  PersistedMissionSummaryRecord,
} from './records/persisted-result';
import {
  validatePersistedMissionResult,
  validatePersistedMissionSummary,
  type ValidatedPersistenceResult,
} from './validation';

export function serializeMissionResult(
  record: PersistedMissionResultRecord,
): string {
  return JSON.stringify(record);
}

export function deserializeMissionResult(
  json: string,
): ValidatedPersistenceResult<PersistedMissionResultRecord> {
  try {
    return validatePersistedMissionResult(JSON.parse(json) as unknown);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      raw: json,
      disposition: 'ignore',
    };
  }
}

export function serializeMissionSummary(
  record: PersistedMissionSummaryRecord,
): string {
  return JSON.stringify(record);
}

export function deserializeMissionSummary(
  json: string,
): ValidatedPersistenceResult<PersistedMissionSummaryRecord> {
  try {
    return validatePersistedMissionSummary(JSON.parse(json) as unknown);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      raw: json,
      disposition: 'ignore',
    };
  }
}

/** Deep-freeze helper for tests — production adapters already treat records as immutable. */
export function freezeMissionResult(
  record: PersistedMissionResultRecord,
): PersistedMissionResultRecord {
  return Object.freeze({
    ...record,
    objectives: Object.freeze(record.objectives.map((o) => Object.freeze({ ...o }))),
    imageAvailability: Object.freeze(
      record.imageAvailability.map((i) => Object.freeze({ ...i })),
    ),
    savedAt: Object.freeze({ ...record.savedAt }),
  });
}
