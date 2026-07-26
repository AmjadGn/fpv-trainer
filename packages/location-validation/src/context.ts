/**
 * Cross-package validation contexts consumed by `validateLocationDefinition`
 * and `validateMissionDefinition`.
 *
 * These are read-only "known universe" inputs describing content that
 * exists *outside* the definition under validation (assets present in a
 * package manifest but not necessarily loaded, provenance records tracked
 * by a catalog, the photography objective catalog, scoring policies) —
 * never runtime/loaded asset bytes, never a live location/mission
 * instance. Every field is optional: omitting a field means "do not check
 * that dimension" rather than "assume it is empty".
 */

import type { LocationDefinition } from '@fpv/location-domain';
import type { PhotographyObjectiveDefinition, PhotographyScoringPolicy } from '@fpv/photography-domain';

export interface LocationValidationContext {
  /**
   * Package-relative asset ids known to exist (e.g. sourced from a package
   * manifest listing on-disk files), consulted in addition to
   * `location.assets`. When omitted, only `location.assets` is treated as
   * the known-asset universe.
   */
  readonly knownAssetIds?: ReadonlySet<string> | readonly string[];
  /**
   * Provenance records known to exist, either a map keyed by record id or
   * a list of `{ id }`-shaped records. When omitted, provenance ids are
   * only checked for well-formedness, not existence.
   */
  readonly provenanceRecords?: ReadonlyMap<string, unknown> | readonly { readonly id: string }[];
  /** The photography objective catalog, used to resolve mission photography-objective references and validate them. */
  readonly photographyObjectives?: readonly PhotographyObjectiveDefinition[];
  /** Candidate scoring policies, used to cross-check photography objective scoring weights. */
  readonly scoringPolicies?: readonly PhotographyScoringPolicy[];
  /**
   * Optional closed set of known landmark ids (e.g. from a shared,
   * cross-location landmark catalog — `location-domain` itself has no
   * landmark registry). When omitted, `landmarkId` refs are only checked
   * for well-formedness (non-empty string), not existence.
   */
  readonly knownLandmarkIds?: ReadonlySet<string> | readonly string[];
}

export interface MissionValidationContext {
  /** The location this mission targets, used to cross-check zone/subject references and the required-location-id match. */
  readonly location?: LocationDefinition;
  readonly photographyObjectives?: readonly PhotographyObjectiveDefinition[];
  readonly scoringPolicies?: readonly PhotographyScoringPolicy[];
}

function toStringSet(value: ReadonlySet<string> | readonly string[] | undefined): ReadonlySet<string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value instanceof Set ? value : new Set(value);
}

export function knownAssetIdSet(context: LocationValidationContext | undefined): ReadonlySet<string> | undefined {
  return toStringSet(context?.knownAssetIds);
}

export function knownLandmarkIdSet(context: LocationValidationContext | undefined): ReadonlySet<string> | undefined {
  return toStringSet(context?.knownLandmarkIds);
}

export function knownProvenanceIdSet(context: LocationValidationContext | undefined): ReadonlySet<string> | undefined {
  const records = context?.provenanceRecords;
  if (records === undefined) {
    return undefined;
  }
  if (records instanceof Map) {
    return new Set(records.keys());
  }
  const list = records as readonly { readonly id: string }[];
  return new Set(list.map((record) => record.id));
}
