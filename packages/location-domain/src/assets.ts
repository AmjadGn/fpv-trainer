/**
 * Authored asset descriptors for a location package.
 *
 * These are pure metadata records describing *what* an asset is and how it
 * should be treated (required vs optional, per-quality-tier availability,
 * rough memory/size budgets) — never the asset bytes themselves and never a
 * loader. Actual fetching/decoding is an application-layer/adapter concern
 * outside this package.
 *
 * CONTENT SEPARATION (critical): visual mesh assets are never collision
 * authority. `VisualModelAsset` / `TextureAsset` describe what gets
 * rendered; `CollisionMeshAsset` / `TerrainCollisionAsset` describe what
 * physics queries against. A location may render a highly detailed visual
 * mesh backed by a much simpler collision mesh (or vice versa) — the two
 * asset families must never be treated as interchangeable or as implying
 * one another. `location-validation` may check that required collision
 * assets exist; this package only describes them.
 */

import type { AssetId, ProvenanceRecordId } from './ids';

export type QualityTier = 'low' | 'medium' | 'high';

export type AssetClassification = 'required' | 'optional';

export interface AssetChecksum {
  readonly algorithm: 'sha256';
  readonly hex: string;
}

interface AssetDescriptorCommon {
  readonly id: AssetId;
  /** URI relative to the location package root — never an absolute filesystem/network path. */
  readonly packageRelativeUri: string;
  readonly contentType: string;
  readonly checksum: AssetChecksum;
  readonly classification: AssetClassification;
  readonly compressedSizeBytesEstimate: number;
  readonly decodedMemoryBytesEstimate?: number;
  /** Which supported quality tiers ship a variant of this asset. */
  readonly qualityTierAvailability: readonly QualityTier[];
  readonly provenanceRecordId?: ProvenanceRecordId;
}

/** A renderable visual mesh/model. Never a source of collision geometry. */
export interface VisualModelAsset extends AssetDescriptorCommon {
  readonly kind: 'visual-model';
}

/** A renderable texture (albedo, normal, ORM, etc.). Rendering-only. */
export interface TextureAsset extends AssetDescriptorCommon {
  readonly kind: 'texture';
}

/**
 * A collision mesh for a discrete obstacle/prop. This — not any visual
 * model — is the authority for physics queries against that object.
 */
export interface CollisionMeshAsset extends AssetDescriptorCommon {
  readonly kind: 'collision-mesh';
}

/**
 * Terrain-specific collision geometry (e.g. a heightfield or coarse ground
 * mesh). Distinct from any visual terrain asset — a location can render a
 * lush high-poly terrain while colliding against a much coarser surface.
 */
export interface TerrainCollisionAsset extends AssetDescriptorCommon {
  readonly kind: 'terrain-collision';
}

/** Optional ambience/foley audio associated with the location. */
export interface AudioAsset extends AssetDescriptorCommon {
  readonly kind: 'audio';
}

/** A still image used for briefing/selection UI presentation — never loaded into the 3D scene. */
export interface PresentationImageAsset extends AssetDescriptorCommon {
  readonly kind: 'presentation-image';
}

/** Union of every asset descriptor kind a `LocationDefinition` may reference. */
export type AssetDescriptor =
  | VisualModelAsset
  | TextureAsset
  | CollisionMeshAsset
  | TerrainCollisionAsset
  | AudioAsset
  | PresentationImageAsset;
