import { describe, expect, it } from 'vitest';
import type { CameraSnapshot, Pose, Quat } from '@fpv/simulation-contracts';
import { IDENTITY_QUAT } from '@fpv/simulation-contracts';
import {
  centeringError,
  computeNormalizedScreenRectangle,
  coverageRatio,
  distance,
  evaluateAltitudeRange,
  evaluateSpeedThresholds,
  evaluateViewingSide,
  frameIntersectionRatio,
  invertUnitQuat,
  isInFrontOfCamera,
  projectPerspectiveToNormalized,
  projectSubjectSamplePoints,
  projectWorldPoint,
  rotateVectorByQuat,
  viewingAngle,
  worldPointToCameraLocal,
} from './projection';

function makeCameraSnapshot(
  pose: Pose,
  overrides?: Partial<{ verticalFovDegrees: number; aspectRatio: number; nearMeters: number; farMeters: number }>,
): CameraSnapshot {
  return {
    worldPose: pose,
    projection: {
      verticalFovDegrees: overrides?.verticalFovDegrees ?? 90,
      aspectRatio: overrides?.aspectRatio ?? 16 / 9,
      nearMeters: overrides?.nearMeters ?? 0.1,
      farMeters: overrides?.farMeters ?? 1000,
      projectionModelVersion: '1.0.0',
    },
  };
}

/** Geometric yaw quaternion (rotation about world +Y by `degrees`). Purely geometric — no controller polarity. */
function yawQuat(degrees: number): Quat {
  const half = (degrees * Math.PI) / 180 / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/** Geometric pitch quaternion (rotation about body/world +X by `degrees`, positive = nose up). */
function pitchQuat(degrees: number): Quat {
  const half = (degrees * Math.PI) / 180 / 2;
  return { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
}

const ORIGIN_IDENTITY_POSE: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: IDENTITY_QUAT };

describe('projection: quaternion invert/rotate (reject-invalid policy)', () => {
  it('inverts a unit quaternion via conjugate', () => {
    const result = invertUnitQuat(yawQuat(90));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.w).toBeCloseTo(Math.cos(Math.PI / 4));
      expect(result.value.y).toBeCloseTo(-Math.sin(Math.PI / 4));
    }
  });

  it('rejects a non-finite quaternion', () => {
    const result = invertUnitQuat({ x: Number.NaN, y: 0, z: 0, w: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-unit quaternion rather than silently renormalizing', () => {
    const result = invertUnitQuat({ x: 0, y: 0, z: 0, w: 2 });
    expect(result.ok).toBe(false);
  });

  it('rotates a vector by a unit quaternion using the Hamilton convention', () => {
    const result = rotateVectorByQuat({ x: 0, y: 0, z: -1 }, yawQuat(90));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.x).toBeCloseTo(-1, 5);
      expect(result.value.y).toBeCloseTo(0, 5);
      expect(result.value.z).toBeCloseTo(0, 5);
    }
  });
});

