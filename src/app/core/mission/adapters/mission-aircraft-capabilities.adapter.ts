import { Injectable } from '@angular/core';

import type { MissionAircraftCapabilities } from '@fpv/mission-domain';

import type { AircraftDefinition } from '../../aircraft/models/aircraft-definition.model';
import type { AircraftSourceType } from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import { FLIGHT_RUNTIME_COMPATIBILITY_VERSION } from '../../flight-runtime/models/authoritative-flight-step-snapshot';

export type MissionAircraftCapabilitiesAdaptResult =
  | {
      readonly ok: true;
      readonly capabilities: MissionAircraftCapabilities;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: 'AIRCRAFT_CAPABILITY_ADAPTER_FAILED';
      readonly reason: string;
    };

/**
 * Maps active runtime AircraftDefinition → Checkpoint 2 MissionAircraftCapabilities.
 * Factory and compiled aircraft share this single adapter path.
 * Does not invent endurance, battery-drain, or build-specific optics fidelity.
 */
@Injectable({ providedIn: 'root' })
export class MissionAircraftCapabilitiesAdapter {
  adapt(definition: AircraftDefinition): MissionAircraftCapabilitiesAdaptResult {
    if (!definition?.id) {
      return {
        ok: false,
        code: 'AIRCRAFT_CAPABILITY_ADAPTER_FAILED',
        reason: 'Aircraft definition missing id',
      };
    }

    const sourceType = this.resolveSourceType(definition);
    const warnings: string[] = [];
    const templateDerived = sourceType === 'user-compiled';

    if (templateDerived) {
      warnings.push(
        'Compiled aircraft camera/collision capability is template-derived where applicable',
      );
    }

    const hasCamera = Boolean(definition.cameraProfile?.fpv);
    const cameraProfileCapability = hasCamera
      ? {
          minFovDeg: definition.cameraProfile.fpv.minFov,
          maxFovDeg: definition.cameraProfile.fpv.maxFov,
          provenance: templateDerived
            ? ('template-derived' as const)
            : ('runtime' as const),
        }
      : undefined;

    if (templateDerived && hasCamera) {
      warnings.push('cameraProfileCapability.provenance=template-derived');
    }

    const collisionProfileAvailable = Boolean(
      definition.collisionProfile &&
        Array.isArray(definition.collisionProfile.parts) &&
        definition.collisionProfile.parts.length > 0,
    );

    if (templateDerived && collisionProfileAvailable) {
      warnings.push('collisionProvenance=template-derived');
    }

    const capabilities: MissionAircraftCapabilities = {
      aircraftId: definition.id,
      sourceType,
      category: definition.category,
      widthMeters: definition.widthMeters,
      heightMeters: definition.heightMeters,
      takeoffMassKg: definition.takeoffMassKg,
      thrustToWeight: definition.thrustToWeightRatio,
      recommendedMaxSpeedMps: definition.maximumForwardSpeed,
      hasCamera,
      cameraProfileCapability,
      collisionProfileAvailable,
      collisionProvenance: collisionProfileAvailable
        ? templateDerived
          ? 'template-derived'
          : 'runtime'
        : undefined,
      runtimeCompatibilityVersion:
        definition.physicsProfileVersion || FLIGHT_RUNTIME_COMPATIBILITY_VERSION,
      definitionVersion: definition.definitionVersion,
      // Deliberately omit estimatedEnduranceMinutes — do not invent endurance.
    };

    return { ok: true, capabilities, warnings };
  }

  resolveSourceType(definition: AircraftDefinition): AircraftSourceType {
    if (
      definition.tags?.includes('user-build') ||
      definition.tags?.includes('compiled')
    ) {
      return 'user-compiled';
    }
    return 'factory';
  }
}
