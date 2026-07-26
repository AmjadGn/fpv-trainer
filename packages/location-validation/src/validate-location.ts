/**
 * `validateLocationDefinition` — deep, cross-field structural validation of
 * a `LocationDefinition`, without loading any runtime assets (textures,
 * meshes, audio). Never throws: malformed content (including content that
 * does not actually conform to `LocationDefinition` at runtime, e.g. raw
 * JSON cast to the type) always produces error-severity issues in the
 * returned `ValidationReport` rather than an exception.
 */

import {
  COORDINATE_SYSTEM_VERSION,
  createIssue,
  createReport,
  isFiniteNumber,
  isFiniteVec3,
  SIMULATOR_COORDINATE_SYSTEM_V1,
  type ValidationIssue,
  type ValidationReport,
} from '@fpv/simulation-contracts';
import type { AssetDescriptor, LocationDefinition, PhotographySubjectDefinition, Zone } from '@fpv/location-domain';
import {
  knownAssetIdSet,
  knownLandmarkIdSet,
  knownProvenanceIdSet,
  type LocationValidationContext,
} from './context';
import { isFiniteBoundaryShape, pointInBoundaryShape } from './geometry';
import { checkExactVersionField, checkIdsUniqueAndNonEmpty, checkNonNegativeEstimateIfDefined, idStr, isNonEmptyString, isValidSha256Checksum } from './shared';

interface AssetIndex {
  readonly assetsById: ReadonlyMap<string, AssetDescriptor>;
  /** Union of `location.assets` ids and `context.knownAssetIds` — the full set of ids treated as "exists". */
  readonly knownIds: ReadonlySet<string>;
}

function buildAssetIndex(location: LocationDefinition, context: LocationValidationContext): AssetIndex {
  const assetsById = new Map<string, AssetDescriptor>();
  for (const asset of location.assets) {
    if (isNonEmptyString(asset.id)) {
      assetsById.set(idStr(asset.id), asset);
    }
  }
  const knownIds = new Set<string>(assetsById.keys());
  for (const id of knownAssetIdSet(context) ?? []) {
    knownIds.add(id);
  }
  return { assetsById, knownIds };
}

function validateIdentity(location: LocationDefinition, issues: ValidationIssue[]): void {
  const identity = location.identity;
  if (!isNonEmptyString(identity?.locationId)) {
    issues.push(createIssue('EMPTY_ID', 'error', 'identity.locationId', 'identity.locationId must be a non-empty string'));
  }
  checkExactVersionField(identity?.packageVersion, 'identity.packageVersion', issues);
  checkExactVersionField(identity?.schemaVersion, 'identity.schemaVersion', issues);
  checkExactVersionField(identity?.compatibilityVersion, 'identity.compatibilityVersion', issues);
}

function coordinateVectorsMatch(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  return isFiniteVec3(a) && isFiniteVec3(b) && a.x === b.x && a.y === b.y && a.z === b.z;
}

function validateCoordinateSystem(location: LocationDefinition, issues: ValidationIssue[]): void {
  const actual = location.coordinateSystem;
  if (actual === undefined || actual === null) {
    issues.push(createIssue('COORDINATE_SYSTEM_MISMATCH', 'error', 'coordinateSystem', 'coordinateSystem is required'));
    return;
  }
  const expected = SIMULATOR_COORDINATE_SYSTEM_V1;
  const mismatched =
    actual.version !== COORDINATE_SYSTEM_VERSION ||
    actual.handedness !== expected.handedness ||
    actual.distanceUnit !== expected.distanceUnit ||
    actual.orientationConvention !== expected.orientationConvention ||
    !coordinateVectorsMatch(actual.worldRight, expected.worldRight) ||
    !coordinateVectorsMatch(actual.worldUp, expected.worldUp) ||
    !coordinateVectorsMatch(actual.worldBackward, expected.worldBackward) ||
    !coordinateVectorsMatch(actual.aircraftForward, expected.aircraftForward) ||
    !coordinateVectorsMatch(actual.aircraftUp, expected.aircraftUp) ||
    !coordinateVectorsMatch(actual.aircraftRight, expected.aircraftRight);
  if (mismatched) {
    issues.push(
      createIssue(
        'COORDINATE_SYSTEM_MISMATCH',
        'error',
        'coordinateSystem',
        `location.coordinateSystem does not match SIMULATOR_COORDINATE_SYSTEM_V1 (version "${COORDINATE_SYSTEM_VERSION}").`,
        { metadata: { actualVersion: actual.version, expectedVersion: COORDINATE_SYSTEM_VERSION } },
      ),
    );
  }
}