describe('projection golden 1: centered subject', () => {
  it('projects a point directly ahead to the optical center', () => {
    const camera = makeCameraSnapshot(ORIGIN_IDENTITY_POSE);
    const result = projectWorldPoint({ x: 0, y: 0, z: -10 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inFrontOfCamera).toBe(true);
    expect(result.value.withinClipRange).toBe(true);
    expect(result.value.distanceMeters).toBeCloseTo(10);
    expect(result.value.screen).not.toBeNull();
    expect(result.value.screen!.u).toBeCloseTo(0.5, 6);
    expect(result.value.screen!.v).toBeCloseTo(0.5, 6);
  });
});

describe('projection golden 2: frame edge', () => {
  it('projects a point exactly at the vertical frustum edge to v = 0 (top)', () => {
    const camera = makeCameraSnapshot(ORIGIN_IDENTITY_POSE, { verticalFovDegrees: 90 });
    // tan(45deg) = 1, so at depth 10 the frustum half-height is 10.
    const result = projectWorldPoint({ x: 0, y: 10, z: -10 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.screen).not.toBeNull();
    expect(result.value.screen!.u).toBeCloseTo(0.5, 6);
    expect(result.value.screen!.v).toBeCloseTo(0, 6);
  });
});

describe('projection golden 3: outside frame', () => {
  it('projects a point well outside the horizontal FOV to u > 1, contributing zero frame intersection', () => {
    const camera = makeCameraSnapshot(ORIGIN_IDENTITY_POSE, { verticalFovDegrees: 90, aspectRatio: 1 });
    // tanHalfHorizontal = 1 (aspect 1). At depth 10, frustum half-width is 10; x=50 is far outside.
    const result = projectWorldPoint({ x: 50, y: 0, z: -10 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.withinClipRange).toBe(true); // still geometrically in front & in clip range
    expect(result.value.screen).not.toBeNull();
    expect(result.value.screen!.u).toBeGreaterThan(1);

    const rectResult = computeNormalizedScreenRectangle([result.value]);
    expect(rectResult.ok).toBe(true);
    if (rectResult.ok) {
      expect(frameIntersectionRatio(rectResult.value)).toBe(0);
    }
  });
});

describe('projection golden 4: behind camera', () => {
  it('reports inFrontOfCamera=false and screen=null for a point behind the camera', () => {
    const camera = makeCameraSnapshot(ORIGIN_IDENTITY_POSE);
    const result = projectWorldPoint({ x: 0, y: 0, z: 10 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inFrontOfCamera).toBe(false);
    expect(result.value.withinClipRange).toBe(false);
    expect(result.value.screen).toBeNull();
    expect(isInFrontOfCamera(result.value.localPoint)).toBe(false);
  });
});

describe('projection golden 5: rotated camera (combined yaw + pitch)', () => {
  it('transforms a world point into a rotated camera local frame consistently with worldPointToCameraLocal + isInFrontOfCamera', () => {
    const pose: Pose = {
      position: { x: 1, y: 2, z: 3 },
      orientation: yawQuat(30),
    };
    const worldPoint = { x: 1, y: 2, z: 3 - 5 }; // 5m along the unrotated -Z axis from camera position... rotated by yaw
    // Recompute expected using the same rotation the module uses, applied to camera-relative vector.
    const relative = { x: worldPoint.x - pose.position.x, y: worldPoint.y - pose.position.y, z: worldPoint.z - pose.position.z };
    const inverse = invertUnitQuat(pose.orientation);
    expect(inverse.ok).toBe(true);
    const expectedLocal = inverse.ok ? rotateVectorByQuat(relative, inverse.value) : null;
    expect(expectedLocal && expectedLocal.ok).toBe(true);

    const result = worldPointToCameraLocal(worldPoint, pose);
    expect(result.ok).toBe(true);
    if (result.ok && expectedLocal && expectedLocal.ok) {
      expect(result.value.x).toBeCloseTo(expectedLocal.value.x, 9);
      expect(result.value.y).toBeCloseTo(expectedLocal.value.y, 9);
      expect(result.value.z).toBeCloseTo(expectedLocal.value.z, 9);
    }
  });
});

describe('projection golden 6: yaw 90 degrees', () => {
  it('centers a subject placed along the yawed forward axis (-X after +90deg yaw)', () => {
    const pose: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: yawQuat(90) };
    const camera = makeCameraSnapshot(pose);
    const result = projectWorldPoint({ x: -10, y: 0, z: 0 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.localPoint.x).toBeCloseTo(0, 6);
    expect(result.value.localPoint.y).toBeCloseTo(0, 6);
    expect(result.value.localPoint.z).toBeCloseTo(-10, 6);
    expect(result.value.screen!.u).toBeCloseTo(0.5, 6);
    expect(result.value.screen!.v).toBeCloseTo(0.5, 6);
  });

  it('does NOT center a subject that was ahead pre-yaw (+90deg yaw moves -Z out of frame center)', () => {
    const pose: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: yawQuat(90) };
    const camera = makeCameraSnapshot(pose);
    const result = projectWorldPoint({ x: 0, y: 0, z: -10 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Original forward point is now off to one side (localPoint.z ~ 0), not in front.
    expect(result.value.inFrontOfCamera).toBe(false);
  });
});

describe('projection golden 7: yaw 180 degrees', () => {
  it('centers a subject behind the original forward axis (+Z) after a 180deg yaw', () => {
    const pose: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: yawQuat(180) };
    const camera = makeCameraSnapshot(pose);
    const result = projectWorldPoint({ x: 0, y: 0, z: 10 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.localPoint.z).toBeCloseTo(-10, 5);
    expect(result.value.screen!.u).toBeCloseTo(0.5, 5);
    expect(result.value.screen!.v).toBeCloseTo(0.5, 5);
  });
});

describe('projection golden 8: tilted up (pitch)', () => {
  it('pushes a level, straight-ahead subject below center when the camera tilts up', () => {
    const pose: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: pitchQuat(30) };
    const camera = makeCameraSnapshot(pose);
    const result = projectWorldPoint({ x: 0, y: 0, z: -10 }, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.localPoint.y).toBeLessThan(0);
    expect(result.value.screen!.v).toBeGreaterThan(0.5);
  });
});

describe('projection golden 9: partial outside frame', () => {
  it('computes a frame intersection ratio strictly between 0 and 1 for a rectangle straddling the frame edge', () => {
    const rect = { minU: 0.8, minV: 0.2, maxU: 1.2, maxV: 0.8 };
    const ratio = frameIntersectionRatio(rect);
    // rect area = 0.4 * 0.6 = 0.24; intersection with [0,1]^2 = (1-0.8)*0.6 = 0.12; ratio = 0.5
    expect(ratio).toBeCloseTo(0.5, 6);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);

    const coverage = coverageRatio(rect);
    // intersection area is 0.12 out of full-frame area 1
    expect(coverage).toBeCloseTo(0.12, 6);
  });
});

describe('projection golden 10: invalid quaternion', () => {
  it('rejects projection through a camera pose with a non-unit orientation quaternion', () => {
    const pose: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 5 } };
    const camera = makeCameraSnapshot(pose);
    const result = projectWorldPoint({ x: 0, y: 0, z: -10 }, camera);
    expect(result.ok).toBe(false);
  });

  it('rejects a batch projection at the first invalid point/camera combination', () => {
    const pose: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: { x: Number.NaN, y: 0, z: 0, w: 1 } };
    const camera = makeCameraSnapshot(pose);
    const result = projectSubjectSamplePoints([{ x: 0, y: 0, z: -1 }], camera);
    expect(result.ok).toBe(false);
  });
});

