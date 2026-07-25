import {
  asArtifactFingerprint,
  asBuildFingerprint,
  asCompilationContextFingerprint,
  hashCanonical,
  V1_1_VERSION_MANIFEST,
  type VersionManifest,
} from '@fpv/engineering-kernel';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';
import type { ValidationPolicy } from '@fpv/compatibility-engine';
import type { CompiledAircraftSpecification } from '../outputs/specification';

/**
 * Build identity fingerprint — normalized build selections/topology/tuning only.
 * Does NOT include validation policy or competition mode.
 */
export function fingerprintBuildInput(
  normalized: DroneBuildRevision,
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
  };
  return asBuildFingerprint(hashCanonical(payload));
}

/**
 * Compilation-context fingerprint — policy + model/compiler versions that can
 * change eligibility or compiled validation outcomes.
 */
export function fingerprintCompilationContext(
  policy: ValidationPolicy,
  manifest: VersionManifest = V1_1_VERSION_MANIFEST,
): ReturnType<typeof asCompilationContextFingerprint> {
  const payload = {
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    maxTakeoffMassKg: policy.maxTakeoffMassKg,
    allowedComponentSources: [...policy.allowedComponentSources].sort(),
    requireOfficialCatalog: policy.requireOfficialCatalog,
    minThrustToWeight: policy.minThrustToWeight,
    maxCellCount: policy.maxCellCount,
    maxPropDiameterM: policy.maxPropDiameterM,
    validationRulesVersion: manifest.validationRulesVersion,
    engineeringModelVersion: manifest.engineeringModelVersion,
    propulsionModelVersion: manifest.propulsionModelVersion,
    aerodynamicModelVersion: manifest.aerodynamicModelVersion,
    compilerVersion: manifest.compilerVersion,
    runtimeAdapterVersion: manifest.runtimeAdapterVersion,
  };
  return asCompilationContextFingerprint(hashCanonical(payload));
}

export function fingerprintCompiledArtifact(
  spec: Omit<
    CompiledAircraftSpecification,
    'buildFingerprint' | 'compilationContextFingerprint' | 'artifactFingerprint'
  >,
): ReturnType<typeof asArtifactFingerprint> {
  const payload = {
    identity: spec.identity,
    physicalAssembly: spec.physicalAssembly,
    propulsion: {
      totalMaxThrustNewtons: spec.propulsion.totalMaxThrustNewtons,
      thrustToWeight: spec.propulsion.thrustToWeight,
      hoverThrottleEstimate: spec.propulsion.hoverThrottleEstimate,
      modelVersion: spec.propulsion.modelVersion,
      units: spec.propulsion.units.map((u) => ({
        motorSelectionId: u.motorSelectionId,
        propellerSelectionId: u.propellerSelectionId,
        maxThrustNewtons: u.maxThrustNewtons,
        position: u.position,
        rotation: u.rotation,
        thrustCurve: u.thrustCurve,
        dataProvenance: u.dataProvenance,
      })),
    },
    electrical: spec.electrical,
    aerodynamics: {
      modelVersion: spec.aerodynamics.model.modelVersion,
      linearDrag: spec.aerodynamics.model.linearDrag,
      frontalDragCoefficient: spec.aerodynamics.model.frontalDragCoefficient,
    },
    controlAuthority: {
      maxRollTorque: spec.controlAuthority.maxRollTorque,
      maxPitchTorque: spec.controlAuthority.maxPitchTorque,
      maxYawTorque: spec.controlAuthority.maxYawTorque,
      rollAcceleration: spec.controlAuthority.rollAcceleration,
      pitchAcceleration: spec.controlAuthority.pitchAcceleration,
      yawAcceleration: spec.controlAuthority.yawAcceleration,
    },
    // Physical SI assembly + engineering; runtime adapter outputs are excluded
    // from artifact identity so adapter tuning changes do not rewrite physical goldens.
    versionManifest: {
      engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
      compilerVersion: spec.versionManifest.compilerVersion,
      propulsionModelVersion: spec.versionManifest.propulsionModelVersion,
    },
  };
  return asArtifactFingerprint(hashCanonical(payload));
}
