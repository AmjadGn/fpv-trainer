import {
  asArtifactFingerprint,
  asBuildFingerprint,
  hashCanonical,
  V1_1_VERSION_MANIFEST,
  type VersionManifest,
} from '@fpv/engineering-kernel';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';
import type { CompiledAircraftSpecification } from '../outputs/specification';

export function fingerprintBuildInput(
  normalized: DroneBuildRevision,
  manifest: VersionManifest = V1_1_VERSION_MANIFEST,
): ReturnType<typeof asBuildFingerprint> {
  const payload = {
    schemaVersion: normalized.schemaVersion,
    catalogReleaseId: normalized.catalogReleaseId,
    selections: normalized.selections.map((s) => ({
      selectionId: s.selectionId,
      componentRevisionId: s.componentRevisionId,
      quantity: s.quantity,
      slotId: s.slotId,
      mountPointId: s.mountPointId,
      transform: s.transform,
      propellerRotation: s.propellerRotation ?? null,
      configuration: s.configuration,
    })),
    topology: normalized.topology,
    tuning: normalized.tuning,
    validationRulesVersion: manifest.validationRulesVersion,
    engineeringModelVersion: manifest.engineeringModelVersion,
  };
  return asBuildFingerprint(hashCanonical(payload));
}

export function fingerprintCompiledArtifact(
  spec: Omit<
    CompiledAircraftSpecification,
    'buildFingerprint' | 'artifactFingerprint'
  >,
): ReturnType<typeof asArtifactFingerprint> {
  const payload = {
    identity: spec.identity,
    physicalAssembly: spec.physicalAssembly,
    propulsion: {
      totalMaxThrustNewtons: spec.propulsion.totalMaxThrustNewtons,
      thrustToWeight: spec.propulsion.thrustToWeight,
      hoverThrottleEstimate: spec.propulsion.hoverThrottleEstimate,
      units: spec.propulsion.units.map((u) => ({
        motorSelectionId: u.motorSelectionId,
        maxThrustNewtons: u.maxThrustNewtons,
        position: u.position,
        rotation: u.rotation,
        thrustCurve: u.thrustCurve,
      })),
    },
    electrical: spec.electrical,
    aerodynamics: spec.aerodynamics,
    controlAuthority: spec.controlAuthority,
    flightRuntime: spec.flightRuntime,
    versionManifest: spec.versionManifest,
  };
  return asArtifactFingerprint(hashCanonical(payload));
}
