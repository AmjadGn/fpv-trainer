import {
  V1_1_VERSION_MANIFEST,
  type VersionManifest,
} from '@fpv/engineering-kernel';
import type { ComponentRevision } from '@fpv/component-catalog';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';
import {
  executeValidation,
  FREE_FLIGHT_POLICY,
  type ValidationPolicy,
  type ValidationReport,
} from '@fpv/compatibility-engine';
import {
  aggregateMass,
  solveCenterOfMass,
  estimateInertia,
  solveElectricalSystem,
  solvePropulsion,
  approximateAerodynamics,
  analyzeControlAuthority,
  calculatePerformanceMetrics,
  validateEngineeringIntegrity,
} from '@fpv/aircraft-engineering';
import { normalizeBuildRevision } from '../normalization/normalize';
import {
  fingerprintBuildInput,
  fingerprintCompiledArtifact,
} from '../fingerprinting/fingerprints';
import {
  createMemoryCompilationCache,
  type CompilationCache,
} from './cache';
import type {
  CompilationResult,
  CompilationTraceStage,
  CompiledAircraftSpecification,
} from '../outputs/specification';

export interface CompileOptions {
  readonly policy?: ValidationPolicy;
  readonly versionManifest?: VersionManifest;
  readonly cache?: CompilationCache;
  readonly skipCache?: boolean;
  readonly collectTrace?: boolean;
}

function stage(
  name: string,
  start: number,
  warnings: string[] = [],
  collect: boolean,
): CompilationTraceStage | null {
  if (!collect) return null;
  return {
    stage: name,
    durationMs: Math.max(0, Date.now() - start),
    warnings,
  };
}

