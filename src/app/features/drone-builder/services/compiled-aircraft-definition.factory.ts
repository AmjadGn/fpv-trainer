import type { CompilationResult } from '@fpv/aircraft-compiler';
import {
  compiledToFlightProfile,
  compiledToPhysicsFields,
  type FlightCharacterHints,
} from '@fpv/aircraft-runtime-adapter';
import type { FactoryAircraftId } from '@fpv/factory-aircraft';

import type { AircraftDefinition } from '../../../core/aircraft/models/aircraft-definition.model';
import type { AircraftId } from '../../../core/aircraft/models/aircraft-ids';
import type { AircraftCategory } from '../../../core/aircraft/models/aircraft-definition.model';
import type { FlightProfile } from '../../../core/aircraft/models/flight-profile.model';
import { findAircraftById } from '../../../core/aircraft/data/aircraft-catalog';

const LEGAL =
  'Original user-compiled aircraft. Not affiliated with or endorsed by any real-world manufacturer. Flight behavior is a simulator approximation.';

const PHYSICS_LABEL =
  'Simulator approximation compiled from a user drone build via Drone Builder engineering core v1.1';

const CATEGORY_TEMPLATE: Record<AircraftCategory, FactoryAircraftId> = {
  'protected-cinewhoop': 'aeroguard-2',
  'hybrid-fpv': 'velocity-x',
  'micro-fpv': 'nano-scout',
  'racing-5inch': 'apex-r5',
  'freestyle-5inch': 'flux-f5',
  'long-range-7inch': 'horizon-l7',
};

const INTENT_CATEGORY: Record<string, AircraftCategory> = {
  racing: 'racing-5inch',
  freestyle: 'freestyle-5inch',
  cinematic: 'protected-cinewhoop',
  'long-range': 'long-range-7inch',
};

export interface CompiledUserAircraftInput {
  readonly aircraftId: string;
  readonly displayName: string;
  readonly buildId: string;
  readonly revisionId: string;
  readonly intentId?: string | null;
  readonly presentationTemplateAircraftId?: string | null;
  readonly characterHints?: FlightCharacterHints;
  readonly compilation: CompilationResult;
}

/**
 * Adapt a successful compilation into a flyable AircraftDefinition.
 * Reuses curated presentation packs from a category-matched factory craft.
 * Does not invent physics — physics come only from the runtime adapter.
 */
