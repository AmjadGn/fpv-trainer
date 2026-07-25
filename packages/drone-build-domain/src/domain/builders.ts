import {
  asDroneBuildId,
  asDroneBuildRevisionId,
  asInstallationSlotId,
  asMountPointId,
  asComponentRevisionId,
  asCatalogReleaseId,
  vec3,
  type ComponentRevisionId,
} from '@fpv/engineering-kernel';
import type {
  ComponentSelection,
  DroneBuildDraft,
  DroneBuildRevision,
  TopologyEdge,
  UserTuningValues,
} from './models';
import { DEFAULT_TUNING, identityTransform } from './models';

export interface QuadMotorLayout {
  readonly motorRevisionId: string;
  readonly propellerRevisionId: string;
  readonly armPositions: readonly {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }[];
  readonly rotations: readonly ('cw' | 'ccw')[];
}

/** Build a standard X-quad selection set from frame arms + component revisions. */
export function createQuadSelections(input: {
  readonly frameRevisionId: string;
  readonly motorRevisionId: string;
  readonly propellerRevisionId: string;
  readonly batteryRevisionId: string;
  readonly escRevisionId: string;
  readonly fcRevisionId?: string;
  readonly cameraRevisionId?: string;
  readonly vtxRevisionId?: string;
  readonly receiverRevisionId?: string;
  readonly armPositions: readonly { x: number; y: number; z: number }[];
  readonly rotations?: readonly ('cw' | 'ccw')[];
}): { selections: ComponentSelection[]; topology: TopologyEdge[] } {
  const rotations = input.rotations ?? (['cw', 'ccw', 'cw', 'ccw'] as const);
  const selections: ComponentSelection[] = [
    {
      selectionId: 'frame',
      componentRevisionId: asComponentRevisionId(input.frameRevisionId),
      quantity: 1,
      slotId: asInstallationSlotId('slot-frame'),
      mountPointId: asMountPointId('mount-origin'),
      transform: identityTransform(),
      configuration: {},
    },
  ];

  const topology: TopologyEdge[] = [];

  for (let i = 0; i < 4; i++) {
    const arm = input.armPositions[i] ?? { x: 0, y: 0, z: 0 };
    const motorId = `motor-${i}`;
    const propId = `prop-${i}`;
    selections.push({
      selectionId: motorId,
      componentRevisionId: asComponentRevisionId(input.motorRevisionId),
      quantity: 1,
      slotId: asInstallationSlotId(`slot-motor-${i}`),
      mountPointId: asMountPointId(`mount-arm-${i}`),
      transform: {
        position: vec3(arm.x, arm.y, arm.z),
        orientationEulerRad: { x: 0, y: 0, z: 0 },
      },
      configuration: {},
    });
    selections.push({
      selectionId: propId,
      componentRevisionId: asComponentRevisionId(input.propellerRevisionId),
      quantity: 1,
      slotId: asInstallationSlotId(`slot-prop-${i}`),
      mountPointId: asMountPointId(`mount-motor-shaft-${i}`),
      transform: {
        position: vec3(arm.x, arm.y, arm.z + 0.01),
        orientationEulerRad: { x: 0, y: 0, z: 0 },
      },
      propellerRotation: rotations[i],
      configuration: {},
    });
    topology.push({ fromSelectionId: motorId, toSelectionId: 'frame', kind: 'mounts-on' });
    topology.push({ fromSelectionId: propId, toSelectionId: motorId, kind: 'propels' });
  }

  selections.push({
    selectionId: 'battery',
    componentRevisionId: asComponentRevisionId(input.batteryRevisionId),
    quantity: 1,
    slotId: asInstallationSlotId('slot-battery'),
    mountPointId: asMountPointId('mount-battery'),
    transform: {
      position: vec3(0, 0, -0.02),
      orientationEulerRad: { x: 0, y: 0, z: 0 },
    },
    configuration: {},
  });
  selections.push({
    selectionId: 'esc',
    componentRevisionId: asComponentRevisionId(input.escRevisionId),
    quantity: 1,
    slotId: asInstallationSlotId('slot-esc'),
    mountPointId: asMountPointId('mount-stack'),
    transform: identityTransform(),
    configuration: {},
  });

  topology.push({ fromSelectionId: 'battery', toSelectionId: 'frame', kind: 'mounts-on' });
  topology.push({ fromSelectionId: 'esc', toSelectionId: 'frame', kind: 'mounts-on' });
  topology.push({ fromSelectionId: 'battery', toSelectionId: 'esc', kind: 'powers' });

  for (let i = 0; i < 4; i++) {
    topology.push({
      fromSelectionId: 'esc',
      toSelectionId: `motor-${i}`,
      kind: 'controls',
    });
  }

  const optional: Array<[string, string | undefined, string]> = [
    ['fc', input.fcRevisionId, 'slot-fc'],
    ['camera', input.cameraRevisionId, 'slot-camera'],
    ['vtx', input.vtxRevisionId, 'slot-vtx'],
    ['receiver', input.receiverRevisionId, 'slot-receiver'],
  ];

  for (const [id, rev, slot] of optional) {
    if (!rev) continue;
    selections.push({
      selectionId: id,
      componentRevisionId: asComponentRevisionId(rev),
      quantity: 1,
      slotId: asInstallationSlotId(slot),
      mountPointId: asMountPointId(`mount-${id}`),
      transform: identityTransform(),
      configuration: {},
    });
    topology.push({ fromSelectionId: id, toSelectionId: 'frame', kind: 'mounts-on' });
    topology.push({ fromSelectionId: 'battery', toSelectionId: id, kind: 'powers' });
  }

  return { selections, topology };
}

export function createDraft(input: {
  readonly buildId: string;
  readonly name: string;
  readonly description?: string;
  readonly catalogReleaseId: string;
  readonly selections: ComponentSelection[];
  readonly topology: TopologyEdge[];
  readonly tuning?: UserTuningValues;
}): DroneBuildDraft {
  return {
    buildId: asDroneBuildId(input.buildId),
    schemaVersion: '1.1.0',
    catalogReleaseId: asCatalogReleaseId(input.catalogReleaseId),
    name: input.name,
    description: input.description ?? '',
    selections: [...input.selections],
    topology: [...input.topology],
    tuning: input.tuning ?? { ...DEFAULT_TUNING },
    mutable: true,
  };
}

export function publishRevision(
  draft: DroneBuildDraft,
  revisionId: string,
  parentRevisionId: string | null = null,
): DroneBuildRevision {
  return {
    revisionId: asDroneBuildRevisionId(revisionId),
    buildId: draft.buildId,
    schemaVersion: draft.schemaVersion,
    parentRevisionId: parentRevisionId
      ? asDroneBuildRevisionId(parentRevisionId)
      : null,
    catalogReleaseId: draft.catalogReleaseId,
    selections: draft.selections.map((s) => ({ ...s })),
    topology: draft.topology.map((e) => ({ ...e })),
    tuning: { ...draft.tuning },
    notes: '',
    immutable: true,
  };
}

export function resolveSelectionRevisionIds(
  revision: DroneBuildRevision,
): ComponentRevisionId[] {
  return revision.selections.map((s) => s.componentRevisionId);
}
