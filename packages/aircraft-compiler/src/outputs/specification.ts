import type {
  ArtifactFingerprint,
  BuildFingerprint,
  CompilationContextFingerprint,
  RuntimeCompatibilitySignature,
  VersionManifest,
} from '@fpv/engineering-kernel';
import type { ValidationReport } from '@fpv/compatibility-engine';
import type {
  MassBreakdown,
  CenterOfMassResult,
  InertiaEstimate,
  ElectricalSystemResult,
  PropulsionSystemResult,
  AerodynamicResult,
  ControlAuthorityResult,
  PerformanceMetrics,
  IntegrityIssue,
} from '@fpv/aircraft-engineering';

/**
 * Physical SI engineering assembly — source of truth for mass, CoM, inertia,
 * dimensions. Units are SI (kg, m, kg·m², N).
 */
export interface CompiledPhysicalAssembly {
  readonly totalMassKg: number;
  readonly dryMassKg: number;
  readonly batteryMassKg: number;
  readonly centerOfMass: { x: number; y: number; z: number };
  /** Principal moments in kg·m² (SI). */
  readonly inertia: {
    roll: number;
    pitch: number;
    yaw: number;
    tensorDiagonalKgM2: readonly [number, number, number];
    units: 'kg·m²';
  };
  readonly dimensions: {
    widthMeters: number;
    lengthMeters: number;
    heightMeters: number;
    wheelbaseMeters: number;
  };
  readonly motorPositions: readonly { x: number; y: number; z: number }[];
  readonly propellerDiameterMeters: number;
}

export interface CompiledPropulsion {
  readonly units: PropulsionSystemResult['units'];
  readonly totalMaxThrustNewtons: number;
  readonly thrustToWeight: number;
  readonly hoverThrottleEstimate: number;
  readonly modelVersion: string;
  readonly dataProvenance: PropulsionSystemResult['dataProvenance'];
  readonly confidence: PropulsionSystemResult['confidence'];
  readonly warnings: readonly string[];
}

export interface CompiledElectrical {
  readonly battery: ElectricalSystemResult;
}

export interface CompiledAerodynamics {
  readonly model: AerodynamicResult;
}

/**
 * Runtime flight configuration for the existing fixed-timestep solver.
 * Values may be scaled/clamped for solver compatibility — not pure SI.
 * Prefer physicalAssembly + controlAuthority for physical engineering.
 *
 * @deprecated Fields that duplicate SI physical data; kept for v1.0 runtime compat.
 */
export interface CompiledFlightRuntimeConfiguration {
  readonly massKg: number;
  readonly maxThrustNewtons: number;
  readonly hoverThrottleRatio: number;
  readonly thrustCurveExponent: number;
  readonly motorSpoolUpTime: number;
  readonly motorSpoolDownTime: number;
  readonly motorResponseTime: number;
  readonly linearDrag: number;
  readonly frontalDragCoefficient: number;
  readonly lateralDragCoefficient: number;
  readonly verticalDragCoefficient: number;
  readonly angularDrag: number;
  /** @deprecated Solver-scaled inertia — use physicalAssembly.inertia for SI. */
  readonly rollInertia: number;
  /** @deprecated Solver-scaled inertia. */
  readonly pitchInertia: number;
  /** @deprecated Solver-scaled inertia. */
  readonly yawInertia: number;
  readonly rollAcceleration: number;
  readonly pitchAcceleration: number;
  readonly yawAcceleration: number;
  readonly maxRollRate: number;
  readonly maxPitchRate: number;
  readonly maxYawRate: number;
  readonly groundEffectStrength: number;
  readonly groundEffectHeight: number;
  readonly propWashStrength: number;
  readonly windSensitivity: number;
  readonly glideEfficiency: number;
  readonly centerOfMassOffset: { x: number; y: number; z: number };
  readonly nominalVoltage: number;
  readonly batteryCellCount: number;
  readonly batteryCapacityMah: number;
  readonly safetyClamps: {
    readonly maxAngularAcceleration: number;
    readonly minAngularDrag: number;
  };
}

export interface CompiledAircraftSpecification {
  readonly identity: {
    readonly sourceBuildId: string;
    readonly buildRevisionId: string;
    readonly catalogReleaseId: string;
    readonly compilerVersion: string;
    readonly engineeringModelVersion: string;
  };
  /** PhysicalEngineeringSpecification (SI). */
  readonly physicalAssembly: CompiledPhysicalAssembly;
  readonly propulsion: CompiledPropulsion;
  readonly electrical: CompiledElectrical;
  readonly aerodynamics: CompiledAerodynamics;
  readonly controlAuthority: ControlAuthorityResult;
  /** RuntimeFlightConfiguration — adapter/solver facing. */
  readonly flightRuntime: CompiledFlightRuntimeConfiguration;
  /** DerivedPerformanceCharacteristics. */
  readonly performance: PerformanceMetrics;
  readonly diagnostics: {
    readonly mass: MassBreakdown;
    readonly centerOfMass: CenterOfMassResult;
    readonly inertia: InertiaEstimate;
    readonly integrityIssues: readonly IntegrityIssue[];
    readonly confidenceNotes: readonly string[];
  };
  /**
   * Context-specific validation report (policy-scoped).
   * Not part of build identity; see compilationContextFingerprint.
   */
  readonly validation: ValidationReport;
  readonly versionManifest: VersionManifest;
  readonly buildFingerprint: BuildFingerprint;
  readonly compilationContextFingerprint: CompilationContextFingerprint;
  /** Physical engineering output identity (excludes flightRuntime). */
  readonly artifactFingerprint: ArtifactFingerprint;
  /** Runtime adapter + flight-model compatibility (separate from ArtifactFingerprint). */
  readonly runtimeCompatibilitySignature: RuntimeCompatibilitySignature;
}

export interface CompilationTraceStage {
  readonly stage: string;
  readonly durationMs: number;
  readonly warnings: readonly string[];
}

export interface CompilationResult {
  readonly ok: boolean;
  readonly specification: CompiledAircraftSpecification | null;
  readonly validation: ValidationReport;
  readonly integrityIssues: readonly IntegrityIssue[];
  readonly trace: readonly CompilationTraceStage[];
}
