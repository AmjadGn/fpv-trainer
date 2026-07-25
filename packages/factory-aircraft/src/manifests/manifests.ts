import {
  asCatalogReleaseId,
  asDroneBuildId,
} from '@fpv/engineering-kernel';
import {
  createDraft,
  createQuadSelections,
  publishRevision,
  DEFAULT_TUNING,
  type DroneBuildRevision,
  type UserTuningValues,
} from '@fpv/drone-build-domain';
import { OFFICIAL_CATALOG_RELEASE } from '@fpv/component-catalog';
import type { FlightCharacterHints } from '@fpv/aircraft-runtime-adapter';

export type FactoryAircraftId =
  | 'aeroguard-2'
  | 'velocity-x'
  | 'nano-scout'
  | 'apex-r5'
  | 'flux-f5'
  | 'horizon-l7';

export interface FactoryPresentationMeta {
  readonly aircraftId: FactoryAircraftId;
  readonly slug: string;
  readonly displayName: string;
  readonly manufacturerName: string;
  readonly category:
    | 'protected-cinewhoop'
    | 'hybrid-fpv'
    | 'micro-fpv'
    | 'racing-5inch'
    | 'freestyle-5inch'
    | 'long-range-7inch';
  readonly description: string;
  readonly shortDescription: string;
  readonly tags: readonly string[];
  readonly referenceProfileId: string | null;
  readonly referenceCategory: string;
  readonly difficulty: number;
  readonly recommendedSkillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  readonly recommendedModes: readonly string[];
  readonly recommendedEnvironments: readonly string[];
  readonly unlockPolicy: 'default' | 'progression' | 'purchase' | 'event' | 'dev-only';
  readonly isAvailableByDefault: boolean;
  readonly ductDiameterMeters: number | null;
  readonly defaultRateProfile: string;
  readonly supportedRateProfiles: readonly string[];
  readonly throttleExpo: number;
  readonly profileKey: FactoryAircraftId;
}

export interface FactoryBuildManifest {
  readonly buildId: string;
  readonly revisionId: string;
  readonly presentation: FactoryPresentationMeta;
  readonly frameRevisionId: string;
  readonly motorRevisionId: string;
  readonly propellerRevisionId: string;
  readonly batteryRevisionId: string;
  readonly escRevisionId: string;
  readonly fcRevisionId: string;
  readonly cameraRevisionId: string;
  readonly vtxRevisionId: string;
  readonly receiverRevisionId: string;
  readonly armPositions: readonly { x: number; y: number; z: number }[];
  readonly tuning: UserTuningValues;
  /**
   * Product-character and accessibility assistance only.
   * Must NOT feed physical engineering inputs.
   * Classification:
   * - Accessibility/training: selfLevelingAvailable, altitudeAssistAvailable,
   *   landingTolerance, recoveryStrength
   * - Product-character tuning: stabilizationStrength, brakingStrength,
   *   collisionEnergyMultiplier, maxVelocityScale
   * Competitive modes must set competitiveAssistDisabled when adapting.
   */
  readonly characterHints: FlightCharacterHints;
}

const CATALOG = OFFICIAL_CATALOG_RELEASE.releaseId;

function manifest(
  partial: Omit<FactoryBuildManifest, 'tuning'> & {
    tuning?: Partial<UserTuningValues>;
  },
): FactoryBuildManifest {
  return {
    ...partial,
    tuning: { ...DEFAULT_TUNING, ...partial.tuning },
  };
}