function validateIdUniqueness(location: LocationDefinition, issues: ValidationIssue[]): void {
  checkIdsUniqueAndNonEmpty(location.assets, (asset) => asset?.id, (_asset, i) => `assets[${i}].id`, issues);
  checkIdsUniqueAndNonEmpty(location.gameplaySpatial.zones, (zone) => zone?.id, (_zone, i) => `gameplaySpatial.zones[${i}].id`, issues);
  checkIdsUniqueAndNonEmpty(
    location.photographySubjects,
    (subject) => subject?.id,
    (_subject, i) => `photographySubjects[${i}].id`,
    issues,
  );
  checkIdsUniqueAndNonEmpty(
    location.gameplaySpatial.spawnPoints,
    (spawn) => spawn?.id,
    (_spawn, i) => `gameplaySpatial.spawnPoints[${i}].id`,
    issues,
  );
  checkIdsUniqueAndNonEmpty(
    location.gameplaySpatial.restartPoints,
    (restart) => restart?.id,
    (_restart, i) => `gameplaySpatial.restartPoints[${i}].id`,
    issues,
  );
  checkIdsUniqueAndNonEmpty(
    location.provenanceRecordIds,
    (id) => id,
    (_id, i) => `provenanceRecordIds[${i}]`,
    issues,
  );
}

function checkAssetRefExists(
  assetId: unknown,
  path: string,
  assetIndex: AssetIndex,
  issues: ValidationIssue[],
): void {
  if (!isNonEmptyString(assetId)) {
    return;
  }
  if (!assetIndex.knownIds.has(idStr(assetId))) {
    issues.push(createIssue('MISSING_ASSET', 'error', path, `Referenced asset "${idStr(assetId)}" does not exist in location.assets or the known-asset context.`, { entityId: idStr(assetId) }));
  }
}

