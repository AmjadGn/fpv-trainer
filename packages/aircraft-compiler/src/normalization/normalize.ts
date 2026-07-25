import { stableSortByKey } from '@fpv/engineering-kernel';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';

/** Produce a canonical, presentation-free build input for hashing / pipelines. */
export function normalizeBuildRevision(
  revision: DroneBuildRevision,
): DroneBuildRevision {
  const selections = stableSortByKey(revision.selections, (s) => s.selectionId).map(
    (s) => ({
      selectionId: s.selectionId,
      componentRevisionId: s.componentRevisionId,
      quantity: s.quantity,
      slotId: s.slotId,
      mountPointId: s.mountPointId,
      transform: {
        position: {
          x: s.transform.position.x,
          y: s.transform.position.y,
          z: s.transform.position.z,
        },
        orientationEulerRad: {
          x: s.transform.orientationEulerRad.x,
          y: s.transform.orientationEulerRad.y,
          z: s.transform.orientationEulerRad.z,
        },
      },
      propellerRotation: s.propellerRotation,
      configuration: Object.fromEntries(
        Object.entries(s.configuration).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
    }),
  );

  const topology = stableSortByKey(
    revision.topology,
    (e) => `${e.kind}:${e.fromSelectionId}->${e.toSelectionId}`,
  );

  return {
    revisionId: revision.revisionId,
    buildId: revision.buildId,
    schemaVersion: revision.schemaVersion,
    parentRevisionId: revision.parentRevisionId,
    catalogReleaseId: revision.catalogReleaseId,
    selections,
    topology,
    tuning: {
      thrustCurveExponent: revision.tuning.thrustCurveExponent,
      throttleExpo: revision.tuning.throttleExpo,
      stabilizationBias: revision.tuning.stabilizationBias,
      rateProfileHint: revision.tuning.rateProfileHint,
    },
    notes: '',
    immutable: true,
  };
}
