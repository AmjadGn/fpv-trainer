import { validatePhysicsState } from './physics-state.guard';

describe('validatePhysicsState', () => {
  it('accepts a normal pose', () => {
    const result = validatePhysicsState({
      position: { x: 0, y: 1, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      thrust: 0.4,
      deltaTime: 1 / 120,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects NaN position', () => {
    const result = validatePhysicsState({
      position: { x: Number.NaN, y: 1, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid-position');
  });

  it('rejects invalid delta time', () => {
    const result = validatePhysicsState({
      position: { x: 0, y: 1, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      deltaTime: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid-delta-time');
  });
});
