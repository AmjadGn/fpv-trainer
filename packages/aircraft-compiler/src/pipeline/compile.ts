import {
  V1_1_VERSION_MANIFEST,
  type VersionManifest,
} from '@fpv/engineering-kernel';
import type { ComponentRevision } from '@fpv/component-catalog';
import {
  resolveAssembly,
  type DroneBuildRevision,
} from '@fpv/drone-build-domain';
import {
  executePreEngineeringValidation,
  executePostEngineeringValidation,
  mergeValidationReports,
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
  fingerprintCompilationContext,
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
  CompiledFlightRuntimeConfiguration,
} from '../outputs/specification';
import { mapPhysicalToFlightRuntime } from '../runtime-mapping/map-to-runtime';

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
  const catalogMap = new Map<string, ComponentRevision>();
  for (const c of componentList) {
    catalogMap.set(c.revisionId, c);
  }
  const normalized = normalizeBuildRevision(revision);
  const assembly = resolveAssembly(normalized, catalogMap);
  const buildFingerprint = fingerprintBuildInput(normalized);
  const compilationContextFingerprint = fingerprintCompilationContext(
    policy,
    manifest,
  );
  const s1 = stage('resolution', t0, assembly.diagnostics.map((d) => d.code), collectTrace);
  if (s1) trace.push(s1);

  if (!options.skipCache) {
    const cached = cache.get(
      buildFingerprint,
      compilationContextFingerprint,
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
  const preValidation = executePreEngineeringValidation(assembly, policy);
  const s2 = stage('pre-engineering-validation', t0, [], collectTrace);
  if (s2) trace.push(s2);

  if (!preValidation.canCompile) {
    return {
      ok: false,
      specification: null,
      validation: preValidation,
      integrityIssues: [],
      trace,
    };
  }

  t0 = Date.now();
  const mass = aggregateMass(assembly);
  const s3 = stage('mass', t0, [], collectTrace);
  if (s3) trace.push(s3);

  t0 = Date.now();
  const com = solveCenterOfMass(assembly);
  const s4 = stage('center-of-mass', t0, [], collectTrace);
  if (s4) trace.push(s4);

  t0 = Date.now();
  const inertia = estimateInertia(assembly, com, mass.totalTakeoffMassKg);
  const s5 = stage('inertia', t0, [], collectTrace);
  if (s5) trace.push(s5);

  t0 = Date.now();
  const electrical = solveElectricalSystem(assembly);
  const s6 = stage('electrical', t0, [], collectTrace);
  if (s6) trace.push(s6);

  t0 = Date.now();
  const propulsion = solvePropulsion(
    assembly,
    electrical,
    mass.totalTakeoffMassKg,
    normalized.tuning,
  );
  const s7 = stage('propulsion', t0, [...propulsion.warnings], collectTrace);
  if (s7) trace.push(s7);

  t0 = Date.now();
  const aero = approximateAerodynamics(assembly, mass.totalTakeoffMassKg);
  const s8 = stage('aerodynamics', t0, [...aero.warnings], collectTrace);
  if (s8) trace.push(s8);

  t0 = Date.now();
  const authority = analyzeControlAuthority(propulsion, inertia);
  const s9 = stage('control-authority', t0, [], collectTrace);
  if (s9) trace.push(s9);

  t0 = Date.now();
  const performance = calculatePerformanceMetrics(
    mass,
    propulsion,
    electrical,
    authority,
    aero,
  );
  const s10 = stage('performance', t0, [], collectTrace);
  if (s10) trace.push(s10);

  t0 = Date.now();
  const postValidation = executePostEngineeringValidation(
    assembly,
    {
      totalTakeoffMassKg: mass.totalTakeoffMassKg,
      thrustToWeight: propulsion.thrustToWeight,
    },
    policy,
  );
  const validation: ValidationReport = mergeValidationReports(
    preValidation,
    postValidation,
  );
  const s11 = stage('post-engineering-validation', t0, [], collectTrace);
  if (s11) trace.push(s11);

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

  // Dimensions exclusively from active build selections — never full-catalog find.
  const frame = assembly.frameComponent;
  const wheelbase =
    frame && frame.engineering.type === 'frame'
      ? frame.engineering.frame.wheelbaseMeters
      : 0.2;
  const propDiameter =
    assembly.propulsionUnits[0]?.propellerComponent.engineering.type ===
    'propeller'
      ? assembly.propulsionUnits[0].propellerComponent.engineering.propeller
          .diameterMeters
      : 0.12;

  const dims = frame?.dimensions ?? {
    widthMeters: wheelbase * 1.2,
    lengthMeters: wheelbase * 1.2,
    heightMeters: 0.05,
  };

  const flightRuntime: CompiledFlightRuntimeConfiguration =
    mapPhysicalToFlightRuntime({
      massKg: mass.totalTakeoffMassKg,
      propulsion,
      inertia,
      authority,
      aero,
      electrical,
      tuning: normalized.tuning,
      centerOfMass: com,
    });

  const confidenceNotes: string[] = [
    ...propulsion.warnings,
    ...aero.warnings,
  ];
  if (com.confidence !== 'high') {
    confidenceNotes.push(`center-of-mass confidence: ${com.confidence}`);
  }
  confidenceNotes.push(`propulsion provenance: ${propulsion.dataProvenance}`);
  confidenceNotes.push(`inertia model: ${inertia.modelVersion} (${inertia.units})`);

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
        tensorDiagonalKgM2: inertia.tensorDiagonalKgM2,
        units: 'kg·m²' as const,
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
      modelVersion: propulsion.modelVersion,
      dataProvenance: propulsion.dataProvenance,
      confidence: propulsion.confidence,
      warnings: propulsion.warnings,
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
    compilationContextFingerprint,
    artifactFingerprint,
  };

  cache.set(
    buildFingerprint,
    compilationContextFingerprint,
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
