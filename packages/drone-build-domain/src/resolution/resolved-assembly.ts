import type { ComponentRevision, ComponentType } from '@fpv/component-catalog';
import type {
  ComponentSelection,
  DroneBuildRevision,
  PropRotation,
  TopologyEdge,
  Transform3,
} from '../domain/models';

export type ResolutionDiagnosticSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface ResolutionDiagnostic {
  readonly code: string;
  readonly severity: ResolutionDiagnosticSeverity;
  readonly messageKey: string;
  readonly relatedSelectionIds: readonly string[];
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Explicit motor↔propeller pairing resolved from topology (`propels` edges),
 * never from array index order.
 */
export interface ResolvedPropulsionUnit {
  readonly motorSelection: ComponentSelection;
  readonly propellerSelection: ComponentSelection;
  readonly motorComponent: ComponentRevision;
  readonly propellerComponent: ComponentRevision;
  readonly position: Transform3['position'];
  readonly orientation: Transform3['orientationEulerRad'];
  readonly rotationDirection: PropRotation;
  readonly electricalPath: {
    readonly batterySelectionId: string | null;
    readonly escSelectionId: string | null;
  };
}

export interface ResolvedAssembly {
  readonly revision: DroneBuildRevision;
  /** Only component revisions selected by the active build. */
  readonly selectedComponents: ReadonlyMap<string, ComponentRevision>;
  readonly selectionById: ReadonlyMap<string, ComponentSelection>;
  readonly componentBySelectionId: ReadonlyMap<string, ComponentRevision>;
  readonly selectionsByType: ReadonlyMap<ComponentType, readonly ComponentSelection[]>;
  readonly topology: readonly TopologyEdge[];
  readonly propulsionUnits: readonly ResolvedPropulsionUnit[];
  readonly frameSelection: ComponentSelection | null;
  readonly frameComponent: ComponentRevision | null;
  readonly batterySelection: ComponentSelection | null;
  readonly batteryComponent: ComponentRevision | null;
  readonly escSelections: readonly ComponentSelection[];
  readonly escComponents: readonly ComponentRevision[];
  readonly spatialTransforms: ReadonlyMap<string, Transform3>;
  readonly expectedMotorCount: number | null;
  readonly diagnostics: readonly ResolutionDiagnostic[];
  readonly resolutionOk: boolean;
}

function diag(
  code: string,
  severity: ResolutionDiagnosticSeverity,
  messageKey: string,
  relatedSelectionIds: string[] = [],
  parameters: Record<string, string | number | boolean> = {},
): ResolutionDiagnostic {
  return { code, severity, messageKey, relatedSelectionIds, parameters };
}

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n);
}

function transformFinite(t: Transform3): boolean {
  const p = t.position;
  const o = t.orientationEulerRad;
  return (
    isFiniteNumber(p.x) &&
    isFiniteNumber(p.y) &&
    isFiniteNumber(p.z) &&
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.z)
  );
}

/**
 * Authoritative join of a normalized build revision with only the component
 * revisions it selects. Downstream validation and engineering must consume this
 * model — never search the full catalog for selected hardware.
 */
