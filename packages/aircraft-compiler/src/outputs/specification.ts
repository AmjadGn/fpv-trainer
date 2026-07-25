import type {
  ArtifactFingerprint,
  BuildFingerprint,
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

export interface CompiledPhysicalAssembly {
  readonly totalMassKg: number;
  readonly dryMassKg: number;
  readonly batteryMassKg: number;
  readonly centerOfMass: { x: number; y: number; z: number };
  readonly inertia: { roll: number; pitch: number; yaw: number };
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
}

export interface CompiledElectrical {
  readonly battery: ElectricalSystemResult;
}

export interface CompiledAerodynamics {
  readonly model: AerodynamicResult;
}

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
  readonly rollInertia: number;
  readonly pitchInertia: number;
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
  readonly physicalAssembly: CompiledPhysicalAssembly;
  readonly propulsion: CompiledPropulsion;
  readonly electrical: CompiledElectrical;
  readonly aerodynamics: CompiledAerodynamics;
  readonly controlAuthority: ControlAuthorityResult;
  readonly flightRuntime: CompiledFlightRuntimeConfiguration;
  readonly performance: PerformanceMetrics;
  readonly diagnostics: {
    readonly mass: MassBreakdown;
    readonly centerOfMass: CenterOfMassResult;
    readonly inertia: InertiaEstimate;
    readonly integrityIssues: readonly IntegrityIssue[];
    readonly confidenceNotes: readonly string[];
  };
  readonly validation: ValidationReport;
  readonly versionManifest: VersionManifest;
  readonly buildFingerprint: BuildFingerprint;
  readonly artifactFingerprint: ArtifactFingerprint;
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
