import type {
  ComponentRevisionId,
  CatalogReleaseId,
  DroneBuildId,
  DroneBuildRevisionId,
  InstallationSlotId,
  MountPointId,
  Vec3Si,
} from '@fpv/engineering-kernel';

export type BuildLifecycleStatus =
  | 'draft'
  | 'normalized'
  | 'validated'
  | 'invalid'
  | 'valid-with-warnings'
  | 'valid'
  | 'compiled'
  | 'published'
  | 'deprecated'
  | 'archived';

export type PropRotation = 'cw' | 'ccw';

export interface Transform3 {
  readonly position: Vec3Si;
  readonly orientationEulerRad: { readonly x: number; readonly y: number; readonly z: number };
}

export interface ComponentSelection {
  readonly selectionId: string;
  readonly componentRevisionId: ComponentRevisionId;
  readonly quantity: number;
  readonly slotId: InstallationSlotId;
  readonly mountPointId: MountPointId;
  readonly transform: Transform3;
  readonly propellerRotation?: PropRotation;
  readonly configuration: Readonly<Record<string, number | string | boolean>>;
}

export type TopologyEdgeKind =
  | 'mounts-on'
  | 'powers'
  | 'controls'
  | 'propels'
  | 'signals';

export interface TopologyEdge {
  readonly fromSelectionId: string;
  readonly toSelectionId: string;
  readonly kind: TopologyEdgeKind;
}

export interface UserTuningValues {
  readonly thrustCurveExponent: number;
  readonly throttleExpo: number;
  readonly stabilizationBias: number;
  readonly rateProfileHint: string;
}

export interface DroneBuildRevision {
  readonly revisionId: DroneBuildRevisionId;
  readonly buildId: DroneBuildId;
  readonly schemaVersion: string;
  readonly parentRevisionId: DroneBuildRevisionId | null;
  readonly catalogReleaseId: CatalogReleaseId;
  readonly selections: readonly ComponentSelection[];
  readonly topology: readonly TopologyEdge[];
  readonly tuning: UserTuningValues;
  readonly notes: string;
  readonly immutable: true;
}

export interface DroneBuildDraft {
  readonly buildId: DroneBuildId;
  readonly schemaVersion: string;
  readonly catalogReleaseId: CatalogReleaseId;
  readonly name: string;
  readonly description: string;
  readonly selections: ComponentSelection[];
  readonly topology: TopologyEdge[];
  readonly tuning: UserTuningValues;
  readonly mutable: true;
}

export interface DroneBuild {
  readonly buildId: DroneBuildId;
  readonly name: string;
  readonly description: string;
  readonly status: BuildLifecycleStatus;
  readonly draft: DroneBuildDraft | null;
  readonly publishedRevisionIds: readonly DroneBuildRevisionId[];
  readonly latestPublishedRevisionId: DroneBuildRevisionId | null;
}

export const DEFAULT_TUNING: UserTuningValues = {
  thrustCurveExponent: 1.1,
  throttleExpo: 0.3,
  stabilizationBias: 0.5,
  rateProfileHint: 'normal',
};

export function identityTransform(): Transform3 {
  return {
    position: { x: 0 as Vec3Si['x'], y: 0 as Vec3Si['y'], z: 0 as Vec3Si['z'] },
    orientationEulerRad: { x: 0, y: 0, z: 0 },
  };
}
