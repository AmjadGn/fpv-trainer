/**
 * Authored photography subject definitions — the "what can be photographed
 * here" content for a location. Purely descriptive/authored data; actual
 * shot scoring, visibility raycasting, and evidence capture live in
 * `photography-domain` / `location-validation`, which consume these
 * definitions rather than duplicating them.
 */

import type { Pose, Vec3 } from '@fpv/simulation-contracts';
import type { LandmarkId, PhotographySubjectId } from './ids';
import type { VolumetricBoundsShape } from './spatial-defs';

export type ViewingSide = 'front' | 'back' | 'left' | 'right' | 'any';

export interface PhotographySubjectDefinition {
  readonly id: PhotographySubjectId;
  readonly displayName: string;
  readonly description?: string;
  readonly worldPose: Pose;
  readonly subjectBounds: VolumetricBoundsShape;
  readonly semanticTags: readonly string[];
  /** World-space point scoring logic anchors distance/framing checks to. */
  readonly scoringAnchor: Vec3;
  /**
   * Authored, deterministic sample points (world space) used for visibility
   * checks (e.g. line-of-sight raycasts). These are hand-authored content,
   * not runtime-generated — the same subject definition must always produce
   * the same sample points so scoring is reproducible/replayable.
   */
  readonly visibilitySamplePoints: readonly Vec3[];
  /** Preferred camera-to-subject viewing directions (world-space unit vectors), best-first. */
  readonly preferredViewingDirections: readonly Vec3[];
  readonly allowedViewingSides: readonly ViewingSide[];
  readonly landmarkId?: LandmarkId;
  /**
   * Optional references into collision assets used for line-of-sight /
   * occlusion queries against this subject. Plain strings rather than
   * `AssetId` because a subject may reference collision geometry owned by
   * a different asset than any single `AssetId` in `assets` (e.g. a shared
   * environment collision mesh); resolving/validating these refs is a
   * `location-validation` concern.
   */
  readonly collisionQueryRefIds?: readonly string[];
  readonly boundsVersion: string;
  readonly metadataVersion: string;
}
