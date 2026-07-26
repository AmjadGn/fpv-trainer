/**
 * @fpv/location-domain — pure, authored data contracts for curated FPV
 * locations (playable arena bounds, gameplay zones, photography subjects,
 * lighting/sky metadata, asset descriptors) plus minimal construction and
 * compatibility helpers.
 *
 * Imports only from `@fpv/simulation-contracts`. No Angular, no Three.js,
 * no Rapier, no IndexedDB, no `src/app`. Deliberate public API — see
 * individual modules for details. Deep/cross-field validation lives in
 * `@fpv/location-validation`, not here.
 */

export type {
  LocationId,
  LocationPackageVersion,
  LocationSchemaVersion,
  LocationCompatibilityVersion,
  AssetId,
  LandmarkId,
  PhotographySubjectId,
  SpawnPointId,
  RestartPointId,
  ZoneId,
  ProvenanceRecordId,
} from './ids';
export {
  asLocationId,
  asLocationPackageVersion,
  asLocationSchemaVersion,
  asLocationCompatibilityVersion,
  asAssetId,
  asLandmarkId,
  asPhotographySubjectId,
  asSpawnPointId,
  asRestartPointId,
  asZoneId,
  asProvenanceRecordId,
} from './ids';

export type {
  QualityTier,
  AssetClassification,
  AssetChecksum,
  VisualModelAsset,
  TextureAsset,
  CollisionMeshAsset,
  TerrainCollisionAsset,
  AudioAsset,
  PresentationImageAsset,
  AssetDescriptor,
} from './assets';

export type {
  SphereBoundsShape,
  AabbBoundsShape,
  ObbBoundsShape,
  PolygonPrismBoundsShape,
  BoundaryShape,
  VolumetricBoundsShape,
  PlayableBoundary,
  SoftWarningBoundary,
  HardBoundary,
  ZoneKind,
  RestrictedZone,
  ObjectiveZone,
  MissionZone,
  Zone,
  AltitudeBand,
  SpawnPoint,
  RestartPoint,
} from './spatial-defs';

export type { ViewingSide, PhotographySubjectDefinition } from './photography-subjects';

export type {
  LinearRgb,
  DirectionalLightConfiguration,
  AmbientLightConfiguration,
  LightingConfiguration,
  SkyMode,
  SkyConfiguration,
} from './lighting-sky';

export type { ProvenanceRecord } from './provenance';

export {
  LOCATION_SCHEMA_VERSION,
} from './location-definition';
export type {
  LocationIdentity,
  LocationDisplay,
  LatLon,
  RealWorldInspiration,
  VisualSceneDescription,
  CollisionSceneDescription,
  GameplaySpatialDescription,
  LocationPerformanceMetadata,
  LocationRuntimeCompatibility,
  LocationDefinition,
} from './location-definition';

export { createLocationDefinition } from './create';
export type { CreateLocationDefinitionInput } from './create';

export { checkLocationCompatibility } from './compatibility';
export type { LocationRuntimeInfo, LocationCompatibilityResult } from './compatibility';