export const FACTORY_BUILD_MANIFESTS: readonly FactoryBuildManifest[] = [
  manifest({
    buildId: 'factory-aeroguard-2',
    revisionId: 'factory-aeroguard-2@1',
    frameRevisionId: 'frame-cine-ducted-220@1',
    motorRevisionId: 'motor-1404-4500kv@1',
    propellerRevisionId: 'prop-ducted-3blade-120@1',
    batteryRevisionId: 'batt-4s-2800@1',
    escRevisionId: 'esc-4in1-20a@1',
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.078, y: 0.078, z: 0 },
      { x: -0.078, y: 0.078, z: 0 },
      { x: -0.078, y: -0.078, z: 0 },
      { x: 0.078, y: -0.078, z: 0 },
    ],
    tuning: { thrustCurveExponent: 1.15, throttleExpo: 0.35, stabilizationBias: 0.55, rateProfileHint: 'beginner' },
    characterHints: {
      selfLevelingAvailable: true,
      altitudeAssistAvailable: true,
      stabilizationStrength: 0.55,
      brakingStrength: 0.7,
      recoveryStrength: 0.75,
      landingTolerance: 1.35,
      collisionEnergyMultiplier: 0.75,
      maxVelocityScale: 0.85,
    },
    presentation: {
      aircraftId: 'aeroguard-2',
      slug: 'aeroguard-2',
      displayName: 'AeroGuard 2',
      manufacturerName: 'Skyward Dynamics',
      category: 'protected-cinewhoop',
      description:
        'Protected cinewhoop built for smooth indoor and structure flight. Ducted rings, forgiving throttle, and predictable recovery.',
      shortDescription: 'Stable protected cinematic flyer',
      tags: ['beginner-friendly', 'indoor', 'cinematic', 'protected'],
      referenceProfileId: 'ref-dji-avata-2',
      referenceCategory: 'Modern protected cinematic FPV',
      difficulty: 2,
      recommendedSkillLevel: 'beginner',
      recommendedModes: ['free-flight', 'training', 'cinematic'],
      recommendedEnvironments: ['alpine-training-valley', 'coastal-ruins'],
      unlockPolicy: 'default',
      isAvailableByDefault: true,
      ductDiameterMeters: 0.14,
      defaultRateProfile: 'beginner',
      supportedRateProfiles: ['beginner', 'normal', 'acro'],
      throttleExpo: 0.35,
      profileKey: 'aeroguard-2',
    },
  }),
  manifest({
    buildId: 'factory-velocity-x',
    revisionId: 'factory-velocity-x@1',
    frameRevisionId: 'frame-hybrid-speed-280@1',
    motorRevisionId: 'motor-2207-2450kv@1',
    propellerRevisionId: 'prop-6x4x3@1',
    batteryRevisionId: 'batt-6s-2200@1',
    escRevisionId: 'esc-4in1-45a@1',
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.099, y: 0.099, z: 0 },
      { x: -0.099, y: 0.099, z: 0 },
      { x: -0.099, y: -0.099, z: 0 },
      { x: 0.099, y: -0.099, z: 0 },
    ],
    tuning: { thrustCurveExponent: 1.05, throttleExpo: 0.25, stabilizationBias: 0.4, rateProfileHint: 'normal' },
    characterHints: {
      selfLevelingAvailable: true,
      altitudeAssistAvailable: false,
      stabilizationStrength: 0.4,
      brakingStrength: 0.35,
      recoveryStrength: 0.4,
      landingTolerance: 0.85,
      collisionEnergyMultiplier: 1.35,
      maxVelocityScale: 1.35,
    },
    presentation: {
      aircraftId: 'velocity-x',
      slug: 'velocity-x',
      displayName: 'Velocity X',
      manufacturerName: 'Vector Forge',
      category: 'hybrid-fpv',
      description:
        'High-speed hybrid with heavy momentum and long braking distance. Built for open-space speed runs, not tight indoor rooms.',
      shortDescription: 'Heavy high-speed hybrid FPV',
      tags: ['speed', 'hybrid', 'open-space'],
      referenceProfileId: null,
      referenceCategory: 'High-speed hybrid FPV',
      difficulty: 4,
      recommendedSkillLevel: 'advanced',
      recommendedModes: ['free-flight', 'racing'],
      recommendedEnvironments: ['alpine-training-valley'],
      unlockPolicy: 'default',
      isAvailableByDefault: true,
      ductDiameterMeters: null,
      defaultRateProfile: 'normal',
      supportedRateProfiles: ['normal', 'acro'],
      throttleExpo: 0.25,
      profileKey: 'velocity-x',
    },
  }),
  manifest({
    buildId: 'factory-nano-scout',
    revisionId: 'factory-nano-scout@1',
    frameRevisionId: 'frame-nano-85@1',
    motorRevisionId: 'motor-1103-10000kv@1',
    propellerRevisionId: 'prop-65mm-2blade@1',
    batteryRevisionId: 'batt-1s-450@1',
    escRevisionId: 'esc-4in1-12a@1',
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.03, y: 0.03, z: 0 },
      { x: -0.03, y: 0.03, z: 0 },
      { x: -0.03, y: -0.03, z: 0 },
      { x: 0.03, y: -0.03, z: 0 },
    ],
    tuning: { thrustCurveExponent: 1.25, throttleExpo: 0.4, stabilizationBias: 0.65, rateProfileHint: 'beginner' },
    characterHints: {
      selfLevelingAvailable: true,
      altitudeAssistAvailable: true,
      stabilizationStrength: 0.65,
      brakingStrength: 0.9,
      recoveryStrength: 0.95,
      landingTolerance: 1.5,
      collisionEnergyMultiplier: 0.5,
      maxVelocityScale: 0.7,
    },
    presentation: {
      aircraftId: 'nano-scout',
      slug: 'nano-scout',
      displayName: 'Nano Scout',
      manufacturerName: 'MicroNest Labs',
      category: 'micro-fpv',
      description:
        'Ultra-light micro flyer for tight indoor spaces. Gusty outdoor air will push it around.',
      shortDescription: 'Tiny indoor micro FPV',
      tags: ['micro', 'indoor', 'beginner'],
      referenceProfileId: null,
      referenceCategory: 'Whoop / micro FPV',
      difficulty: 2,
      recommendedSkillLevel: 'beginner',
      recommendedModes: ['free-flight', 'training'],
      recommendedEnvironments: ['coastal-ruins'],
      unlockPolicy: 'default',
      isAvailableByDefault: true,
      ductDiameterMeters: null,
      defaultRateProfile: 'beginner',
      supportedRateProfiles: ['beginner', 'normal'],
      throttleExpo: 0.4,
      profileKey: 'nano-scout',
    },
  }),
  manifest({
    buildId: 'factory-apex-r5',
    revisionId: 'factory-apex-r5@1',
    frameRevisionId: 'frame-racing-5in@1',
    motorRevisionId: 'motor-2306-2750kv@1',
    propellerRevisionId: 'prop-5x4x3@1',
    batteryRevisionId: 'batt-6s-1500@1',
    escRevisionId: 'esc-4in1-45a@1',
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.08, y: 0.08, z: 0 },
      { x: -0.08, y: 0.08, z: 0 },
      { x: -0.08, y: -0.08, z: 0 },
      { x: 0.08, y: -0.08, z: 0 },
    ],
    tuning: { thrustCurveExponent: 1.0, throttleExpo: 0.2, stabilizationBias: 0.3, rateProfileHint: 'acro' },
    characterHints: {
      selfLevelingAvailable: false,
      altitudeAssistAvailable: false,
      stabilizationStrength: 0.3,
      brakingStrength: 0.45,
      recoveryStrength: 0.4,
      landingTolerance: 0.8,
      collisionEnergyMultiplier: 1.2,
      maxVelocityScale: 1.15,
    },
    presentation: {
      aircraftId: 'apex-r5',
      slug: 'apex-r5',
      displayName: 'Apex R5',
      manufacturerName: 'Apex Racing Systems',
      category: 'racing-5inch',
      description:
        'Purpose-built 5-inch racer with sharp authority and minimal forgiveness.',
      shortDescription: 'Aggressive 5-inch racer',
      tags: ['racing', '5inch', 'advanced'],
      referenceProfileId: null,
      referenceCategory: '5-inch racing quad',
      difficulty: 5,
      recommendedSkillLevel: 'expert',
      recommendedModes: ['racing', 'free-flight'],
      recommendedEnvironments: ['alpine-training-valley'],
      unlockPolicy: 'default',
      isAvailableByDefault: true,
      ductDiameterMeters: null,
      defaultRateProfile: 'acro',
      supportedRateProfiles: ['normal', 'acro'],
      throttleExpo: 0.2,
      profileKey: 'apex-r5',
    },
  }),
  manifest({
    buildId: 'factory-flux-f5',
    revisionId: 'factory-flux-f5@1',
    frameRevisionId: 'frame-freestyle-5in@1',
    motorRevisionId: 'motor-2207-1950kv@1',
    propellerRevisionId: 'prop-5x4.5x3@1',
    batteryRevisionId: 'batt-6s-1800@1',
    escRevisionId: 'esc-4in1-45a@1',
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.081, y: 0.081, z: 0 },
      { x: -0.081, y: 0.081, z: 0 },
      { x: -0.081, y: -0.081, z: 0 },
      { x: 0.081, y: -0.081, z: 0 },
    ],
    tuning: { thrustCurveExponent: 1.08, throttleExpo: 0.28, stabilizationBias: 0.4, rateProfileHint: 'acro' },
    characterHints: {
      selfLevelingAvailable: true,
      altitudeAssistAvailable: false,
      stabilizationStrength: 0.4,
      brakingStrength: 0.5,
      recoveryStrength: 0.55,
      landingTolerance: 0.95,
      collisionEnergyMultiplier: 1.1,
      maxVelocityScale: 1.05,
    },
    presentation: {
      aircraftId: 'flux-f5',
      slug: 'flux-f5',
      displayName: 'Flux F5',
      manufacturerName: 'FluxCraft',
      category: 'freestyle-5inch',
      description:
        'Balanced freestyle 5-inch with punchy mid-throttle and playful authority.',
      shortDescription: 'Playful freestyle 5-inch',
      tags: ['freestyle', '5inch'],
      referenceProfileId: null,
      referenceCategory: '5-inch freestyle',
      difficulty: 4,
      recommendedSkillLevel: 'advanced',
      recommendedModes: ['free-flight', 'freestyle'],
      recommendedEnvironments: ['alpine-training-valley', 'coastal-ruins'],
      unlockPolicy: 'default',
      isAvailableByDefault: true,
      ductDiameterMeters: null,
      defaultRateProfile: 'acro',
      supportedRateProfiles: ['normal', 'acro'],
      throttleExpo: 0.28,
      profileKey: 'flux-f5',
    },
  }),
  manifest({
    buildId: 'factory-horizon-l7',
    revisionId: 'factory-horizon-l7@1',
    frameRevisionId: 'frame-longrange-7in@1',
    motorRevisionId: 'motor-2807-1500kv@1',
    propellerRevisionId: 'prop-7x4x3@1',
    batteryRevisionId: 'batt-6s-3000@1',
    escRevisionId: 'esc-4in1-45a@1',
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.106, y: 0.106, z: 0 },
      { x: -0.106, y: 0.106, z: 0 },
      { x: -0.106, y: -0.106, z: 0 },
      { x: 0.106, y: -0.106, z: 0 },
    ],
    tuning: { thrustCurveExponent: 1.12, throttleExpo: 0.3, stabilizationBias: 0.45, rateProfileHint: 'normal' },
    characterHints: {
      selfLevelingAvailable: true,
      altitudeAssistAvailable: true,
      stabilizationStrength: 0.45,
      brakingStrength: 0.4,
      recoveryStrength: 0.5,
      landingTolerance: 1.0,
      collisionEnergyMultiplier: 1.4,
      maxVelocityScale: 1.1,
    },
    presentation: {
      aircraftId: 'horizon-l7',
      slug: 'horizon-l7',
      displayName: 'Horizon L7',
      manufacturerName: 'Horizon Aero',
      category: 'long-range-7inch',
      description:
        'Long-range 7-inch cruiser with heavy rotational mass and efficient glide.',
      shortDescription: 'Heavy long-range cruiser',
      tags: ['long-range', '7inch'],
      referenceProfileId: null,
      referenceCategory: '7-inch long range',
      difficulty: 4,
      recommendedSkillLevel: 'advanced',
      recommendedModes: ['free-flight', 'cinematic'],
      recommendedEnvironments: ['alpine-training-valley'],
      unlockPolicy: 'default',
      isAvailableByDefault: true,
      ductDiameterMeters: null,
      defaultRateProfile: 'normal',
      supportedRateProfiles: ['beginner', 'normal', 'acro'],
      throttleExpo: 0.3,
      profileKey: 'horizon-l7',
    },
  }),
];

