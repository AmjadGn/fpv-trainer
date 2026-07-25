import type { Vec3 } from '../../flight/models/flight-state.model';
import type { AircraftId } from './aircraft-ids';
import type { AudioProfile } from './audio-profile.model';
import type { CameraProfile } from './camera-profile.model';
import type { CollisionProfile } from './collision-profile.model';
import type { DamageProfile } from './damage-profile.model';
import type { FlightProfile } from './flight-profile.model';
import type { VisualProfile } from './visual-profile.model';

export type AircraftCategory =
  | 'protected-cinewhoop'
  | 'hybrid-fpv'
  | 'micro-fpv'
  | 'racing-5inch'
  | 'freestyle-5inch'
  | 'long-range-7inch';

export type AircraftReleaseStatus =
  | 'available'
  | 'preview'
  | 'maintenance'
  | 'retired';

export type AircraftUnlockPolicy =
  | 'default'
  | 'progression'
  | 'purchase'
  | 'event'
  | 'dev-only';

export interface AircraftDefinition {
  id: AircraftId;
  slug: string;
  displayName: string;
  manufacturerName: string;
  fictionalManufacturer: true;
  category: AircraftCategory;
  generation: number;
  releaseStatus: AircraftReleaseStatus;
  description: string;
  shortDescription: string;
  tags: string[];

  referenceProfileId: string | null;
  referenceCategory: string;
  derivedFromPublicSpecifications: boolean;
  physicsAccuracyLabel: string;
  legalNotes: string;

  widthMeters: number;
  lengthMeters: number;
  heightMeters: number;
  wheelbaseMeters: number;
  propellerDiameterMeters: number;
  ductDiameterMeters: number | null;

  dryMassKg: number;
  batteryMassKg: number;
  takeoffMassKg: number;
  centerOfMassOffset: Vec3;
  centerOfMassHeight: number;

  nominalVoltage: number;
  batteryCellCount: number;
  batteryCapacityMah: number;
  maximumThrustNewtons: number;
  hoverThrottleRatio: number;
  thrustToWeightRatio: number;
  motorResponseTime: number;
  spoolUpTime: number;
  spoolDownTime: number;

  frontalDragCoefficient: number;
  lateralDragCoefficient: number;
  verticalDragCoefficient: number;
  angularDrag: number;
  propWashStrength: number;
  groundEffectStrength: number;
  windSensitivity: number;
  glideEfficiency: number;

  rollInertia: number;
  pitchInertia: number;
  yawInertia: number;
  angularAccelerationLimits: Vec3;
  angularVelocityLimits: Vec3;

  defaultRateProfile: string;
  supportedRateProfiles: string[];
  throttleCurve: number;
  throttleExpo: number;
  stabilizationStrength: number;
  selfLevelingAvailable: boolean;
  altitudeAssistAvailable: boolean;
  maximumForwardSpeed: number;
  maximumClimbSpeed: number;
  maximumDescentSpeed: number;
  brakingStrength: number;
  recoveryStrength: number;

  flightProfile: FlightProfile;
  cameraProfile: CameraProfile;
  collisionProfile: CollisionProfile;
  visualProfile: VisualProfile;
  audioProfile: AudioProfile;
  damageProfile: DamageProfile;

  difficulty: number;
  recommendedSkillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  recommendedModes: string[];
  recommendedEnvironments: string[];
  unlockPolicy: AircraftUnlockPolicy;
  isAvailableByDefault: boolean;

  definitionVersion: string;
  physicsProfileVersion: string;
  colliderVersion: string;
  visualVersion: string;
  audioVersion: string;
}