function validateVisualAndCollisionReferences(location: LocationDefinition, assetIndex: AssetIndex, issues: ValidationIssue[]): void {
  const visual = location.visualScene;
  const collision = location.collisionScene;

  checkAssetRefExists(visual?.terrainVisualAssetId, 'visualScene.terrainVisualAssetId', assetIndex, issues);
  (visual?.modelAssetIds ?? []).forEach((id, i) => checkAssetRefExists(id, `visualScene.modelAssetIds[${i}]`, assetIndex, issues));
  (visual?.textureAssetIds ?? []).forEach((id, i) => checkAssetRefExists(id, `visualScene.textureAssetIds[${i}]`, assetIndex, issues));

  (collision?.obstacleCollisionAssetIds ?? []).forEach((id, i) => {
    const path = `collisionScene.obstacleCollisionAssetIds[${i}]`;
    checkAssetRefExists(id, path, assetIndex, issues);
    const resolved = assetIndex.assetsById.get(idStr(id));
    if (resolved !== undefined && resolved.kind !== 'collision-mesh' && resolved.kind !== 'terrain-collision') {
      issues.push(
        createIssue('VISUAL_USED_AS_COLLISION', 'error', path, `Obstacle collision reference "${idStr(id)}" resolves to a "${resolved.kind}" asset, not a collision-authority asset.`, { entityId: idStr(id) }),
      );
    }
  });

  const terrainCollisionAssetId = collision?.terrainCollisionAssetId;
  if (collision?.requiresTerrainCollision === true) {
    if (!isNonEmptyString(terrainCollisionAssetId)) {
      issues.push(
        createIssue('MISSING_TERRAIN_COLLISION', 'error', 'collisionScene.terrainCollisionAssetId', 'collisionScene.requiresTerrainCollision is true but terrainCollisionAssetId is missing.'),
      );
    }
  }

  if (isNonEmptyString(terrainCollisionAssetId)) {
    const path = 'collisionScene.terrainCollisionAssetId';
    checkAssetRefExists(terrainCollisionAssetId, path, assetIndex, issues);
    const resolved = assetIndex.assetsById.get(idStr(terrainCollisionAssetId));
    if (resolved !== undefined && resolved.kind !== 'terrain-collision') {
      issues.push(
        createIssue('VISUAL_USED_AS_COLLISION', 'error', path, `terrainCollisionAssetId "${idStr(terrainCollisionAssetId)}" resolves to a "${resolved.kind}" asset — visual/other assets are never collision authority.`, { entityId: idStr(terrainCollisionAssetId) }),
      );
    }
    if (isNonEmptyString(visual?.terrainVisualAssetId) && idStr(visual.terrainVisualAssetId) === idStr(terrainCollisionAssetId)) {
      issues.push(
        createIssue('VISUAL_USED_AS_COLLISION', 'error', path, `terrainCollisionAssetId must not be the same asset as visualScene.terrainVisualAssetId ("${idStr(terrainCollisionAssetId)}").`, { entityId: idStr(terrainCollisionAssetId) }),
      );
    }
  }
}

function validateAltitude(location: LocationDefinition, issues: ValidationIssue[]): void {
  const constraints = location.altitudeConstraints;
  if (!isFiniteNumber(constraints?.minMeters) || !isFiniteNumber(constraints?.maxMeters)) {
    issues.push(createIssue('INVALID_ALTITUDE_RANGE', 'error', 'altitudeConstraints', 'altitudeConstraints.minMeters/maxMeters must be finite numbers.'));
  } else if (constraints.minMeters > constraints.maxMeters) {
    issues.push(createIssue('INVALID_ALTITUDE_RANGE', 'error', 'altitudeConstraints', 'altitudeConstraints.minMeters must be <= maxMeters.'));
  }

  location.gameplaySpatial.altitudeBands.forEach((band, i) => {
    const path = `gameplaySpatial.altitudeBands[${i}].range`;
    if (!isFiniteNumber(band?.range?.minMeters) || !isFiniteNumber(band?.range?.maxMeters)) {
      issues.push(createIssue('INVALID_ALTITUDE_RANGE', 'error', path, `${path}.minMeters/maxMeters must be finite numbers.`));
    } else if (band.range.minMeters > band.range.maxMeters) {
      issues.push(createIssue('INVALID_ALTITUDE_RANGE', 'error', path, `${path}.minMeters must be <= maxMeters.`));
    }
  });
}

function validateZoneShapes(location: LocationDefinition, issues: ValidationIssue[]): void {
  location.gameplaySpatial.zones.forEach((zone: Zone, i) => {
    if (!zone?.shape || !isFiniteBoundaryShape(zone.shape)) {
      issues.push(createIssue('INVALID_ZONE_SHAPE', 'error', `gameplaySpatial.zones[${i}].shape`, `Zone "${idStr(zone?.id)}" has a non-finite or unrecognized shape.`, { entityId: idStr(zone?.id) }));
    }
  });
}

