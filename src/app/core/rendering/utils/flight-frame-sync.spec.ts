import {
  bodyForwardWorld,
  bodyRightWorld,
  quatFromAxisAngle,
} from '../../flight/utils/quat-math';
import {
  buildRenderFrameSync,
  chaseOffsetWorld,
  fpvLookDirection,
  quaternionsMatch,
  vecDot,
} from './flight-frame-sync';

describe('flight-frame-sync Layer 4', () => {
  it('requires model quaternion to match authoritative physics quaternion', () => {
    const q = quatFromAxisAngle(0, 1, 0, -Math.PI / 2);
    const sample = buildRenderFrameSync({
      physicsQuaternion: q,
      modelQuaternion: { ...q },
      modelPosition: { x: 0, y: 2, z: 0 },
      cameraForward: fpvLookDirection(q, 0),
      cameraPosition: { x: 0, y: 2.12, z: 0 },
    });
    expect(quaternionsMatch(sample.physicsQuaternion, sample.modelQuaternion)).toBe(
      true,
    );
    expect(vecDot(sample.physicsForward, sample.modelForward)).toBeCloseTo(1, 9);
  });

  it('detects model quaternion drift from physics', () => {
    const physics = quatFromAxisAngle(0, 1, 0, -Math.PI / 2);
    const model = quatFromAxisAngle(0, 1, 0, 0);
    expect(quaternionsMatch(physics, model)).toBe(false);
  });

  it('FPV look follows body forward after yaw 90° right', () => {
    const q = quatFromAxisAngle(0, 1, 0, -Math.PI / 2);
    const look = fpvLookDirection(q, 0);
    const forward = bodyForwardWorld(q);
    // Analytic: nose at +X after right yaw.
    expect(forward.x).toBeCloseTo(1, 9);
    expect(vecDot(look, forward)).toBeGreaterThan(0.999);
    // Must not remain on spawn −Z.
    expect(Math.abs(look.z)).toBeLessThan(0.05);
  });

  it('FPV tilt pitches look about body-right (not world X after yaw)', () => {
    const q = quatFromAxisAngle(0, 1, 0, -Math.PI / 2);
    const look = fpvLookDirection(q, 0.2);
    const right = bodyRightWorld(q);
    // After right yaw, body right ≈ +Z; look should gain −Y (tilt up along body).
    expect(look.y).toBeGreaterThan(0.15);
    // Horizontal component stays near +X (nose), not spawn −Z.
    expect(look.x).toBeGreaterThan(0.9);
    expect(Math.abs(right.z)).toBeGreaterThan(0.9);
  });

  it('chase offset rotates with aircraft frame after yaw', () => {
    const local = { x: 0, y: 2.2, z: 5.5 };
    const identity = chaseOffsetWorld({ x: 0, y: 0, z: 0, w: 1 }, local);
    expect(identity.z).toBeCloseTo(5.5, 9);

    const yawed = quatFromAxisAngle(0, 1, 0, -Math.PI / 2);
    const world = chaseOffsetWorld(yawed, local);
    // R_y(−π/2): (x,y,z)→(−z,y,x) ⇒ (0,2.2,5.5) → (−5.5, 2.2, 0)
    expect(world.x).toBeCloseTo(-5.5, 9);
    expect(world.y).toBeCloseTo(2.2, 9);
    expect(world.z).toBeCloseTo(0, 9);
  });

  it('render model position follows authoritative physics position (no alternate path)', () => {
    const physicsPos = { x: 1.25, y: 4.5, z: -3.1 };
    const q = quatFromAxisAngle(0, 1, 0, Math.PI);
    const sample = buildRenderFrameSync({
      physicsQuaternion: q,
      modelQuaternion: { ...q },
      modelPosition: { ...physicsPos },
      cameraForward: fpvLookDirection(q, 0),
      cameraPosition: {
        x: physicsPos.x,
        y: physicsPos.y + 0.12,
        z: physicsPos.z,
      },
    });
    expect(sample.modelPosition).toEqual(physicsPos);
    expect(sample.cameraPosition.x).toBeCloseTo(physicsPos.x, 9);
    expect(sample.cameraPosition.z).toBeCloseTo(physicsPos.z, 9);
  });
});
