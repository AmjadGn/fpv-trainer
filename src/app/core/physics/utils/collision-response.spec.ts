import { describe, expect, it } from 'vitest';

import { DEFAULT_IMPACT_THRESHOLDS } from '../models/collision.models';
import {
  classifyImpact,
  resolveCollisionResponse,
  type RawCollisionHit,
} from './collision-response';

const IDENTITY: { x: number; y: number; z: number; w: number } = {
  x: 0,
  y: 0,
  z: 0,
  w: 1,
};

function groundHit(
  partial: Partial<RawCollisionHit> = {},
): RawCollisionHit {
  return {
    objectId: 'terrain-ground',
    material: 'grass',
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    penetration: 0.05,
    relativeVelocity: { x: 0, y: -2, z: 0 },
    isGroundLike: true,
    timestampMs: 1000,
    ...partial,
  };
}

describe('collision response', () => {
  describe('classifyImpact', () => {
    it('classifies scrape vs crash thresholds', () => {
      const t = DEFAULT_IMPACT_THRESHOLDS;
      expect(classifyImpact(t.scrapeThreshold - 0.1, t)).toBe('none');
      expect(classifyImpact(t.scrapeThreshold + 0.05, t)).toBe('scrape');
      expect(classifyImpact(t.moderateImpactThreshold, t)).toBe('moderate');
      expect(classifyImpact(t.crashImpactThreshold, t)).toBe('severe');
      expect(classifyImpact(t.catastrophicImpactThreshold, t)).toBe(
        'catastrophic',
      );
    });
  });

  describe('resolveCollisionResponse', () => {
    it('allows safe landing on ground-like surfaces', () => {
      const result = resolveCollisionResponse({
        position: { x: 0, y: 0.1, z: 0 },
        velocity: { x: 0.5, y: -1.5, z: 0.3 },
        orientation: IDENTITY,
        angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
        hits: [groundHit({ relativeVelocity: { x: 0, y: -1.5, z: 0 } })],
        armed: true,
      });

      expect(result.crash).toBe(false);
      expect(result.outcome).toBe('safeLanding');
      expect(result.velocity.y).toBe(0);
    });

    it('does not zero downward velocity from mid-air false ground contacts', () => {
      const result = resolveCollisionResponse({
        position: { x: 0, y: 5, z: 0 },
        velocity: { x: 0, y: -2, z: 0 },
        orientation: IDENTITY,
        angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
        hits: [
          groundHit({
            penetration: 0,
            relativeVelocity: { x: 0, y: -2, z: 0 },
          }),
        ],
        armed: true,
      });

      expect(result.outcome).toBe('none');
      expect(result.velocity.y).toBe(-2);
    });

    it('crashes on water contact', () => {
      const result = resolveCollisionResponse({
        position: { x: 10, y: 0.2, z: -40 },
        velocity: { x: 2, y: -1, z: 3 },
        orientation: IDENTITY,
        angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
        hits: [
          {
            objectId: 'ocean-water-sensor',
            material: 'water',
            point: { x: 10, y: 0, z: -40 },
            normal: { x: 0, y: 1, z: 0 },
            penetration: 0,
            relativeVelocity: { x: 0, y: -1, z: 0 },
            isWater: true,
            timestampMs: 2000,
          },
        ],
        armed: true,
      });

      expect(result.crash).toBe(true);
      expect(result.outcome).toBe('waterCrash');
      expect(result.crashReason).toBe('water');
    });

    it('returns finite transforms after severe impact', () => {
      const result = resolveCollisionResponse({
        position: { x: 0, y: 2, z: 0 },
        velocity: { x: 12, y: -8, z: 4 },
        orientation: IDENTITY,
        angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
        hits: [
          groundHit({
            relativeVelocity: { x: 0, y: -12, z: 0 },
            penetration: 0.2,
          }),
        ],
        armed: true,
      });

      expect(result.crash).toBe(true);
      expect(
        [
          result.position.x,
          result.position.y,
          result.position.z,
          result.velocity.x,
          result.velocity.y,
          result.velocity.z,
        ].every(Number.isFinite),
      ).toBe(true);
    });

    it('sanitizes NaN-producing inputs to finite state', () => {
      const result = resolveCollisionResponse({
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: Number.NaN, y: 0, z: 0 },
        orientation: IDENTITY,
        angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
        hits: [
          groundHit({
            relativeVelocity: { x: 0, y: -10, z: 0 },
            penetration: 0.1,
          }),
        ],
        armed: true,
      });

      expect(result.crash).toBe(true);
      expect(Number.isFinite(result.velocity.x)).toBe(true);
      expect(Number.isFinite(result.velocity.y)).toBe(true);
      expect(Number.isFinite(result.velocity.z)).toBe(true);
    });
  });
});