function validateBoundaryShapes(location: LocationDefinition, issues: ValidationIssue[]): void {
  if (!isFiniteVec3(location.worldOrigin?.position)) {
    issues.push(createIssue('INVALID_FINITE_NUMBER', 'error', 'worldOrigin.position', 'worldOrigin.position must be finite.'));
  }
  if (!location.playableBoundary?.shape || !isFiniteBoundaryShape(location.playableBoundary.shape)) {
    issues.push(createIssue('INVALID_FINITE_NUMBER', 'error', 'playableBoundary.shape', 'playableBoundary.shape must be finite.'));
  }
  if (location.softWarningBoundary !== undefined && (!location.softWarningBoundary.shape || !isFiniteBoundaryShape(location.softWarningBoundary.shape))) {
    issues.push(createIssue('INVALID_FINITE_NUMBER', 'error', 'softWarningBoundary.shape', 'softWarningBoundary.shape must be finite.'));
  }
  if (!location.hardBoundary?.shape || !isFiniteBoundaryShape(location.hardBoundary.shape)) {
    issues.push(createIssue('INVALID_FINITE_NUMBER', 'error', 'hardBoundary.shape', 'hardBoundary.shape must be finite.'));
  }
}

function validateSpawnAndRestartContainment(location: LocationDefinition, issues: ValidationIssue[]): void {
  const hardShape = location.hardBoundary?.shape;
  const hardShapeFinite = hardShape !== undefined && isFiniteBoundaryShape(hardShape);

  location.gameplaySpatial.spawnPoints.forEach((spawn, i) => {
    const path = `gameplaySpatial.spawnPoints[${i}].pose.position`;
    if (!isFiniteVec3(spawn?.pose?.position)) {
      issues.push(createIssue('INVALID_FINITE_NUMBER', 'error', path, 'Spawn point position must be finite.', { entityId: idStr(spawn?.id) }));
      return;
    }
    if (hardShapeFinite && !pointInBoundaryShape(spawn.pose.position, hardShape as NonNullable<typeof hardShape>)) {
      issues.push(
        createIssue('SPAWN_OUTSIDE_HARD_BOUNDS', 'error', path, `Spawn point "${idStr(spawn.id)}" lies outside the location's hard boundary.`, { entityId: idStr(spawn.id) }),
      );
    }
  });

  location.gameplaySpatial.restartPoints.forEach((restart, i) => {
    const path = `gameplaySpatial.restartPoints[${i}].pose.position`;
    if (!isFiniteVec3(restart?.pose?.position)) {
      issues.push(createIssue('INVALID_FINITE_NUMBER', 'error', path, 'Restart point position must be finite.', { entityId: idStr(restart?.id) }));
      return;
    }
    if (hardShapeFinite && !pointInBoundaryShape(restart.pose.position, hardShape as NonNullable<typeof hardShape>)) {
      issues.push(
        createIssue('RESTART_OUTSIDE_HARD_BOUNDS', 'error', path, `Restart point "${idStr(restart.id)}" lies outside the location's hard boundary.`, { entityId: idStr(restart.id) }),
      );
    }
  });
}

