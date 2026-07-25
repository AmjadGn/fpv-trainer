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
  Transform3,
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

function cloneTransform(t: Transform3): Transform3 {
  return {
    position: { x: t.position.x, y: t.position.y, z: t.position.z },
    orientationEulerRad: {
      x: t.orientationEulerRad.x,
      y: t.orientationEulerRad.y,
      z: t.orientationEulerRad.z,
    },
  };
}

function cloneSelection(s: ComponentSelection): ComponentSelection {
  return {
    selectionId: s.selectionId,
    componentRevisionId: s.componentRevisionId,
    quantity: s.quantity,
    slotId: s.slotId,
    mountPointId: s.mountPointId,
    transform: cloneTransform(s.transform),
    propellerRotation: s.propellerRotation,
    configuration: { ...s.configuration },
  };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  for (const key of Object.keys(value as object)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
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
    selections: input.selections.map(cloneSelection),
    topology: input.topology.map((e) => ({ ...e })),
    tuning: input.tuning ? { ...input.tuning } : { ...DEFAULT_TUNING },
    mutable: true,
  };
}

/**
 * Publish an immutable revision from a mutable draft.
 * Deep-copies all nested selections/transforms/topology so the draft cannot
 * mutate the published revision through shared references.
 */
export function publishRevision(
  draft: DroneBuildDraft,
  revisionId: string,
  parentRevisionId: string | null = null,
): DroneBuildRevision {
  const revision: DroneBuildRevision = {
    revisionId: asDroneBuildRevisionId(revisionId),
    buildId: draft.buildId,
    schemaVersion: draft.schemaVersion,
    parentRevisionId: parentRevisionId
      ? asDroneBuildRevisionId(parentRevisionId)
      : null,
    catalogReleaseId: draft.catalogReleaseId,
    selections: draft.selections.map(cloneSelection),
    topology: draft.topology.map((e) => ({ ...e })),
    tuning: { ...draft.tuning },
    notes: '',
    immutable: true,
  };

  // Deep-freeze in non-production to catch accidental mutation early.
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  const env = g.process?.env?.NODE_ENV;
  if (env !== 'production') {
    return deepFreeze(revision);
  }
  return revision;
}

export function resolveSelectionRevisionIds(
  revision: DroneBuildRevision,
): ComponentRevisionId[] {
  return revision.selections.map((s) => s.componentRevisionId);
}

/** Canonical content for idempotent immutable insert comparisons. */
export function revisionCanonicalContent(revision: DroneBuildRevision): unknown {
  return {
    schemaVersion: revision.schemaVersion,
    buildId: revision.buildId,
    parentRevisionId: revision.parentRevisionId,
    catalogReleaseId: revision.catalogReleaseId,
    selections: revision.selections,
    topology: revision.topology,
    tuning: revision.tuning,
    notes: revision.notes,
  };
}