export function resolveAssembly(
  revision: DroneBuildRevision,
  catalog: ReadonlyMap<string, ComponentRevision> | readonly ComponentRevision[],
): ResolvedAssembly {
  const catalogMap =
    catalog instanceof Map
      ? catalog
      : new Map((catalog as readonly ComponentRevision[]).map((c) => [c.revisionId as string, c]));

  const diagnostics: ResolutionDiagnostic[] = [];
  const selectionById = new Map<string, ComponentSelection>();
  const selectedComponents = new Map<string, ComponentRevision>();
  const componentBySelectionId = new Map<string, ComponentRevision>();
  const selectionsByType = new Map<ComponentType, ComponentSelection[]>();
  const spatialTransforms = new Map<string, Transform3>();

  for (const s of revision.selections) {
    if (selectionById.has(s.selectionId)) {
      diagnostics.push(
        diag('RES_DUPLICATE_SELECTION_ID', 'fatal', 'validation.resolution.duplicateSelectionId', [
          s.selectionId,
        ]),
      );
      continue;
    }
    selectionById.set(s.selectionId, s);
    spatialTransforms.set(s.selectionId, s.transform);

    if (!Number.isFinite(s.quantity) || s.quantity <= 0 || !Number.isInteger(s.quantity)) {
      diagnostics.push(
        diag(
          'RES_INVALID_QUANTITY',
          'error',
          'validation.resolution.invalidQuantity',
          [s.selectionId],
          { quantity: s.quantity },
        ),
      );
    }
    if (!transformFinite(s.transform)) {
      diagnostics.push(
        diag('RES_NON_FINITE_TRANSFORM', 'error', 'validation.resolution.nonFiniteTransform', [
          s.selectionId,
        ]),
      );
    }

    const component = catalogMap.get(s.componentRevisionId);
    if (!component) {
      diagnostics.push(
        diag(
          'RES_MISSING_REVISION',
          'fatal',
          'validation.resolution.missingRevision',
          [s.selectionId],
          { revisionId: s.componentRevisionId },
        ),
      );
      continue;
    }
    selectedComponents.set(component.revisionId, component);
    componentBySelectionId.set(s.selectionId, component);
    const bucket = selectionsByType.get(component.componentType) ?? [];
    bucket.push(s);
    selectionsByType.set(component.componentType, bucket);
  }

  const frameSelection = (selectionsByType.get('frame') ?? [])[0] ?? null;
  const frameComponent = frameSelection
    ? (componentBySelectionId.get(frameSelection.selectionId) ?? null)
    : null;
  const batterySelection = (selectionsByType.get('battery') ?? [])[0] ?? null;
  const batteryComponent = batterySelection
    ? (componentBySelectionId.get(batterySelection.selectionId) ?? null)
    : null;
  const escSelections = selectionsByType.get('esc') ?? [];
  const escComponents = escSelections
    .map((s) => componentBySelectionId.get(s.selectionId))
    .filter((c): c is ComponentRevision => !!c);

  let expectedMotorCount: number | null = null;
  if (frameComponent && frameComponent.engineering.type === 'frame') {
    expectedMotorCount = frameComponent.engineering.frame.armPositions.length;
  }

  const primaryEscId = escSelections[0]?.selectionId ?? null;
  const batteryId = batterySelection?.selectionId ?? null;

  const propelEdges = revision.topology.filter((e) => e.kind === 'propels');
  const propulsionUnits: ResolvedPropulsionUnit[] = [];
  const motorsSeen = new Set<string>();
  const propsSeen = new Set<string>();

  for (const edge of propelEdges) {
    const propSel = selectionById.get(edge.fromSelectionId);
    const motorSel = selectionById.get(edge.toSelectionId);
    if (!propSel || !motorSel) {
      diagnostics.push(
        diag(
          'RES_PROPEL_ENDPOINT',
          'error',
          'validation.resolution.propelEndpointMissing',
          [edge.fromSelectionId, edge.toSelectionId],
        ),
      );
      continue;
    }
    const propComp = componentBySelectionId.get(propSel.selectionId);
    const motorComp = componentBySelectionId.get(motorSel.selectionId);
    if (!propComp || propComp.componentType !== 'propeller') {
      diagnostics.push(
        diag('RES_PROPEL_FROM_NOT_PROP', 'error', 'validation.resolution.propelFromNotPropeller', [
          edge.fromSelectionId,
        ]),
      );
      continue;
    }
    if (!motorComp || motorComp.componentType !== 'motor') {
      diagnostics.push(
        diag('RES_PROPEL_TO_NOT_MOTOR', 'error', 'validation.resolution.propelToNotMotor', [
          edge.toSelectionId,
        ]),
      );
      continue;
    }
    if (propsSeen.has(propSel.selectionId) || motorsSeen.has(motorSel.selectionId)) {
      diagnostics.push(
        diag(
          'RES_DUPLICATE_PROPULSION',
          'error',
          'validation.resolution.duplicatePropulsionEdge',
          [propSel.selectionId, motorSel.selectionId],
        ),
      );
      continue;
    }
    propsSeen.add(propSel.selectionId);
    motorsSeen.add(motorSel.selectionId);

    const rotation: PropRotation =
      propSel.propellerRotation ??
      (propulsionUnits.length % 2 === 0 ? 'cw' : 'ccw');

    propulsionUnits.push({
      motorSelection: motorSel,
      propellerSelection: propSel,
      motorComponent: motorComp,
      propellerComponent: propComp,
      position: {
        x: motorSel.transform.position.x,
        y: motorSel.transform.position.y,
        z: motorSel.transform.position.z,
      },
      orientation: { ...motorSel.transform.orientationEulerRad },
      rotationDirection: rotation,
      electricalPath: {
        batterySelectionId: batteryId,
        escSelectionId: primaryEscId,
      },
    });
  }

  // Stable order by motor selection id — never catalog/array insertion order.
  propulsionUnits.sort((a, b) =>
    a.motorSelection.selectionId < b.motorSelection.selectionId
      ? -1
      : a.motorSelection.selectionId > b.motorSelection.selectionId
        ? 1
        : 0,
  );

  const hasFatal = diagnostics.some((d) => d.severity === 'fatal');
  const hasError = diagnostics.some((d) => d.severity === 'error');

  return {
    revision,
    selectedComponents,
    selectionById,
    componentBySelectionId,
    selectionsByType,
    topology: revision.topology,
    propulsionUnits,
    frameSelection,
    frameComponent,
    batterySelection,
    batteryComponent,
    escSelections,
    escComponents,
    spatialTransforms,
    expectedMotorCount,
    diagnostics,
    resolutionOk: !hasFatal && !hasError,
  };
}
