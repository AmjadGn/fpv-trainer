import type { PerspectiveCamera, Vector3 } from 'three';

import type { ResolvedFlightCameraRig } from '../models/resolved-flight-camera-rig';
import {
  computeLegacyFpvCameraPosition,
} from '../math/flight-camera-world-pose';
import { fpvLookDirection } from '../../rendering/utils/flight-frame-sync';
import {
  bodyRightWorld,
  bodyUpWorld,
  rotateVecByQuatAlloc,
} from '../../flight/utils/quat-math';
import type { Quat, Vec3 } from '../../flight/models/flight-state.model';

/**
 * Presentation-only cosmetic offsets applied AFTER the authoritative base pose.
 * Must never feed mission photography scoring.
 */
export interface FlightCameraCosmeticEffects {
  readonly positionOffset?: Vec3;
  readonly lookLagPitch?: number;
  readonly lookLagYaw?: number;
  readonly lookLagRoll?: number;
  readonly fovOffsetDegrees?: number;
}

export interface ThreeFlightCameraViewInput {
  readonly aircraftPosition: Vec3;
  readonly aircraftOrientation: Quat;
  readonly rig: ResolvedFlightCameraRig;
  readonly cosmetics?: FlightCameraCosmeticEffects | null;
}

/**
 * Applies ResolvedFlightCameraRig base pose to a Three.js PerspectiveCamera,
 * then optionally layers presentation-only cosmetics.
 *
 * Owned by / delegated from ThreeRendererService — not a second camera authority.
 */
export class ThreeFlightCameraViewAdapter {
  applyFpvBaseThenCosmetics(
    camera: PerspectiveCamera,
    input: ThreeFlightCameraViewInput,
    scratch: {
      offset: Vector3;
      forward: Vector3;
      up: Vector3;
      right: Vector3;
      target: Vector3;
    },
  ): { readonly baseFovDegrees: number; readonly appliedFovDegrees: number } {
    const { aircraftPosition, aircraftOrientation, rig, cosmetics } = input;
    const fx = cosmetics ?? null;

    const basePos = computeLegacyFpvCameraPosition(
      aircraftPosition,
      aircraftOrientation,
      rig.localMountPosition,
    );

    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (fx?.positionOffset) {
      const right = bodyRightWorld(aircraftOrientation);
      const up = bodyUpWorld(aircraftOrientation);
      const forward = rotateVecByQuatAlloc(0, 0, -1, aircraftOrientation);
      ox =
        right.x * fx.positionOffset.x +
        up.x * fx.positionOffset.y +
        forward.x * fx.positionOffset.z;
      oy =
        right.y * fx.positionOffset.x +
        up.y * fx.positionOffset.y +
        forward.y * fx.positionOffset.z;
      oz =
        right.z * fx.positionOffset.x +
        up.z * fx.positionOffset.y +
        forward.z * fx.positionOffset.z;
    }

    camera.position.set(basePos.x + ox, basePos.y + oy, basePos.z + oz);

    const tilt = rig.localCameraTiltRad + (fx?.lookLagPitch ?? 0);
    let look = fpvLookDirection(aircraftOrientation, tilt);
    let up = bodyUpWorld(aircraftOrientation);

    if (fx) {
      const right = bodyRightWorld(aircraftOrientation);
      const yaw = fx.lookLagYaw ?? 0;
      const roll = fx.lookLagRoll ?? 0;
      look = {
        x: look.x + right.x * yaw,
        y: look.y + right.y * yaw,
        z: look.z + right.z * yaw,
      };
      const lookMag = Math.hypot(look.x, look.y, look.z) || 1;
      look = { x: look.x / lookMag, y: look.y / lookMag, z: look.z / lookMag };
      up = {
        x: up.x + right.x * roll,
        y: up.y + right.y * roll,
        z: up.z + right.z * roll,
      };
      const upMag = Math.hypot(up.x, up.y, up.z) || 1;
      up = { x: up.x / upMag, y: up.y / upMag, z: up.z / upMag };
    }

    scratch.forward.set(look.x, look.y, look.z);
    scratch.up.set(up.x, up.y, up.z);
    scratch.target.copy(camera.position).add(scratch.forward);
    camera.up.copy(scratch.up);
    camera.lookAt(scratch.target);

    const baseFov = rig.baseVerticalFovDegrees;
    const appliedFov = baseFov + (fx?.fovOffsetDegrees ?? 0);
    if (Math.abs(camera.fov - appliedFov) > 0.01) {
      camera.fov = appliedFov;
      camera.updateProjectionMatrix();
    }

    return { baseFovDegrees: baseFov, appliedFovDegrees: appliedFov };
  }

  /**
   * Pure base pose (no cosmetics) for parity tests — mirrors adapter math
   * without requiring a live Three.js camera.
   */
  computeBasePose(input: Omit<ThreeFlightCameraViewInput, 'cosmetics'>): {
    readonly position: Vec3;
    readonly forward: Vec3;
    readonly up: Vec3;
    readonly baseFovDegrees: number;
  } {
    const position = computeLegacyFpvCameraPosition(
      input.aircraftPosition,
      input.aircraftOrientation,
      input.rig.localMountPosition,
    );
    return {
      position,
      forward: fpvLookDirection(
        input.aircraftOrientation,
        input.rig.localCameraTiltRad,
      ),
      up: bodyUpWorld(input.aircraftOrientation),
      baseFovDegrees: input.rig.baseVerticalFovDegrees,
    };
  }
}

/** Shared singleton helper used by ThreeRendererService. */
export const threeFlightCameraViewAdapter = new ThreeFlightCameraViewAdapter();
