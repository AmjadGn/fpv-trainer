import { describe, expect, it } from 'vitest';

import { bodyAngularSpeedMagnitude } from '../mission/services/photo-stability-window';
import { toBodyAngularVelocityVec3 } from '../mission/services/photo-evidence-builder.service';

/**
 * Checkpoint 5 — body angular velocity convention.
 *
 * Flight runtime stores named body-frame rates `{ pitch, yaw, roll }`.
 * Evidence serialization uses the repository storage convention shared with
 * `angularToReplay`: x=pitch, y=yaw, z=roll. This is NOT aerospace
 * [roll, pitch, yaw] ordering. Stability magnitude uses the named rates
 * directly via `Math.hypot`.
 */

describe('Checkpoint 5 — body angular velocity convention', () => {
  it('maps pure pitch onto evidence Vec3.x only', () => {
    expect(toBodyAngularVelocityVec3({ pitch: 1.5, yaw: 0, roll: 0 })).toEqual({
      x: 1.5,
      y: 0,
      z: 0,
    });
  });

  it('maps pure yaw onto evidence Vec3.y only', () => {
    expect(toBodyAngularVelocityVec3({ pitch: 0, yaw: -0.8, roll: 0 })).toEqual({
      x: 0,
      y: -0.8,
      z: 0,
    });
  });

  it('maps pure roll onto evidence Vec3.z only (not x)', () => {
    const vec = toBodyAngularVelocityVec3({ pitch: 0, yaw: 0, roll: 2.2 });
    expect(vec).toEqual({ x: 0, y: 0, z: 2.2 });
    // Explicit non-aerospace guard: roll must not land on x.
    expect(vec.x).not.toBe(2.2);
  });

  it('maps combined rates without reordering', () => {
    expect(toBodyAngularVelocityVec3({ pitch: 0.1, yaw: 0.2, roll: 0.3 })).toEqual({
      x: 0.1,
      y: 0.2,
      z: 0.3,
    });
  });

  it('computes magnitude from named rates for pure and combined inputs', () => {
    expect(bodyAngularSpeedMagnitude({ pitch: 3, yaw: 4, roll: 0 })).toBe(5);
    expect(bodyAngularSpeedMagnitude({ pitch: 0, yaw: 0, roll: 2 })).toBe(2);
    expect(bodyAngularSpeedMagnitude({ pitch: 1, yaw: 2, roll: 2 })).toBe(3);
    expect(bodyAngularSpeedMagnitude({ pitch: 0, yaw: 0, roll: 0 })).toBe(0);
  });
});
