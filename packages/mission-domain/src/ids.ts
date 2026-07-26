/**
 * Branded string identifiers for `@fpv/mission-domain`, built on top of
 * `@fpv/simulation-contracts`'s generic `Brand`/`brand` primitives so all
 * mission-domain ids share the same nominal-typing shape as the rest of
 * the simulation stack.
 */

import { brand, type Brand } from '@fpv/simulation-contracts';

/** Identifies a mission definition (stable across versions/revisions). */
export type MissionId = Brand<string, 'MissionId'>;

/** Identifies a specific content revision of a mission definition. */
export type MissionVersion = Brand<string, 'MissionVersion'>;

/** Identifies the shape/structure version of the `MissionDefinition` schema itself. */
export type MissionSchemaVersion = Brand<string, 'MissionSchemaVersion'>;

/**
 * Identifies the runtime-contract compatibility surface a mission was
 * authored against (compared against `MissionAircraftCapabilities.runtimeCompatibilityVersion`
 * — see `aircraft-compatibility.ts`).
 */
export type MissionCompatibilityVersion = Brand<string, 'MissionCompatibilityVersion'>;

/** Identifies one in-progress or completed attempt at a mission. */
export type MissionSessionId = Brand<string, 'MissionSessionId'>;

/** Identifies a single objective within a mission's objective set. */
export type ObjectiveId = Brand<string, 'ObjectiveId'>;

/** Identifies a persisted mission result record. */
export type MissionResultId = Brand<string, 'MissionResultId'>;

export function asMissionId(value: string): MissionId {
  return brand<'MissionId'>(value);
}

export function asMissionVersion(value: string): MissionVersion {
  return brand<'MissionVersion'>(value);
}

export function asMissionSchemaVersion(value: string): MissionSchemaVersion {
  return brand<'MissionSchemaVersion'>(value);
}

export function asMissionCompatibilityVersion(value: string): MissionCompatibilityVersion {
  return brand<'MissionCompatibilityVersion'>(value);
}

export function asMissionSessionId(value: string): MissionSessionId {
  return brand<'MissionSessionId'>(value);
}

export function asObjectiveId(value: string): ObjectiveId {
  return brand<'ObjectiveId'>(value);
}

export function asMissionResultId(value: string): MissionResultId {
  return brand<'MissionResultId'>(value);
}
