/**
 * `LocationDefinition` — the aggregate root of an authored, curated
 * location package.
 *
 * CONTENT SEPARATION (critical, repeated from assets.ts because it governs
 * this aggregate's shape): `visualScene` and `collisionScene` are always
 * kept as two independent fields. A visual mesh is never collision
 * authority and a collision mesh is never rendered. Downstream systems
 * must resolve physics queries exclusively through `collisionScene` and
 * rendering exclusively through `visualScene` — never infer one from the
 * other.
 *
 * QUALITY TIERS: `supportedQualityTiers` and `performanceMetadata` govern
 * which *visual* asset variants load and roughly how expensive they are.
 * Changing quality tier must never change `gameplaySpatial` (zones,
 * altitude bands, spawn/restart points), `photographySubjects` (poses,
 * scoring anchors, bounds), `playableBoundary` / `softWarningBoundary` /
 * `hardBoundary`, or `collisionScene`'s collision-critical geometry. Those
 * fields are quality-tier-invariant by construction: nothing in this
 * module reads `supportedQualityTiers` when assembling them.
 *
 * FALLBACK EXCLUSION: this package must never define, construct, or export
 * a fallback/placeholder location such as the application's
 * `FALLBACK_ENVIRONMENT_ID` ('fallback-flat'). A `LocationDefinition`
 * always represents one specific curated location; a generic procedural
 * fallback is an application-/rendering-layer concern that does not belong
 * in this domain.
 */

import type {
  AltitudeRange,
  CoordinateSystemConvention,
  Pose,
} from '@fpv/simulation-contracts';
import type { AssetDescriptor, QualityTier } from './assets';
import type {
  AssetId,
  LocationCompatibilityVersion,
  LocationId,
  LocationPackageVersion,
  LocationSchemaVersion,
  ProvenanceRecordId,
} from './ids';
import type { LightingConfiguration, SkyConfiguration } from './lighting-sky';
import type { PhotographySubjectDefinition } from './photography-subjects';
import type {
  AltitudeBand,
  HardBoundary,
  PlayableBoundary,
  RestartPoint,
  SoftWarningBoundary,
  SpawnPoint,
  Zone,
} from './spatial-defs';

/** Schema version for the `LocationDefinition` shape itself (not any individual location's content). */
export const LOCATION_SCHEMA_VERSION = '1.0.0';

export interface LocationIdentity {
  readonly locationId: LocationId;
  readonly packageVersion: LocationPackageVersion;
  readonly schemaVersion: LocationSchemaVersion;
  readonly compatibilityVersion: LocationCompatibilityVersion;
}

export interface LocationDisplay {
  readonly name: string;
  readonly summary: string;
  readonly regionLabel?: string;
}

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export interface RealWorldInspiration {
  readonly region: string;
  readonly notes: string;
  readonly approximateLatLon?: LatLon;
}

/**
 * What gets rendered. `terrainVisualAssetId` and the asset id lists are
 * pure rendering references — never consulted for collision.
 */
export interface VisualSceneDescription {
  readonly terrainVisualAssetId?: AssetId;
  readonly modelAssetIds: readonly AssetId[];
  readonly textureAssetIds: readonly AssetId[];
}

/**
 * What physics resolves against. Independent from `VisualSceneDescription`
 * by design — see the module-level content-separation note.
 */
export interface CollisionSceneDescription {
  readonly terrainCollisionAssetId?: AssetId;
  readonly obstacleCollisionAssetIds: readonly AssetId[];
  readonly requiresTerrainCollision: boolean;
}

export interface GameplaySpatialDescription {
  readonly zones: readonly Zone[];
  readonly altitudeBands: readonly AltitudeBand[];
  readonly spawnPoints: readonly SpawnPoint[];
  readonly restartPoints: readonly RestartPoint[];
}

export interface LocationPerformanceMetadata {
  readonly estimatedDrawCalls?: number;
  readonly estimatedTriangles?: number;
  readonly streamingBudgetBytes?: number;
}

export interface LocationRuntimeCompatibility {
  readonly minRuntimeCompatibilityVersion: string;
}

export interface LocationDefinition {
  readonly identity: LocationIdentity;
  readonly display: LocationDisplay;
  readonly realWorldInspiration: RealWorldInspiration;
  /** Must match the shape/version of `SIMULATOR_COORDINATE_SYSTEM_V1`. */
  readonly coordinateSystem: CoordinateSystemConvention;
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
  readonly provenanceRecordIds: readonly ProvenanceRecordId[];
  readonly assets: readonly AssetDescriptor[];
}
