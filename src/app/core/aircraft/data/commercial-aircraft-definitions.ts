import { compileAllFactoryAircraft } from '@fpv/factory-aircraft';
import type { AdaptedFlightProfile } from '@fpv/aircraft-runtime-adapter';

import type { AircraftDefinition } from '../models/aircraft-definition.model';
import type { AircraftId } from '../models/aircraft-ids';
import type { FlightProfile } from '../models/flight-profile.model';
import {
  COLLISION_AEROGUARD_2,
  COLLISION_APEX_R5,
  COLLISION_FLUX_F5,
  COLLISION_HORIZON_L7,
  COLLISION_NANO_SCOUT,
  COLLISION_VELOCITY_X,
} from './collision-profiles';
import {
  AUDIO_AEROGUARD_2,
  AUDIO_APEX_R5,
  AUDIO_FLUX_F5,
  AUDIO_HORIZON_L7,
  AUDIO_NANO_SCOUT,
  AUDIO_VELOCITY_X,
  CAMERA_AEROGUARD_2,
  CAMERA_APEX_R5,
  CAMERA_FLUX_F5,
  CAMERA_HORIZON_L7,
  CAMERA_NANO_SCOUT,
  CAMERA_VELOCITY_X,
  DAMAGE_AEROGUARD_2,
  DAMAGE_APEX_R5,
  DAMAGE_FLUX_F5,
  DAMAGE_HORIZON_L7,
  DAMAGE_NANO_SCOUT,
  DAMAGE_VELOCITY_X,
  VISUAL_AEROGUARD_2,
  VISUAL_APEX_R5,
  VISUAL_FLUX_F5,
  VISUAL_HORIZON_L7,
  VISUAL_NANO_SCOUT,
  VISUAL_VELOCITY_X,
} from './shared-profiles';

const LEGAL =
  'Original commercial aircraft. Not affiliated with or endorsed by any real-world manufacturer. Flight behavior is a simulator approximation.';

const PHYSICS_LABEL =
  'Simulator approximation compiled from factory build manifests via Drone Builder engineering core v1.1';

const PRESENTATION = {
  'aeroguard-2': {
    camera: CAMERA_AEROGUARD_2,
    collision: COLLISION_AEROGUARD_2,
    visual: VISUAL_AEROGUARD_2,
    audio: AUDIO_AEROGUARD_2,
    damage: DAMAGE_AEROGUARD_2,
  },
  'velocity-x': {
    camera: CAMERA_VELOCITY_X,
    collision: COLLISION_VELOCITY_X,
    visual: VISUAL_VELOCITY_X,
    audio: AUDIO_VELOCITY_X,
    damage: DAMAGE_VELOCITY_X,
  },
  'nano-scout': {
    camera: CAMERA_NANO_SCOUT,
    collision: COLLISION_NANO_SCOUT,
    visual: VISUAL_NANO_SCOUT,
    audio: AUDIO_NANO_SCOUT,
    damage: DAMAGE_NANO_SCOUT,
  },
  'apex-r5': {
    camera: CAMERA_APEX_R5,
    collision: COLLISION_APEX_R5,
    visual: VISUAL_APEX_R5,
    audio: AUDIO_APEX_R5,
    damage: DAMAGE_APEX_R5,
  },
  'flux-f5': {
    camera: CAMERA_FLUX_F5,
    collision: COLLISION_FLUX_F5,
    visual: VISUAL_FLUX_F5,
    audio: AUDIO_FLUX_F5,
    damage: DAMAGE_FLUX_F5,
  },
  'horizon-l7': {
    camera: CAMERA_HORIZON_L7,
    collision: COLLISION_HORIZON_L7,
    visual: VISUAL_HORIZON_L7,
    audio: AUDIO_HORIZON_L7,
    damage: DAMAGE_HORIZON_L7,
  },
} as const;

function toFlightProfile(adapted: AdaptedFlightProfile): FlightProfile {
  return { ...adapted };
}

/**
 * Commercial aircraft are factory build manifests compiled through the
 * unified engineering pipeline, then adapted into AircraftDefinition.
 * Presentation profiles (visual/audio/collision/camera/damage) remain curated.
 */
