import { Injectable } from '@angular/core';

import type { AircraftDefinition } from '../../aircraft/models/aircraft-definition.model';
import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import {
  DEFAULT_MISSION_CAPTURE_ASPECT,
  DEFAULT_PROJECTION_MODEL_VERSION,
  LEGACY_FPV_BASE_FOV_DEGREES,
  LEGACY_FPV_FAR_METERS,
  LEGACY_FPV_MOUNT_POSITION,
  LEGACY_FPV_NEAR_METERS,
  RESOLVED_FLIGHT_CAMERA_RIG_VERSION,
  type FlightCameraResolutionStrategy,
  type ResolvedFlightCameraRig,
  type SourceCameraProfileMetadata,
} from '../models/resolved-flight-camera-rig';

export interface FlightCameraRigResolveInput {
  readonly aircraft: AircraftDefinition | null;
  readonly appliedFpvCameraTiltRad: number;
  readonly strategy?: FlightCameraResolutionStrategy;
  readonly templateDerivedCamera?: boolean;
}

/**
 * Canonical resolver: one authoritative rig per active flight session.
 * Default strategy preserves current visible renderer behavior
 * (`legacy-renderer-compatible-v1`) until profile normalization lands.
 */
@Injectable({ providedIn: 'root' })
export class FlightCameraRigResolver {
  resolve(input: FlightCameraRigResolveInput): ResolvedFlightCameraRig {
    const strategy = input.strategy ?? 'legacy-renderer-compatible-v1';
    const source = this.readSourceProfile(input.aircraft);
    const templateDerived = input.templateDerivedCamera ?? this.inferTemplateDerived(input.aircraft);

    if (strategy === 'aircraft-profile-v1' && input.aircraft?.cameraProfile?.fpv) {
      return this.resolveFromProfile(input, source, templateDerived);
    }

    return this.resolveLegacyCompatible(input, source, templateDerived);
  }

  private resolveLegacyCompatible(
    input: FlightCameraRigResolveInput,
    source: SourceCameraProfileMetadata,
    templateDerived: boolean,
  ): ResolvedFlightCameraRig {
    const diagnostics = [...source.mismatchDiagnostics];
    if (source.sourceLocalPosition) {
      const p = source.sourceLocalPosition;
      if (
        Math.abs(p.x - LEGACY_FPV_MOUNT_POSITION.x) > 1e-6 ||
        Math.abs(p.y - LEGACY_FPV_MOUNT_POSITION.y) > 1e-6 ||
        Math.abs(p.z - LEGACY_FPV_MOUNT_POSITION.z) > 1e-6
      ) {
        diagnostics.push(
          `fpv.localPosition (${p.x},${p.y},${p.z}) differs from legacy mount; using legacy`,
        );
      }
    }
    if (
      source.sourceDefaultFov !== null &&
      Math.abs(source.sourceDefaultFov - LEGACY_FPV_BASE_FOV_DEGREES) > 1e-6
    ) {
      diagnostics.push(
        `fpv.defaultFov (${source.sourceDefaultFov}) differs from legacy ${LEGACY_FPV_BASE_FOV_DEGREES}; using legacy`,
      );
    }

    const tilt =
      Number.isFinite(input.appliedFpvCameraTiltRad)
        ? input.appliedFpvCameraTiltRad
        : FLIGHT_CONFIG.fpvCameraTilt;

    return {
      rigId: `legacy-fpv:${input.aircraft?.id ?? 'none'}`,
      rigVersion: RESOLVED_FLIGHT_CAMERA_RIG_VERSION,
      resolutionStrategy: 'legacy-renderer-compatible-v1',
      localMountPosition: { ...LEGACY_FPV_MOUNT_POSITION },
      localCameraTiltRad: tilt,
      baseVerticalFovDegrees: LEGACY_FPV_BASE_FOV_DEGREES,
      missionCaptureAspectRatio: DEFAULT_MISSION_CAPTURE_ASPECT,
      nearMeters: LEGACY_FPV_NEAR_METERS,
      farMeters: LEGACY_FPV_FAR_METERS,
      projectionModelVersion: DEFAULT_PROJECTION_MODEL_VERSION,
      sourceCameraProfile: { ...source, mismatchDiagnostics: diagnostics },
      legacyCompatibilityUsed: true,
      templateDerivedCamera: templateDerived,
      cosmeticEffectsExcluded: true,
    };
  }

  private resolveFromProfile(
    input: FlightCameraRigResolveInput,
    source: SourceCameraProfileMetadata,
    templateDerived: boolean,
  ): ResolvedFlightCameraRig {
    const fpv = input.aircraft!.cameraProfile.fpv;
    const tiltRad = (fpv.cameraAngleDeg * Math.PI) / 180;
    return {
      rigId: `profile-fpv:${input.aircraft!.id}`,
      rigVersion: RESOLVED_FLIGHT_CAMERA_RIG_VERSION,
      resolutionStrategy: 'aircraft-profile-v1',
      localMountPosition: { ...fpv.localPosition },
      localCameraTiltRad: tiltRad,
      baseVerticalFovDegrees: fpv.defaultFov,
      missionCaptureAspectRatio: DEFAULT_MISSION_CAPTURE_ASPECT,
      nearMeters: LEGACY_FPV_NEAR_METERS,
      farMeters: LEGACY_FPV_FAR_METERS,
      projectionModelVersion: DEFAULT_PROJECTION_MODEL_VERSION,
      sourceCameraProfile: source,
      legacyCompatibilityUsed: false,
      templateDerivedCamera: templateDerived,
      cosmeticEffectsExcluded: true,
    };
  }

  private readSourceProfile(aircraft: AircraftDefinition | null): SourceCameraProfileMetadata {
    if (!aircraft?.cameraProfile?.fpv) {
      return {
        profileId: null,
        profileVersion: null,
        sourceLocalPosition: null,
        sourceCameraAngleDeg: null,
        sourceDefaultFov: null,
        mismatchDiagnostics: ['no aircraft cameraProfile available'],
      };
    }
    const cam = aircraft.cameraProfile;
    return {
      profileId: cam.id,
      profileVersion: cam.version,
      sourceLocalPosition: { ...cam.fpv.localPosition },
      sourceCameraAngleDeg: cam.fpv.cameraAngleDeg,
      sourceDefaultFov: cam.fpv.defaultFov,
      mismatchDiagnostics: [],
    };
  }

  private inferTemplateDerived(aircraft: AircraftDefinition | null): boolean {
    if (!aircraft) {
      return false;
    }
    return aircraft.tags.includes('user-build') || aircraft.tags.includes('compiled');
  }
}