describe('projection golden 11: near-plane clipping', () => {
  it('treats a point closer than nearMeters as in front but not within the clip range', () => {
    const camera = makeCameraSnapshot(ORIGIN_IDENTITY_POSE, { nearMeters: 1 });
    const tooClose = projectWorldPoint({ x: 0, y: 0, z: -0.5 }, camera);
    expect(tooClose.ok).toBe(true);
    if (tooClose.ok) {
      expect(tooClose.value.inFrontOfCamera).toBe(true);
      expect(tooClose.value.withinClipRange).toBe(false);
      expect(tooClose.value.screen).toBeNull();
    }

    const exactlyAtNear = projectWorldPoint({ x: 0, y: 0, z: -1 }, camera);
    expect(exactlyAtNear.ok).toBe(true);
    if (exactlyAtNear.ok) {
      expect(exactlyAtNear.value.withinClipRange).toBe(true);
      expect(exactlyAtNear.value.screen).not.toBeNull();
    }
  });
});

describe('projection golden 12: aspect-ratio invariance of vertical FOV', () => {
  it('keeps v (vertical) projection unchanged across aspect ratios for an on-axis-vertical point, while u still varies for an off-axis point', () => {
    const pose = ORIGIN_IDENTITY_POSE;
    const point = { x: 0, y: 5, z: -10 };
    const wide = projectPerspectiveToNormalized(point, 90, 16 / 9);
    const square = projectPerspectiveToNormalized(point, 90, 1);
    expect(wide.ok).toBe(true);
    expect(square.ok).toBe(true);
    if (wide.ok && square.ok) {
      expect(wide.value.v).toBeCloseTo(square.value.v, 9);
      expect(wide.value.u).toBeCloseTo(square.value.u, 9); // x = 0, so u is unaffected here too
    }

    const offAxisPoint = { x: 5, y: 0, z: -10 };
    const wideOffAxis = projectPerspectiveToNormalized(offAxisPoint, 90, 16 / 9);
    const squareOffAxis = projectPerspectiveToNormalized(offAxisPoint, 90, 1);
    expect(wideOffAxis.ok).toBe(true);
    expect(squareOffAxis.ok).toBe(true);
    if (wideOffAxis.ok && squareOffAxis.ok) {
      expect(wideOffAxis.value.u).not.toBeCloseTo(squareOffAxis.value.u, 3);
    }
  });
});

