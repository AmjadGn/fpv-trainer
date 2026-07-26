/**
 * Branded identifier types for the photography domain.
 *
 * These are deliberately *local* to `@fpv/photography-domain` — this
 * package must not import `@fpv/mission-domain` or `@fpv/location-domain`
 * (see package README / dependency-direction docs), so subject / zone
 * identifiers are opaque strings branded here rather than imported from
 * either domain. `location-validation` is responsible for asserting that
 * the string values agree across packages.
 */

import { brand, type Brand } from '@fpv/simulation-contracts';

/** Identifies a photographable subject (a location-authored point of interest). */
export type SubjectId = Brand<string, 'SubjectId'>;

/** Identifies a `PhotographyObjectiveDefinition`. */
export type PhotographyObjectiveId = Brand<string, 'PhotographyObjectiveId'>;

/** Identifies an aircraft-position zone (location-authored spatial region). */
export type PositionZoneId = Brand<string, 'PositionZoneId'>;

/** Identifies a single immutable `PhotoCaptureEvidence` record. */
export type PhotoCaptureEvidenceId = Brand<string, 'PhotoCaptureEvidenceId'>;

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string, got: ${JSON.stringify(value)}`);
  }
}

export function asSubjectId(value: string): SubjectId {
  assertNonEmptyString(value, 'SubjectId');
  return brand<'SubjectId'>(value);
}

export function asPhotographyObjectiveId(value: string): PhotographyObjectiveId {
  assertNonEmptyString(value, 'PhotographyObjectiveId');
  return brand<'PhotographyObjectiveId'>(value);
}

export function asPositionZoneId(value: string): PositionZoneId {
  assertNonEmptyString(value, 'PositionZoneId');
  return brand<'PositionZoneId'>(value);
}

export function asPhotoCaptureEvidenceId(value: string): PhotoCaptureEvidenceId {
  assertNonEmptyString(value, 'PhotoCaptureEvidenceId');
  return brand<'PhotoCaptureEvidenceId'>(value);
}
