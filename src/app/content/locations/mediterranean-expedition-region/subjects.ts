import {
  asLandmarkId,
  asPhotographySubjectId,
  type PhotographySubjectDefinition,
} from '@fpv/location-domain';

import { ASSET_IDS, LANDMARK_IDS, SUBJECT_IDS } from './identity';
import { COASTAL_RUINS_LAYOUT, IDENTITY_QUAT } from './layout';

const L = COASTAL_RUINS_LAYOUT;

/**
 * Authored photography subjects for Coastal Ruins.
 * Visibility sample points are hand-authored and deterministic.
 */
export const COASTAL_RUINS_SUBJECTS: readonly PhotographySubjectDefinition[] = [
  {
    id: asPhotographySubjectId(SUBJECT_IDS.stoneSeaArch),
    displayName: 'Stone Sea Arch',
    description: 'Weathered limestone arch facing open sea flight space.',
    worldPose: {
      position: { ...L.stoneArch.position },
      orientation: IDENTITY_QUAT,
    },
    subjectBounds: {
      kind: 'aabb',
      aabb: {
        min: {
          x: L.stoneArch.position.x - L.stoneArch.outerHalfExtents.x,
          y: L.stoneArch.position.y,
          z: L.stoneArch.position.z - L.stoneArch.outerHalfExtents.z,
        },
        max: {
          x: L.stoneArch.position.x + L.stoneArch.outerHalfExtents.x,
          y: L.stoneArch.position.y + L.stoneArch.outerHalfExtents.y * 2,
          z: L.stoneArch.position.z + L.stoneArch.outerHalfExtents.z,
        },
      },
    },
    semanticTags: ['arch', 'coastal', 'landmark', 'coastal-ruins'],
    scoringAnchor: {
      x: L.stoneArch.position.x,
      y: L.stoneArch.openingCenterY,
      z: L.stoneArch.position.z,
    },
    visibilitySamplePoints: [
      { x: L.stoneArch.position.x, y: L.stoneArch.openingCenterY, z: L.stoneArch.position.z },
      { x: L.stoneArch.position.x - 1.5, y: L.stoneArch.openingCenterY + 1, z: L.stoneArch.position.z },
      { x: L.stoneArch.position.x + 1.5, y: L.stoneArch.openingCenterY + 1, z: L.stoneArch.position.z },
      { x: L.stoneArch.position.x, y: L.stoneArch.openingCenterY + 2.5, z: L.stoneArch.position.z },
    ],
    preferredViewingDirections: [{ x: 0, y: 0, z: 1 }],
    allowedViewingSides: ['front', 'left', 'right'],
    landmarkId: asLandmarkId(LANDMARK_IDS.stoneSeaArch),
    collisionQueryRefIds: [ASSET_IDS.archCollision],
    boundsVersion: '1.0.0',
    metadataVersion: '1.0.0',
  },
  {
    id: asPhotographySubjectId(SUBJECT_IDS.ruinedLookout),
    displayName: 'Ruined Lookout Tower',
    description: 'Broken stone lookout overlooking the Coastal Ruins pocket.',
    worldPose: {
      position: { ...L.lookoutTower.position },
      orientation: IDENTITY_QUAT,
    },
    subjectBounds: {
      kind: 'aabb',
      aabb: {
        min: {
          x: L.lookoutTower.position.x - 2.5,
          y: L.lookoutTower.position.y,
          z: L.lookoutTower.position.z - 2.5,
        },
        max: {
          x: L.lookoutTower.position.x + 2.5,
          y: L.lookoutTower.position.y + 12,
          z: L.lookoutTower.position.z + 2.5,
        },
      },
    },
    semanticTags: ['tower', 'lookout', 'ruins', 'coastal-ruins'],
    scoringAnchor: {
      x: L.lookoutTower.position.x,
      y: L.lookoutTower.shaftCenterY,
      z: L.lookoutTower.position.z,
    },
    visibilitySamplePoints: [
      {
        x: L.lookoutTower.position.x,
        y: L.lookoutTower.shaftCenterY,
        z: L.lookoutTower.position.z,
      },
      {
        x: L.lookoutTower.position.x,
        y: L.lookoutTower.shaftCenterY + 3,
        z: L.lookoutTower.position.z,
      },
      {
        x: L.lookoutTower.position.x - 1,
        y: L.lookoutTower.shaftCenterY + 1,
        z: L.lookoutTower.position.z,
      },
      {
        x: L.lookoutTower.position.x + 1,
        y: L.lookoutTower.shaftCenterY + 1,
        z: L.lookoutTower.position.z,
      },
    ],
    preferredViewingDirections: [{ x: -0.7, y: 0.1, z: 0.7 }],
    allowedViewingSides: ['front', 'left', 'right', 'any'],
    landmarkId: asLandmarkId(LANDMARK_IDS.ruinedLookout),
    collisionQueryRefIds: [ASSET_IDS.towerCollision],
    boundsVersion: '1.0.0',
    metadataVersion: '1.0.0',
  },
  {
    id: asPhotographySubjectId(SUBJECT_IDS.cliffsideRuin),
    displayName: 'Cliffside Ruin Composition',
    description: 'Fragmented cliffside walls along the coastal edge.',
    worldPose: {
      position: { ...L.cliffsideRuin.position },
      orientation: IDENTITY_QUAT,
    },
    subjectBounds: {
      kind: 'aabb',
      aabb: {
        min: {
          x: L.cliffsideRuin.position.x - 7,
          y: L.cliffsideRuin.position.y - 1,
          z: L.cliffsideRuin.position.z - 2,
        },
        max: {
          x: L.cliffsideRuin.position.x + 7,
          y: L.cliffsideRuin.position.y + 8,
          z: L.cliffsideRuin.position.z + 2,
        },
      },
    },
    semanticTags: ['ruins', 'cliff', 'composition', 'coastal-ruins'],
    scoringAnchor: {
      x: L.cliffsideRuin.position.x,
      y: L.cliffsideRuin.position.y + 3,
      z: L.cliffsideRuin.position.z,
    },
    visibilitySamplePoints: [
      {
        x: L.cliffsideRuin.position.x,
        y: L.cliffsideRuin.position.y + 3,
        z: L.cliffsideRuin.position.z,
      },
      {
        x: L.cliffsideRuin.position.x - 3,
        y: L.cliffsideRuin.position.y + 2,
        z: L.cliffsideRuin.position.z,
      },
      {
        x: L.cliffsideRuin.position.x + 3,
        y: L.cliffsideRuin.position.y + 2,
        z: L.cliffsideRuin.position.z,
      },
      {
        x: L.cliffsideRuin.position.x,
        y: L.cliffsideRuin.position.y + 5,
        z: L.cliffsideRuin.position.z,
      },
    ],
    preferredViewingDirections: [{ x: 0.6, y: -0.1, z: 0.8 }],
    allowedViewingSides: ['front', 'right'],
    landmarkId: asLandmarkId(LANDMARK_IDS.cliffsideRuin),
    collisionQueryRefIds: [ASSET_IDS.wallsCollision, ASSET_IDS.cliffCollision],
    boundsVersion: '1.0.0',
    metadataVersion: '1.0.0',
  },
];