export function createAircraftDefinitionFromCompilation(
  input: CompiledUserAircraftInput,
): AircraftDefinition {
  const spec = input.compilation.specification;
  if (!input.compilation.ok || !spec) {
    throw new Error('Cannot adapt a failed compilation to AircraftDefinition');
  }

  const category =
    (input.intentId && INTENT_CATEGORY[input.intentId]) ||
    'freestyle-5inch';
  const templateId =
    (input.presentationTemplateAircraftId as FactoryAircraftId | null) ??
    CATEGORY_TEMPLATE[category];
  const template = findAircraftById(templateId);
  if (!template) {
    throw new Error(`Missing presentation template aircraft ${templateId}`);
  }

  const flightProfileAdapted = compiledToFlightProfile(
    spec,
    `flt-${input.aircraftId}`,
    input.characterHints ?? {
      selfLevelingAvailable: template.selfLevelingAvailable,
      altitudeAssistAvailable: template.altitudeAssistAvailable,
      stabilizationStrength: template.stabilizationStrength,
      brakingStrength: template.brakingStrength,
      recoveryStrength: template.recoveryStrength,
    },
  );
  const physics = compiledToPhysicsFields(spec, flightProfileAdapted);
  const flightProfile: FlightProfile = { ...flightProfileAdapted };

  return {
    id: input.aircraftId as AircraftId,
    slug: input.aircraftId,
    displayName: input.displayName,
    manufacturerName: 'Custom Build',
    fictionalManufacturer: true,
    category,
    generation: 1,
    releaseStatus: 'available',
    description: `User-compiled build from revision ${input.revisionId}.`,
    shortDescription: 'Custom compiled drone build',
    tags: ['user-build', 'compiled', category],
    referenceProfileId: null,
    referenceCategory: 'User-compiled FPV',
    derivedFromPublicSpecifications: false,
    physicsAccuracyLabel: PHYSICS_LABEL,
    legalNotes: LEGAL,
    widthMeters: physics.widthMeters,
    lengthMeters: physics.lengthMeters,
    heightMeters: physics.heightMeters,
    wheelbaseMeters: physics.wheelbaseMeters,
    propellerDiameterMeters: physics.propellerDiameterMeters,
    ductDiameterMeters: template.ductDiameterMeters,
    dryMassKg: physics.dryMassKg,
    batteryMassKg: physics.batteryMassKg,
    takeoffMassKg: physics.takeoffMassKg,
    centerOfMassOffset: { ...physics.centerOfMassOffset },
    centerOfMassHeight: physics.centerOfMassHeight,
    nominalVoltage: physics.nominalVoltage,
    batteryCellCount: physics.batteryCellCount,
    batteryCapacityMah: physics.batteryCapacityMah,
    maximumThrustNewtons: physics.maximumThrustNewtons,
    hoverThrottleRatio: physics.hoverThrottleRatio,
    thrustToWeightRatio: physics.thrustToWeightRatio,
    motorResponseTime: physics.motorResponseTime,
    spoolUpTime: physics.spoolUpTime,
    spoolDownTime: physics.spoolDownTime,
    frontalDragCoefficient: physics.frontalDragCoefficient,
    lateralDragCoefficient: physics.lateralDragCoefficient,
    verticalDragCoefficient: physics.verticalDragCoefficient,
    angularDrag: physics.angularDrag,
    propWashStrength: physics.propWashStrength,
    groundEffectStrength: physics.groundEffectStrength,
    windSensitivity: physics.windSensitivity,
    glideEfficiency: physics.glideEfficiency,
    rollInertia: physics.rollInertia,
    pitchInertia: physics.pitchInertia,
    yawInertia: physics.yawInertia,
    angularAccelerationLimits: { ...physics.angularAccelerationLimits },
    angularVelocityLimits: { ...physics.angularVelocityLimits },
    defaultRateProfile: template.defaultRateProfile,
    supportedRateProfiles: [...template.supportedRateProfiles],
    throttleCurve: physics.throttleCurve,
    throttleExpo: template.throttleExpo,
    stabilizationStrength: flightProfile.stabilizationStrength,
    selfLevelingAvailable: flightProfile.selfLevelingAvailable,
    altitudeAssistAvailable: flightProfile.altitudeAssistAvailable,
    maximumForwardSpeed: physics.maximumForwardSpeed,
    maximumClimbSpeed: physics.maximumClimbSpeed,
    maximumDescentSpeed: physics.maximumDescentSpeed,
    brakingStrength: flightProfile.brakingStrength,
    recoveryStrength: flightProfile.recoveryStrength,
    flightProfile,
    cameraProfile: structuredClone(template.cameraProfile),
    collisionProfile: structuredClone(template.collisionProfile),
    visualProfile: {
      ...structuredClone(template.visualProfile),
      id: `vis-${input.aircraftId}`,
    },
    audioProfile: {
      ...structuredClone(template.audioProfile),
      id: `aud-${input.aircraftId}`,
    },
    damageProfile: {
      ...structuredClone(template.damageProfile),
      id: `dmg-${input.aircraftId}`,
    },
    difficulty: template.difficulty,
    recommendedSkillLevel: template.recommendedSkillLevel,
    recommendedModes: [...template.recommendedModes],
    recommendedEnvironments: [...template.recommendedEnvironments],
    unlockPolicy: 'default',
    isAvailableByDefault: true,
    definitionVersion: '1.2.0-user',
    physicsProfileVersion: spec.versionManifest.engineeringModelVersion,
    colliderVersion: template.colliderVersion,
    visualVersion: template.visualVersion,
    audioVersion: template.audioVersion,
  };
}

export function userAircraftIdForRevision(revisionId: string): string {
  const safe = revisionId.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
  return `user-${safe}`;
}
