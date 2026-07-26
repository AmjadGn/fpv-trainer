import { Injectable, inject } from '@angular/core';

import {
  MISSION_CAPTURE_ASPECT_RATIO,
  type CameraSnapshot,
  createCameraProjection,
} from '@fpv/simulation-contracts';

import type { Quat, Vec3 } from '../../flight/models/flight-state.model';
import { resolveAuthoritativeFlightCameraWorldSnapshot } from '../math/flight-camera-world-pose';
import type { ResolvedFlightCameraRig } from '../models/resolved-flight-camera-rig';
import { FlightCameraRigResolver } from './flight-camera-rig-resolver.service';

/**
 * Builds immutable CameraSnapshot DTOs from aircraft pose + resolved rig.
 * Never includes cosmetic camera effects.
 */
@Injectable({ providedIn: 'root' })
export class FlightCameraSnapshotAdapter {
  private readonly resolver = inject(FlightCameraRigResolver);
  private activeRig: ResolvedFlightCameraRig | null = null;

  setActiveRig(rig: ResolvedFlightCameraRig): void {
    this.activeRig = rig;
  }

  clearActiveRig(): void {
    this.activeRig = null;
  }

  getActiveRig(): ResolvedFlightCameraRig | null {
    return this.activeRig;
  }

  /**
   * Ensures a single authoritative rig for the session. Re-resolving with the
   * same inputs is allowed; callers should call setActiveRig once per session.
   */
  resolveAndActivate(
    ...args: Parameters<FlightCameraRigResolver['resolve']>
  ): ResolvedFlightCameraRig {
    const rig = this.resolver.resolve(...args);
    this.activeRig = rig;
    return rig;
  }

  buildSnapshot(
    aircraftPosition: Vec3,
    aircraftOrientation: Quat,
    rig: ResolvedFlightCameraRig = this.requireActiveRig(),
  ): CameraSnapshot {
    const world = resolveAuthoritativeFlightCameraWorldSnapshot(
      aircraftPosition,
      aircraftOrientation,
      rig,
    );
    const projectionResult = createCameraProjection(
      world.baseVerticalFovDegrees,
      MISSION_CAPTURE_ASPECT_RATIO,
      world.nearMeters,
      world.farMeters,
      rig.projectionModelVersion,
    );
    if (!projectionResult.ok) {
      throw new Error(`CAMERA_RIG_RESOLUTION_FAILED: ${projectionResult.reason}`);
    }
    return {
      worldPose: world.worldPose,
      localMountPose: {
        position: { ...rig.localMountPosition },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      projection: projectionResult.value,
    };
  }

  private requireActiveRig(): ResolvedFlightCameraRig {
    if (!this.activeRig) {
      throw new Error('CAMERA_RIG_RESOLUTION_FAILED: no active ResolvedFlightCameraRig');
    }
    return this.activeRig;
  }
}