export function materializeFactoryRevision(
  factory: FactoryBuildManifest,
): DroneBuildRevision {
  const { selections, topology } = createQuadSelections({
    frameRevisionId: factory.frameRevisionId,
    motorRevisionId: factory.motorRevisionId,
    propellerRevisionId: factory.propellerRevisionId,
    batteryRevisionId: factory.batteryRevisionId,
    escRevisionId: factory.escRevisionId,
    fcRevisionId: factory.fcRevisionId,
    cameraRevisionId: factory.cameraRevisionId,
    vtxRevisionId: factory.vtxRevisionId,
    receiverRevisionId: factory.receiverRevisionId,
    armPositions: factory.armPositions,
  });

  const draft = createDraft({
    buildId: factory.buildId,
    name: factory.presentation.displayName,
    description: factory.presentation.description,
    catalogReleaseId: CATALOG,
    selections,
    topology,
    tuning: factory.tuning,
  });

  // Ensure branded ids match factory constants
  void asDroneBuildId(factory.buildId);
  void asCatalogReleaseId(CATALOG);

  return publishRevision(draft, factory.revisionId);
}

export function getFactoryManifest(
  aircraftId: FactoryAircraftId,
): FactoryBuildManifest {
  const found = FACTORY_BUILD_MANIFESTS.find(
    (m) => m.presentation.aircraftId === aircraftId,
  );
  if (!found) {
    throw new Error(`Unknown factory aircraft: ${aircraftId}`);
  }
  return found;
}
