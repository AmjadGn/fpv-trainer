/**
 * Construction helper(s) for `LocationDefinition`.
 *
 * `createLocationDefinition` does *basic structural assembly* only: it
 * brands raw id strings, defaults a few well-known fields (schema version,
 * coordinate system), defensively copies arrays so the returned aggregate
 * can't be mutated through the caller's original references, and shallow-
 * freezes the result.
 *
 * It deliberately does NOT perform deep/cross-field validation — e.g. it
 * does not check that spawn points lie inside the hard boundary, that
 * referenced asset ids exist in `assets`, that zones don't overlap
 * pathologically, or that photography subjects are reachable. That is the
 * explicit job of `@fpv/location-validation`.
 */

import { SIMULATOR_COORDINATE_SYSTEM_V1, type CoordinateSystemConvention } from '@fpv/simulation-contracts';
import type { AssetDescriptor, QualityTier } from './assets';
import { asLocationCompatibilityVersion, asLocationPackageVersion, asLocationId, asLocationSchemaVersion, asProvenanceRecordId } from './ids';
import type { LightingConfiguration, SkyConfiguration } from './lighting-sky';
import {
  LOCATION_SCHEMA_VERSION,
  type CollisionSceneDescription,
  type GameplaySpatialDescription,
  type LocationDefinition,
  type LocationDisplay,
  type LocationPerformanceMetadata,
  type LocationRuntimeCompatibility,
  type RealWorldInspiration,
  type VisualSceneDescription,
} from './location-definition';
import type { PhotographySubjectDefinition } from './photography-subjects';
import type { HardBoundary, PlayableBoundary, SoftWarningBoundary } from './spatial-defs';
import type { AltitudeRange, Pose } from '@fpv/simulation-contracts';

export interface CreateLocationDefinitionInput {
  readonly locationId: string;
  readonly packageVersion: string;
  /** Defaults to `LOCATION_SCHEMA_VERSION` when omitted. */
  readonly schemaVersion?: string;
  readonly compatibilityVersion: string;
  readonly display: LocationDisplay;
  readonly realWorldInspiration: RealWorldInspiration;
  /** Defaults to `SIMULATOR_COORDINATE_SYSTEM_V1` when omitted. */
  readonly coordinateSystem?: CoordinateSystemConvention;
  readonly worldOrigin: Pose;
  readonly playableBoundary: PlayableBoundary;
  readonly softWarningBoundary?: SoftWarningBoundary;
  readonly hardBoundary: HardBoundary;
  readonly altitudeConstraints: AltitudeRange;
  readonly visualScene: VisualSceneDescription;
  readonly collisionScene: CollisionSceneDescription;
  readonly gameplaySpatial: GameplaySpatialDescription;
  readonly photographySubjects: readonly PhotographySubjectDefinition[];
  readonly lighting: LightingConfiguration;
  readonly sky: SkyConfiguration;
  readonly supportedQualityTiers: readonly QualityTier[];
  readonly performanceMetadata: LocationPerformanceMetadata;
  readonly runtimeCompatibility: LocationRuntimeCompatibility;
  /** Raw provenance record id strings; branded during construction. */
  readonly provenanceRecordIds: readonly string[];
  readonly assets: readonly AssetDescriptor[];
}

function assertNonNegativeIfDefined(value: number | undefined, label: string): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number, got: ${value}`);
  }
}

/**
 * Assembles a `LocationDefinition` from authored input.
 *
 * Throws only for programmer-misuse-level structural problems (empty ids,
 * negative size/budget estimates) — see the module doc for what is
 * deliberately left to `location-validation` instead.
 */
export function createLocationDefinition(input: CreateLocationDefinitionInput): LocationDefinition {
  const locationId = asLocationId(input.locationId);
  const packageVersion = asLocationPackageVersion(input.packageVersion);
  const schemaVersion = asLocationSchemaVersion(input.schemaVersion ?? LOCATION_SCHEMA_VERSION);
  const compatibilityVersion = asLocationCompatibilityVersion(input.compatibilityVersion);

  assertNonNegativeIfDefined(input.performanceMetadata.estimatedDrawCalls, 'performanceMetadata.estimatedDrawCalls');
  assertNonNegativeIfDefined(input.performanceMetadata.estimatedTriangles, 'performanceMetadata.estimatedTriangles');
  assertNonNegativeIfDefined(input.performanceMetadata.streamingBudgetBytes, 'performanceMetadata.streamingBudgetBytes');

  const definition: LocationDefinition = {
    identity: { locationId, packageVersion, schemaVersion, compatibilityVersion },
    display: { ...input.display },
    realWorldInspiration: { ...input.realWorldInspiration },
    coordinateSystem: input.coordinateSystem ?? SIMULATOR_COORDINATE_SYSTEM_V1,
    worldOrigin: input.worldOrigin,
    playableBoundary: input.playableBoundary,
    ...(input.softWarningBoundary !== undefined
      ? { softWarningBoundary: input.softWarningBoundary }
      : {}),
    hardBoundary: input.hardBoundary,
    altitudeConstraints: input.altitudeConstraints,
    visualScene: {
      ...(input.visualScene.terrainVisualAssetId !== undefined
        ? { terrainVisualAssetId: input.visualScene.terrainVisualAssetId }
        : {}),
      modelAssetIds: [...input.visualScene.modelAssetIds],
      textureAssetIds: [...input.visualScene.textureAssetIds],
    },
    collisionScene: {
      ...(input.collisionScene.terrainCollisionAssetId !== undefined
        ? { terrainCollisionAssetId: input.collisionScene.terrainCollisionAssetId }
        : {}),
      obstacleCollisionAssetIds: [...input.collisionScene.obstacleCollisionAssetIds],
      requiresTerrainCollision: input.collisionScene.requiresTerrainCollision,
    },
    gameplaySpatial: {
      zones: [...input.gameplaySpatial.zones],
      altitudeBands: [...input.gameplaySpatial.altitudeBands],
      spawnPoints: [...input.gameplaySpatial.spawnPoints],
      restartPoints: [...input.gameplaySpatial.restartPoints],
    },
    photographySubjects: [...input.photographySubjects],
    lighting: input.lighting,
    sky: input.sky,
    supportedQualityTiers: [...input.supportedQualityTiers],
    performanceMetadata: { ...input.performanceMetadata },
    runtimeCompatibility: { ...input.runtimeCompatibility },
    provenanceRecordIds: input.provenanceRecordIds.map(asProvenanceRecordId),
    assets: [...input.assets],
  };

  return Object.freeze(definition);
}