function validatePhotographySubjects(
  location: LocationDefinition,
  assetIndex: AssetIndex,
  context: LocationValidationContext,
  issues: ValidationIssue[],
): void {
  const knownLandmarks = knownLandmarkIdSet(context);

  location.photographySubjects.forEach((subject: PhotographySubjectDefinition, i) => {
    const base = `photographySubjects[${i}]`;
    const entityId = idStr(subject?.id);

    if (!subject?.subjectBounds || !isFiniteBoundaryShape(subject.subjectBounds)) {
      issues.push(createIssue('INVALID_SUBJECT_BOUNDS', 'error', `${base}.subjectBounds`, `Subject "${entityId}" has a non-finite or unrecognized subjectBounds shape.`, { entityId }));
    }
    if (!isFiniteVec3(subject?.worldPose?.position)) {
      issues.push(createIssue('INVALID_SUBJECT_BOUNDS', 'error', `${base}.worldPose.position`, `Subject "${entityId}" worldPose.position must be finite.`, { entityId }));
    }

    if (!isFiniteVec3(subject?.scoringAnchor)) {
      issues.push(createIssue('INVALID_SAMPLE_POINT', 'error', `${base}.scoringAnchor`, `Subject "${entityId}" scoringAnchor must be finite.`, { entityId }));
    }
    (subject?.visibilitySamplePoints ?? []).forEach((point, pointIndex) => {
      if (!isFiniteVec3(point)) {
        issues.push(
          createIssue('INVALID_SAMPLE_POINT', 'error', `${base}.visibilitySamplePoints[${pointIndex}]`, `Subject "${entityId}" has a non-finite visibility sample point.`, { entityId }),
        );
      }
    });

    checkExactVersionField(subject?.boundsVersion, `${base}.boundsVersion`, issues);
    checkExactVersionField(subject?.metadataVersion, `${base}.metadataVersion`, issues);

    if (subject?.landmarkId !== undefined) {
      if (!isNonEmptyString(subject.landmarkId)) {
        issues.push(createIssue('UNKNOWN_LANDMARK_REF', 'error', `${base}.landmarkId`, `Subject "${entityId}" landmarkId must be a non-empty string.`, { entityId }));
      } else if (knownLandmarks !== undefined && !knownLandmarks.has(idStr(subject.landmarkId))) {
        issues.push(
          createIssue('UNKNOWN_LANDMARK_REF', 'error', `${base}.landmarkId`, `Subject "${entityId}" references unknown landmarkId "${idStr(subject.landmarkId)}".`, { entityId }),
        );
      }
    }

    (subject?.collisionQueryRefIds ?? []).forEach((refId, refIndex) => {
      const path = `${base}.collisionQueryRefIds[${refIndex}]`;
      if (!isNonEmptyString(refId)) {
        issues.push(createIssue('UNKNOWN_COLLISION_REF', 'error', path, `Subject "${entityId}" has an empty collisionQueryRefIds entry.`, { entityId }));
        return;
      }
      if (!assetIndex.knownIds.has(idStr(refId))) {
        issues.push(createIssue('UNKNOWN_COLLISION_REF', 'error', path, `Subject "${entityId}" references unknown collision id "${idStr(refId)}".`, { entityId }));
        return;
      }
      const resolved = assetIndex.assetsById.get(idStr(refId));
      if (resolved !== undefined && resolved.kind !== 'collision-mesh' && resolved.kind !== 'terrain-collision') {
        issues.push(
          createIssue('UNKNOWN_COLLISION_REF', 'error', path, `Subject "${entityId}" collisionQueryRefIds entry "${idStr(refId)}" resolves to a "${resolved.kind}" asset, not a collision-authority asset.`, { entityId }),
        );
      }
    });
  });
}

function validateAssetChecksumsAndQualityTiers(location: LocationDefinition, issues: ValidationIssue[]): void {
  const supportedTiers = location.supportedQualityTiers ?? [];

  location.assets.forEach((asset, i) => {
    const base = `assets[${i}]`;
    const entityId = idStr(asset?.id);

    if (!isValidSha256Checksum(asset?.checksum)) {
      issues.push(createIssue('INVALID_CHECKSUM', 'error', `${base}.checksum`, `Asset "${entityId}" checksum must be { algorithm: "sha256", hex: /^[a-fA-F0-9]{64}$/ }.`, { entityId }));
    }

    checkNonNegativeEstimateIfDefined(asset?.compressedSizeBytesEstimate, `${base}.compressedSizeBytesEstimate`, issues);
    checkNonNegativeEstimateIfDefined(asset?.decodedMemoryBytesEstimate, `${base}.decodedMemoryBytesEstimate`, issues);

    if (asset?.classification === 'required') {
      const availability = new Set(asset.qualityTierAvailability ?? []);
      const missingTiers = supportedTiers.filter((tier) => !availability.has(tier));
      if (missingTiers.length > 0) {
        issues.push(
          createIssue(
            'QUALITY_TIER_INCONSISTENT',
            'error',
            `${base}.qualityTierAvailability`,
            `Required asset "${entityId}" is missing variants for supported quality tier(s): ${missingTiers.join(', ')}.`,
            { entityId, metadata: { missingTiers } },
          ),
        );
      }
    }
  });
}

