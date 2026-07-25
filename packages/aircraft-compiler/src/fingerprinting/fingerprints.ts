import {
  asArtifactFingerprint,
  asBuildFingerprint,
  asCompilationContextFingerprint,
  asRuntimeCompatibilitySignature,
  hashCanonical,
  V1_1_VERSION_MANIFEST,
  type VersionManifest,
} from '@fpv/engineering-kernel';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';
import type { ValidationPolicy } from '@fpv/compatibility-engine';
import { datasetPolicyFingerprintPayload } from '@fpv/propulsion-data';
import type { CompiledAircraftSpecification } from '../outputs/specification';

/**
 * Build identity fingerprint — normalized build selections/topology/tuning only.
 * Does NOT include validation policy, competition mode, display name, notes,
 * owner identity, timestamps, or presentation metadata.
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
 *
 * Runtime adapter / flight-model compatibility versions are intentionally
 * excluded; they belong in RuntimeCompatibilitySignature (ADR-014 / ADR-015).
 * There is no separate numeric-policy version — policyVersion covers limit fields.
 *
 * Property order cannot affect the hash (canonical sorted-key serialization).
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
    datasetPolicy: datasetPolicyFingerprintPayload(policy.datasetPolicy),
    validationRulesVersion: manifest.validationRulesVersion,
    engineeringModelVersion: manifest.engineeringModelVersion,
    propulsionModelVersion: manifest.propulsionModelVersion,
    aerodynamicModelVersion: manifest.aerodynamicModelVersion,
    compilerVersion: manifest.compilerVersion,
  };
  return asCompilationContextFingerprint(hashCanonical(payload));
}

/**
 * Runtime compatibility signature — adapter + flight-model versions only.
 * Use wherever solver-facing mapping must stay compatible; do not substitute
 * a physical-only ArtifactFingerprint for runtime compatibility checks.
 */
export function fingerprintRuntimeCompatibility(
  manifest: VersionManifest = V1_1_VERSION_MANIFEST,
): ReturnType<typeof asRuntimeCompatibilitySignature> {
  const payload = {
    runtimeAdapterVersion: manifest.runtimeAdapterVersion,
    flightModelCompatibilityVersion: manifest.flightModelCompatibilityVersion,
  };
  return asRuntimeCompatibilitySignature(hashCanonical(payload));
}

/**
 * ArtifactFingerprint — physical engineering output identity only.
 *
 * Intentionally excludes flightRuntime / runtime-adapter outputs so adapter
 * tuning changes do not rewrite physical goldens. Consumers that need runtime
 * compatibility must also check RuntimeCompatibilitySignature.
 */
export function fingerprintCompiledArtifact(
  spec: Omit<
    CompiledAircraftSpecification,
    | 'buildFingerprint'
    | 'compilationContextFingerprint'
    | 'artifactFingerprint'
    | 'runtimeCompatibilitySignature'
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
        source: {
          dataSourceMode: u.source.dataSourceMode,
          datasetRevisionId: u.source.datasetRevisionId,
          datasetFingerprint: u.source.datasetFingerprint,
          matchQuality: u.source.matchQuality,
          confidence: u.source.confidence,
          fallbackReason: u.source.fallbackReason,
          maximumTestedThrustN: u.source.maximumTestedThrustN,
          estimatedOperatingThrustN: u.source.estimatedOperatingThrustN,
          calibrationRevisionId: u.source.calibrationRevisionId,
          calibrationFingerprint: u.source.calibrationFingerprint,
          modelVersion: u.source.modelVersion,
        },
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
    versionManifest: {
      engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
      compilerVersion: spec.versionManifest.compilerVersion,
      propulsionModelVersion: spec.versionManifest.propulsionModelVersion,
    },
  };
  return asArtifactFingerprint(hashCanonical(payload));
}