export const COMMERCIAL_AIRCRAFT_DEFINITIONS: AircraftDefinition[] =
  compileAllFactoryAircraft().map((compiled) => {
    const p = compiled.presentation;
    const phys = compiled.physics;
    const flight = toFlightProfile(compiled.flightProfile);
    const packs = PRESENTATION[p.profileKey];

    return {
      id: p.aircraftId as AircraftId,
      slug: p.slug,
      displayName: p.displayName,
      manufacturerName: p.manufacturerName,
      fictionalManufacturer: true as const,
      category: p.category,
      generation: 1,
      releaseStatus: 'available' as const,
      description: p.description,
      shortDescription: p.shortDescription,
      tags: [...p.tags],
      referenceProfileId: p.referenceProfileId,
      referenceCategory: p.referenceCategory,
      derivedFromPublicSpecifications: true,
      physicsAccuracyLabel: PHYSICS_LABEL,
      legalNotes: LEGAL,
      widthMeters: phys.widthMeters,
      lengthMeters: phys.lengthMeters,
      heightMeters: phys.heightMeters,
      wheelbaseMeters: phys.wheelbaseMeters,
      propellerDiameterMeters: phys.propellerDiameterMeters,
      ductDiameterMeters: p.ductDiameterMeters,
      dryMassKg: phys.dryMassKg,
      batteryMassKg: phys.batteryMassKg,
      takeoffMassKg: phys.takeoffMassKg,
      centerOfMassOffset: { ...phys.centerOfMassOffset },
      centerOfMassHeight: phys.centerOfMassHeight,
      nominalVoltage: phys.nominalVoltage,
      batteryCellCount: phys.batteryCellCount,
      batteryCapacityMah: phys.batteryCapacityMah,
      maximumThrustNewtons: phys.maximumThrustNewtons,
      hoverThrottleRatio: phys.hoverThrottleRatio,
      thrustToWeightRatio: phys.thrustToWeightRatio,
      motorResponseTime: phys.motorResponseTime,
      spoolUpTime: phys.spoolUpTime,
      spoolDownTime: phys.spoolDownTime,
      frontalDragCoefficient: phys.frontalDragCoefficient,
      lateralDragCoefficient: phys.lateralDragCoefficient,
      verticalDragCoefficient: phys.verticalDragCoefficient,
      angularDrag: phys.angularDrag,
      propWashStrength: phys.propWashStrength,
      groundEffectStrength: phys.groundEffectStrength,
      windSensitivity: phys.windSensitivity,
      glideEfficiency: phys.glideEfficiency,
      rollInertia: phys.rollInertia,
      pitchInertia: phys.pitchInertia,
      yawInertia: phys.yawInertia,
      angularAccelerationLimits: { ...phys.angularAccelerationLimits },
      angularVelocityLimits: { ...phys.angularVelocityLimits },
      defaultRateProfile: p.defaultRateProfile,
      supportedRateProfiles: [...p.supportedRateProfiles],
      throttleCurve: phys.throttleCurve,
      throttleExpo: p.throttleExpo,
      stabilizationStrength: flight.stabilizationStrength,
      selfLevelingAvailable: flight.selfLevelingAvailable,
      altitudeAssistAvailable: flight.altitudeAssistAvailable,
      maximumForwardSpeed: phys.maximumForwardSpeed,
      maximumClimbSpeed: phys.maximumClimbSpeed,
      maximumDescentSpeed: phys.maximumDescentSpeed,
      brakingStrength: flight.brakingStrength,
      recoveryStrength: flight.recoveryStrength,
      flightProfile: flight,
      cameraProfile: packs.camera,
      collisionProfile: packs.collision,
      visualProfile: packs.visual,
      audioProfile: packs.audio,
      damageProfile: packs.damage,
      difficulty: p.difficulty,
      recommendedSkillLevel: p.recommendedSkillLevel,
      recommendedModes: [...p.recommendedModes],
      recommendedEnvironments: [...p.recommendedEnvironments],
      unlockPolicy: p.unlockPolicy,
      isAvailableByDefault: p.isAvailableByDefault,
      definitionVersion: '1.1.0',
      physicsProfileVersion: flight.version,
      colliderVersion: packs.collision.version,
      visualVersion: packs.visual.version,
      audioVersion: packs.audio.version,
    };
  });
