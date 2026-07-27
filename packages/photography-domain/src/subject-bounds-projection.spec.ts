import { describe, expect, it } from 'vitest';
import { IDENTITY_QUAT, PROJECTION_MODEL_VERSION, type CameraSnapshot, type Pose } from '@fpv/simulation-contracts';
import {
  computeNormalizedScreenRectangle,
  projectSubjectSamplePoints,
} from './projection';
import {
  getSubjectBoundsProjectionPoints,
  projectSubjectBounds,
  type SubjectBoundsShape,
} from './subject-bounds-projection';

const ORIGIN: Pose = { position: { x: 0, y: 0, z: 0 }, orientation: IDENTITY_QUAT };

function makeCamera(overrides: Partial<CameraSnapshot> = {}): CameraSnapshot {
  return {
    worldPose: ORIGIN,
    projection: {
      verticalFovDegrees: 90,
      aspectRatio: 16 / 9,
      nearMeters: 0.1,
      farMeters: 1000,
      projectionModelVersion: PROJECTION_MODEL_VERSION,
    },
    ...overrides,
  };
}

describe('getSubjectBoundsProjectionPoints', () => {
  it('projects all eight AABB corners', () => {
    const bounds: SubjectBoundsShape = {
      kind: 'aabb',
      aabb: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } },
    };
    const result = getSubjectBoundsProjectionPoints(bounds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(8);
    expect(result.value).toEqual(
      expect.arrayContaining([
        { x: -1, y: 0, z: -1 },
        { x: 1, y: 2, z: 1 },
      ]),
    );
  });

  it('constructs eight oriented OBB corners', () => {
    const bounds: SubjectBoundsShape = {
      kind: 'obb',
      obb: {
        center: { x: 10, y: 5, z: -20 },
        halfExtents: { x: 2, y: 1, z: 3 },
        orientation: IDENTITY_QUAT,
      },
    };
    const result = getSubjectBoundsProjectionPoints(bounds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(8);
    expect(result.value).toEqual(
      expect.arrayContaining([
        { x: 8, y: 4, z: -23 },
        { x: 12, y: 6, z: -17 },
      ]),
    );
  });

  it('uses the enclosing AABB corners for a sphere (deterministic, no random samples)', () => {
    const bounds: SubjectBoundsShape = {
      kind: 'sphere',
      sphere: { center: { x: 0, y: 0, z: -10 }, radiusMeters: 2 },
    };
    const a = getSubjectBoundsProjectionPoints(bounds);
    const b = getSubjectBoundsProjectionPoints(bounds);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value).toHaveLength(8);
    expect(JSON.stringify(a.value)).toBe(JSON.stringify(b.value));
    expect(a.value).toEqual(
      expect.arrayContaining([
        { x: -2, y: -2, z: -12 },
        { x: 2, y: 2, z: -8 },
      ]),
    );
  });

  it('projects lower and upper polygon-prism vertices in authored order', () => {
    const bounds: SubjectBoundsShape = {
      kind: 'polygon-prism',
      polygonPrism: {
        vertices: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 3 },
        ],
        minY: 1,
        maxY: 5,
      },
    };
    const result = getSubjectBoundsProjectionPoints(bounds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 5, z: 0 },
      { x: 4, y: 1, z: 0 },
      { x: 4, y: 5, z: 0 },
      { x: 4, y: 1, z: 3 },
      { x: 4, y: 5, z: 3 },
    ]);
  });

  it('rejects non-finite AABB geometry', () => {
    const result = getSubjectBoundsProjectionPoints({
      kind: 'aabb',
      aabb: { min: { x: Number.NaN, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    });
    expect(result.ok).toBe(false);
  });
});

describe('projectSubjectBounds near-plane policy', () => {
  const boxAhead: SubjectBoundsShape = {
    kind: 'aabb',
    aabb: { min: { x: -1, y: -1, z: -12 }, max: { x: 1, y: 1, z: -8 } },
  };

  it('returns a finite screen rectangle for a fully in-front AABB', () => {
    const result = projectSubjectBounds(boxAhead, makeCamera());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.screenRectangle).not.toBeNull();
    expect(result.value.anyInFrontOfCamera).toBe(true);
    expect(result.value.cameraInsideBounds).toBe(false);
  });

  it('returns null screenRectangle when all bounds points are behind the camera', () => {
    const behind: SubjectBoundsShape = {
      kind: 'aabb',
      aabb: { min: { x: -1, y: -1, z: 8 }, max: { x: 1, y: 1, z: 12 } },
    };
    const result = projectSubjectBounds(behind, makeCamera());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.screenRectangle).toBeNull();
    expect(result.value.anyInFrontOfCamera).toBe(false);
  });

  it('uses only clip-range points when some corners cross the near plane', () => {
    // All corners in front of the camera; some closer than nearMeters=1.
    const straddling: SubjectBoundsShape = {
      kind: 'aabb',
      aabb: { min: { x: -1, y: -1, z: -5 }, max: { x: 1, y: 1, z: -0.2 } },
    };
    const camera = makeCamera({
      projection: {
        verticalFovDegrees: 90,
        aspectRatio: 16 / 9,
        nearMeters: 1,
        farMeters: 1000,
        projectionModelVersion: PROJECTION_MODEL_VERSION,
      },
    });
    const result = projectSubjectBounds(straddling, camera);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Far corners (z=-5) are within clip; near corners (z=-0.2) are not.
    expect(result.value.projectedPoints.some((p) => p.withinClipRange)).toBe(true);
    expect(result.value.projectedPoints.some((p) => p.inFrontOfCamera && !p.withinClipRange)).toBe(
      true,
    );
    if (result.value.screenRectangle) {
      expect(Number.isFinite(result.value.screenRectangle.minU)).toBe(true);
      expect(Number.isFinite(result.value.screenRectangle.maxU)).toBe(true);
      expect(Math.abs(result.value.screenRectangle.maxU - result.value.screenRectangle.minU)).toBeLessThan(10);
    }
  });

  it('fails when the camera is inside the subject bounds', () => {
    const surrounding: SubjectBoundsShape = {
      kind: 'aabb',
      aabb: { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } },
    };
    const result = projectSubjectBounds(surrounding, makeCamera());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/inside subject bounds/i);
  });

  it('is independent of visibility sample distribution', () => {
    const bounds: SubjectBoundsShape = {
      kind: 'aabb',
      aabb: { min: { x: -4, y: 0, z: -14 }, max: { x: 4, y: 8, z: -6 } },
    };
    const samplesNearOpening = [
      { x: 0, y: 4, z: -10 },
      { x: -0.5, y: 4.2, z: -10 },
      { x: 0.5, y: 4.2, z: -10 },
      { x: 0, y: 5, z: -10 },
    ];
    const camera = makeCamera();
    const boundsProj = projectSubjectBounds(bounds, camera);
    const sampleProj = projectSubjectSamplePoints(samplesNearOpening, camera);
    expect(boundsProj.ok).toBe(true);
    expect(sampleProj.ok).toBe(true);
    if (!boundsProj.ok || !sampleProj.ok) return;
    const sampleRect = computeNormalizedScreenRectangle(sampleProj.value);
    expect(sampleRect.ok).toBe(true);
    if (!sampleRect.ok) return;
    expect(boundsProj.value.screenRectangle).not.toEqual(sampleRect.value);
  });
});