export function compileAircraft(
  revision: DroneBuildRevision,
  componentList: readonly ComponentRevision[],
  options: CompileOptions = {},
): CompilationResult {
  const collectTrace = options.collectTrace ?? false;
  const trace: CompilationTraceStage[] = [];
  const manifest = options.versionManifest ?? V1_1_VERSION_MANIFEST;
  const policy = options.policy ?? FREE_FLIGHT_POLICY;
  const cache = options.cache ?? createMemoryCompilationCache();

  let t0 = Date.now();
  const components = new Map<string, ComponentRevision>();
  for (const c of componentList) {
    components.set(c.revisionId, c);
  }
  const s1 = stage('component-resolution', t0, [], collectTrace);
  if (s1) trace.push(s1);

  t0 = Date.now();
  const normalized = normalizeBuildRevision(revision);
  const buildFingerprint = fingerprintBuildInput(normalized, manifest);
  const s2 = stage('normalization', t0, [], collectTrace);
  if (s2) trace.push(s2);

  if (!options.skipCache) {
    const cached = cache.get(
      buildFingerprint,
      manifest.engineeringModelVersion,
      manifest.compilerVersion,
    );
    if (cached) {
      return {
        ok: cached.validation.canCompile,
        specification: cached,
        validation: cached.validation,
        integrityIssues: cached.diagnostics.integrityIssues,
        trace: collectTrace
          ? [...trace, { stage: 'cache-hit', durationMs: 0, warnings: [] }]
          : [],
      };
    }
  }

  t0 = Date.now();
  const validation: ValidationReport = executeValidation(
    normalized,
    components,
    policy,
  );
  const s3 = stage('validation', t0, [], collectTrace);
  if (s3) trace.push(s3);

  if (!validation.canCompile) {
    return {
      ok: false,
      specification: null,
      validation,
      integrityIssues: [],
      trace,
    };
  }

  t0 = Date.now();
  const mass = aggregateMass(normalized.selections, components);
  const s4 = stage('mass', t0, [], collectTrace);
  if (s4) trace.push(s4);

  t0 = Date.now();
  const com = solveCenterOfMass(normalized.selections, components);
  const s5 = stage('center-of-mass', t0, [], collectTrace);
  if (s5) trace.push(s5);

  t0 = Date.now();
  const inertia = estimateInertia(
    normalized.selections,
    components,
    com,
    mass.totalTakeoffMassKg,
  );
  const s6 = stage('inertia', t0, [], collectTrace);
  if (s6) trace.push(s6);

  t0 = Date.now();
  const electrical = solveElectricalSystem(normalized.selections, components);
  const s7 = stage('electrical', t0, [], collectTrace);
  if (s7) trace.push(s7);

  t0 = Date.now();
  const propulsion = solvePropulsion(
    normalized.selections,
    components,
    electrical,
    mass.totalTakeoffMassKg,
    normalized.tuning,
  );
  const s8 = stage('propulsion', t0, [], collectTrace);
  if (s8) trace.push(s8);

  t0 = Date.now();
  const aero = approximateAerodynamics(
    normalized.selections,
    components,
    mass.totalTakeoffMassKg,
  );
  const s9 = stage('aerodynamics', t0, [], collectTrace);
  if (s9) trace.push(s9);

  t0 = Date.now();
  const authority = analyzeControlAuthority(propulsion, inertia);
  const s10 = stage('control-authority', t0, [], collectTrace);
  if (s10) trace.push(s10);

  t0 = Date.now();
  const performance = calculatePerformanceMetrics(
    mass,
    propulsion,
    electrical,
    authority,
    aero,
  );
  const s11 = stage('performance', t0, [], collectTrace);
  if (s11) trace.push(s11);

  t0 = Date.now();
  const integrityIssues = validateEngineeringIntegrity({
    mass,
    inertia,
    propulsion,
    electrical,
  });
  const s12 = stage('integrity', t0, [], collectTrace);
  if (s12) trace.push(s12);

  if (integrityIssues.some((i) => i.fatal)) {
    return {
      ok: false,
      specification: null,
      validation,
      integrityIssues,
      trace,
    };
  }

  const frame = [...components.values()].find((c) => c.componentType === 'frame');
  const prop = [...components.values()].find((c) => c.componentType === 'propeller');
  const wheelbase =
    frame && frame.engineering.type === 'frame'
      ? frame.engineering.frame.wheelbaseMeters
      : 0.2;
  const propDiameter =
    prop && prop.engineering.type === 'propeller'
      ? prop.engineering.propeller.diameterMeters
      : 0.12;

  const avgSpoolUp =
    propulsion.units.reduce((a, u) => a + u.spoolUpTimeS, 0) /
    Math.max(1, propulsion.units.length);
  const avgSpoolDown =
    propulsion.units.reduce((a, u) => a + u.spoolDownTimeS, 0) /
    Math.max(1, propulsion.units.length);
  const avgResponse =
    propulsion.units.reduce((a, u) => a + u.responseTimeS, 0) /
    Math.max(1, propulsion.units.length);

  const dims = frame?.dimensions ?? {
    widthMeters: wheelbase * 1.2,
    lengthMeters: wheelbase * 1.2,
    heightMeters: 0.05,
  };

  const flightRuntime = {
    massKg: mass.totalTakeoffMassKg,
    maxThrustNewtons: propulsion.totalMaxThrustNewtons,
    hoverThrottleRatio: propulsion.hoverThrottleEstimate,
    thrustCurveExponent: normalized.tuning.thrustCurveExponent,
    motorSpoolUpTime: avgSpoolUp,
    motorSpoolDownTime: avgSpoolDown,
    motorResponseTime: avgResponse,
    linearDrag: aero.linearDrag,
    frontalDragCoefficient: aero.frontalDragCoefficient,
    lateralDragCoefficient: aero.lateralDragCoefficient,
    verticalDragCoefficient: aero.verticalDragCoefficient,
    angularDrag: Math.max(0.05, aero.angularDrag),
    rollInertia: inertia.roll,
    pitchInertia: inertia.pitch,
    yawInertia: inertia.yaw,
    rollAcceleration: authority.rollAcceleration,
    pitchAcceleration: authority.pitchAcceleration,
    yawAcceleration: authority.yawAcceleration,
    maxRollRate: authority.maxRollRate,
    maxPitchRate: authority.maxPitchRate,
    maxYawRate: authority.maxYawRate,
    groundEffectStrength: aero.groundEffectStrength,
    groundEffectHeight: aero.groundEffectHeight,
    propWashStrength: aero.propWashStrength,
    windSensitivity: aero.windSensitivity,
    glideEfficiency: aero.glideEfficiency,
    centerOfMassOffset: { ...com.offsetFromOrigin },
    nominalVoltage: electrical.nominalVoltage,
    batteryCellCount: electrical.cellCount,
    batteryCapacityMah: electrical.capacityAh * 1000,
    safetyClamps: {
      maxAngularAcceleration: 50,
      minAngularDrag: 0.05,
    },
  };

  const confidenceNotes: string[] = [];
  if (com.confidence !== 'high') {
    confidenceNotes.push(`center-of-mass confidence: ${com.confidence}`);
  }
  confidenceNotes.push('aerodynamics: approximate model 1.1.0');
  confidenceNotes.push('propulsion: thrust hints + prop coefficients');

  const partial = {
    identity: {
      sourceBuildId: normalized.buildId,
      buildRevisionId: normalized.revisionId,
      catalogReleaseId: normalized.catalogReleaseId,
      compilerVersion: manifest.compilerVersion,
      engineeringModelVersion: manifest.engineeringModelVersion,
    },
    physicalAssembly: {
      totalMassKg: mass.totalTakeoffMassKg,
      dryMassKg: mass.dryMassKg,
      batteryMassKg: mass.batteryMassKg,
      centerOfMass: { x: com.x, y: com.y, z: com.z },
      inertia: {
        roll: inertia.roll,
        pitch: inertia.pitch,
        yaw: inertia.yaw,
      },
      dimensions: {
        widthMeters: dims.widthMeters,
        lengthMeters: dims.lengthMeters,
        heightMeters: dims.heightMeters,
        wheelbaseMeters: wheelbase,
      },
      motorPositions: propulsion.units.map((u) => ({ ...u.position })),
      propellerDiameterMeters: propDiameter,
    },
    propulsion: {
      units: propulsion.units,
      totalMaxThrustNewtons: propulsion.totalMaxThrustNewtons,
      thrustToWeight: propulsion.thrustToWeight,
      hoverThrottleEstimate: propulsion.hoverThrottleEstimate,
    },
    electrical: { battery: electrical },
    aerodynamics: { model: aero },
    controlAuthority: authority,
    flightRuntime,
    performance,
    diagnostics: {
      mass,
      centerOfMass: com,
      inertia,
      integrityIssues,
      confidenceNotes,
    },
    validation,
    versionManifest: manifest,
  };

  const artifactFingerprint = fingerprintCompiledArtifact(partial);
  const specification: CompiledAircraftSpecification = {
    ...partial,
    buildFingerprint,
    artifactFingerprint,
  };

  cache.set(
    buildFingerprint,
    manifest.engineeringModelVersion,
    manifest.compilerVersion,
    specification,
  );

  const s13 = stage('output-assembly', Date.now(), [], collectTrace);
  if (s13) trace.push(s13);

  return {
    ok: true,
    specification,
    validation,
    integrityIssues,
    trace,
  };
}

export { createMemoryCompilationCache };
export type { CompilationCache };