function validateProvenance(location: LocationDefinition, context: LocationValidationContext, issues: ValidationIssue[]): void {
  const known = knownProvenanceIdSet(context);
  if (known !== undefined) {
    location.provenanceRecordIds.forEach((id, i) => {
      if (isNonEmptyString(id) && !known.has(idStr(id))) {
        issues.push(createIssue('MISSING_PROVENANCE', 'error', `provenanceRecordIds[${i}]`, `Provenance record "${idStr(id)}" was not found in the provided provenance context.`, { entityId: idStr(id) }));
      }
    });
  }

  const declaredIds = new Set(location.provenanceRecordIds.filter(isNonEmptyString).map(idStr));
  location.assets.forEach((asset, i) => {
    const provenanceRecordId = asset?.provenanceRecordId;
    if (provenanceRecordId === undefined) {
      return;
    }
    const path = `assets[${i}].provenanceRecordId`;
    if (!isNonEmptyString(provenanceRecordId)) {
      issues.push(createIssue('MISSING_PROVENANCE', 'error', path, `Asset "${idStr(asset.id)}" has an empty provenanceRecordId.`, { entityId: idStr(asset.id) }));
      return;
    }
    if (!declaredIds.has(idStr(provenanceRecordId))) {
      issues.push(
        createIssue('MISSING_PROVENANCE', 'error', path, `Asset "${idStr(asset.id)}" references provenanceRecordId "${idStr(provenanceRecordId)}" which is not in location.provenanceRecordIds.`, { entityId: idStr(asset.id) }),
      );
    } else if (known !== undefined && !known.has(idStr(provenanceRecordId))) {
      issues.push(
        createIssue('MISSING_PROVENANCE', 'error', path, `Asset "${idStr(asset.id)}" references provenanceRecordId "${idStr(provenanceRecordId)}" which was not found in the provided provenance context.`, { entityId: idStr(asset.id) }),
      );
    }
  });
}

function validatePerformanceEstimates(location: LocationDefinition, issues: ValidationIssue[]): void {
  const metadata = location.performanceMetadata;
  checkNonNegativeEstimateIfDefined(metadata?.estimatedDrawCalls, 'performanceMetadata.estimatedDrawCalls', issues);
  checkNonNegativeEstimateIfDefined(metadata?.estimatedTriangles, 'performanceMetadata.estimatedTriangles', issues);
  checkNonNegativeEstimateIfDefined(metadata?.streamingBudgetBytes, 'performanceMetadata.streamingBudgetBytes', issues);
}

/**
 * Deeply validates a `LocationDefinition` against structural, cross-field,
 * and (when supplied) context-dependent invariants — without loading any
 * runtime assets. Never throws.
 */
export function validateLocationDefinition(
  location: LocationDefinition,
  context: LocationValidationContext = {},
): ValidationReport {
  const issues: ValidationIssue[] = [];
  try {
    validateIdentity(location, issues);
    validateCoordinateSystem(location, issues);
    validateIdUniqueness(location, issues);

    const assetIndex = buildAssetIndex(location, context);
    validateVisualAndCollisionReferences(location, assetIndex, issues);

    validateAltitude(location, issues);
    validateZoneShapes(location, issues);
    validateBoundaryShapes(location, issues);
    validateSpawnAndRestartContainment(location, issues);
    validatePhotographySubjects(location, assetIndex, context, issues);
    validateAssetChecksumsAndQualityTiers(location, issues);
    validateProvenance(location, context, issues);
    validatePerformanceEstimates(location, issues);
  } catch (error) {
    issues.push(createIssue('LOCATION_VALIDATION_INTERNAL_ERROR', 'error', 'root', `Unexpected error while validating location: ${String(error)}`));
  }
  return createReport(issues);
}
