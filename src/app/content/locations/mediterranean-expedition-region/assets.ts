import {
  asAssetId,
  asProvenanceRecordId,
  type AssetDescriptor,
  type CollisionMeshAsset,
  type TerrainCollisionAsset,
  type VisualModelAsset,
} from '@fpv/location-domain';

import { proceduralSha256Hex } from './checksum';
import { ASSET_IDS, PROVENANCE_IDS } from './identity';

function checksumFor(uri: string): { algorithm: 'sha256'; hex: string } {
  return { algorithm: 'sha256', hex: proceduralSha256Hex(uri) };
}

const PROV = asProvenanceRecordId(PROVENANCE_IDS.proxyGeometry);
const ALL_TIERS = ['low', 'medium', 'high'] as const;

function visual(
  id: string,
  uri: string,
  size: number,
  mem: number,
  classification: 'required' | 'optional' = 'required',
  tiers: readonly ('low' | 'medium' | 'high')[] = ALL_TIERS,
): VisualModelAsset {
  return {
    kind: 'visual-model',
    id: asAssetId(id),
    packageRelativeUri: uri,
    contentType: 'application/x-fpv-procedural-v1',
    checksum: checksumFor(uri),
    classification,
    compressedSizeBytesEstimate: size,
    decodedMemoryBytesEstimate: mem,
    qualityTierAvailability: tiers,
    provenanceRecordId: PROV,
  };
}

function terrainCollision(id: string, uri: string): TerrainCollisionAsset {
  return {
    kind: 'terrain-collision',
    id: asAssetId(id),
    packageRelativeUri: uri,
    contentType: 'application/x-fpv-procedural-v1',
    checksum: checksumFor(uri),
    classification: 'required',
    compressedSizeBytesEstimate: 2_000,
    decodedMemoryBytesEstimate: 16_000,
    qualityTierAvailability: ALL_TIERS,
    provenanceRecordId: PROV,
  };
}

function collisionMesh(
  id: string,
  uri: string,
  size: number,
  classification: 'required' | 'optional' = 'required',
): CollisionMeshAsset {
  return {
    kind: 'collision-mesh',
    id: asAssetId(id),
    packageRelativeUri: uri,
    contentType: 'application/x-fpv-procedural-v1',
    checksum: checksumFor(uri),
    classification,
    compressedSizeBytesEstimate: size,
    decodedMemoryBytesEstimate: size * 4,
    qualityTierAvailability: ALL_TIERS,
    provenanceRecordId: PROV,
  };
}

/** Visual and collision asset descriptors — never interchangeable. */
export const MEDITERRANEAN_ASSETS: readonly AssetDescriptor[] = [
  visual(ASSET_IDS.terrainVisual, 'procedural/visual/terrain.v1', 8_000, 120_000),
  visual(ASSET_IDS.ruinsVisual, 'procedural/visual/ruins.v1', 12_000, 180_000),
  visual(ASSET_IDS.rocksVisual, 'procedural/visual/rocks.v1', 6_000, 90_000),
  visual(ASSET_IDS.decorVisual, 'procedural/visual/decor.v1', 4_000, 60_000, 'optional', [
    'medium',
    'high',
  ]),
  terrainCollision(ASSET_IDS.terrainCollision, 'procedural/collision/terrain.v1'),
  collisionMesh(ASSET_IDS.archCollision, 'procedural/collision/arch.v1', 1_500),
  collisionMesh(ASSET_IDS.towerCollision, 'procedural/collision/tower.v1', 1_200),
  collisionMesh(ASSET_IDS.wallsCollision, 'procedural/collision/walls.v1', 1_800),
  collisionMesh(ASSET_IDS.rocksCollision, 'procedural/collision/rocks.v1', 1_400),
  collisionMesh(ASSET_IDS.cliffCollision, 'procedural/collision/cliff.v1', 2_200),
  collisionMesh(ASSET_IDS.boundaryCollision, 'procedural/collision/boundary.v1', 800, 'optional'),
];