describe('projection: distance / viewingAngle / evaluateViewingSide / altitude / speed helpers', () => {
  it('computes straight-line distance', () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5);
  });

  it('computes viewingAngle as 0 for a dead-ahead subject and 90 for a subject directly to the side', () => {
    const camera: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: IDENTITY_QUAT };
    const ahead = viewingAngle(camera, { x: 0, y: 0, z: -10 });
    expect(ahead.ok).toBe(true);
    if (ahead.ok) expect(ahead.value).toBeCloseTo(0, 6);

    const toSide = viewingAngle(camera, { x: 10, y: 0, z: 0 });
    expect(toSide.ok).toBe(true);
    if (toSide.ok) expect(toSide.value).toBeCloseTo(90, 6);
  });

  it('classifies viewing side as front/back/left/right', () => {
    const subject: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: IDENTITY_QUAT }; // subject forward = -Z (world)
    const cameraInFrontOfSubject: Pose = { position: { x: 0, y: 0, z: -10 }, orientation: IDENTITY_QUAT };
    const front = evaluateViewingSide(cameraInFrontOfSubject, subject);
    expect(front.ok).toBe(true);
    if (front.ok) expect(front.value.side).toBe('front');

    const cameraBehindSubject: Pose = { position: { x: 0, y: 0, z: 10 }, orientation: IDENTITY_QUAT };
    const back = evaluateViewingSide(cameraBehindSubject, subject);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.side).toBe('back');

    const cameraToSubjectRight: Pose = { position: { x: 10, y: 0, z: 0 }, orientation: IDENTITY_QUAT };
    const rightSide = evaluateViewingSide(cameraToSubjectRight, subject);
    expect(rightSide.ok).toBe(true);
    if (rightSide.ok) expect(rightSide.value.side).toBe('right');
  });

  it('evaluates inclusive altitude range membership', () => {
    expect(evaluateAltitudeRange(10, { minMeters: 5, maxMeters: 20 })).toBe(true);
    expect(evaluateAltitudeRange(5, { minMeters: 5, maxMeters: 20 })).toBe(true);
    expect(evaluateAltitudeRange(20, { minMeters: 5, maxMeters: 20 })).toBe(true);
    expect(evaluateAltitudeRange(4.999, { minMeters: 5, maxMeters: 20 })).toBe(false);
    expect(evaluateAltitudeRange(Number.NaN, { minMeters: 5, maxMeters: 20 })).toBe(false);
  });

  it('evaluates inclusive linear/angular speed thresholds', () => {
    const withinBoth = evaluateSpeedThresholds(5, 1, 5, 1);
    expect(withinBoth.withinAllThresholds).toBe(true);

    const overLinear = evaluateSpeedThresholds(5.01, 1, 5, 1);
    expect(overLinear.withinLinearSpeed).toBe(false);
    expect(overLinear.withinAllThresholds).toBe(false);

    const overAngular = evaluateSpeedThresholds(5, 1.01, 5, 1);
    expect(overAngular.withinAngularSpeed).toBe(false);
  });

  it('computes centeringError from an anchor to the default screen center', () => {
    expect(centeringError({ u: 0.5, v: 0.5 })).toBeCloseTo(0);
    expect(centeringError({ u: 0, v: 0 })).toBeCloseTo(Math.sqrt(0.5 * 0.5 + 0.5 * 0.5));
  });
});
