/**
 * Branded identifier types for the location domain.
 *
 * These are nominal string brands built on `Brand` from
 * `@fpv/simulation-contracts` — plain strings at runtime, distinct types at
 * compile time, so e.g. a `ZoneId` cannot be passed where a `LocationId` is
 * expected.
 *
 * `asX` factories only guard against programmer misuse (non-string / empty
 * values) — they are not content validators. Whether an id refers to a real
 * registered location, asset, or zone is a semantic question owned by
 * `@fpv/location-validation`, not this package.
 */

import { brand, type Brand } from '@fpv/simulation-contracts';

export type LocationId = Brand<string, 'LocationId'>;
export type LocationPackageVersion = Brand<string, 'LocationPackageVersion'>;
export type LocationSchemaVersion = Brand<string, 'LocationSchemaVersion'>;
export type LocationCompatibilityVersion = Brand<string, 'LocationCompatibilityVersion'>;
export type AssetId = Brand<string, 'AssetId'>;
export type LandmarkId = Brand<string, 'LandmarkId'>;
export type PhotographySubjectId = Brand<string, 'PhotographySubjectId'>;
export type SpawnPointId = Brand<string, 'SpawnPointId'>;
export type RestartPointId = Brand<string, 'RestartPointId'>;
export type ZoneId = Brand<string, 'ZoneId'>;
export type ProvenanceRecordId = Brand<string, 'ProvenanceRecordId'>;

/**
 * Brands `value` with `label`, throwing if it is not a non-empty string.
 * Shared implementation for every `asX` factory below — each factory stays
 * a distinct, named, discoverable export, but none re-implements the guard.
 */
function brandNonEmptyString<B extends string>(value: string, label: B): Brand<string, B> {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string, got: ${JSON.stringify(value)}`);
  }
  return brand<B>(value);
}

export function asLocationId(value: string): LocationId {
  return brandNonEmptyString(value, 'LocationId');
}

export function asLocationPackageVersion(value: string): LocationPackageVersion {
  return brandNonEmptyString(value, 'LocationPackageVersion');
}

export function asLocationSchemaVersion(value: string): LocationSchemaVersion {
  return brandNonEmptyString(value, 'LocationSchemaVersion');
}

export function asLocationCompatibilityVersion(value: string): LocationCompatibilityVersion {
  return brandNonEmptyString(value, 'LocationCompatibilityVersion');
}

export function asAssetId(value: string): AssetId {
  return brandNonEmptyString(value, 'AssetId');
}

export function asLandmarkId(value: string): LandmarkId {
  return brandNonEmptyString(value, 'LandmarkId');
}

export function asPhotographySubjectId(value: string): PhotographySubjectId {
  return brandNonEmptyString(value, 'PhotographySubjectId');
}

export function asSpawnPointId(value: string): SpawnPointId {
  return brandNonEmptyString(value, 'SpawnPointId');
}

export function asRestartPointId(value: string): RestartPointId {
  return brandNonEmptyString(value, 'RestartPointId');
}

export function asZoneId(value: string): ZoneId {
  return brandNonEmptyString(value, 'ZoneId');
}

export function asProvenanceRecordId(value: string): ProvenanceRecordId {
  return brandNonEmptyString(value, 'ProvenanceRecordId');
}
