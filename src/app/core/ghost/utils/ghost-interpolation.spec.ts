import { describe, expect, it } from 'vitest';

import type { ReplayFrame } from '../../replay/models/replay.model';
import {
  deriveGhostGateSplits,
  sampleGhostAt,
} from './ghost-interpolation';

function framesWithGates(): ReplayFrame[] {
  return [
    {
      timestampMs: 0,
      position: { x: 0, y: 1, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      throttle: 0.2,
      armed: true,
      crashed: false,
      currentGateIndex: 0,
    },
    {
      timestampMs: 1000,
      position: { x: 10, y: 1, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 10, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      throttle: 0.5,
      armed: true,
      crashed: false,
      currentGateIndex: 1,
    },
    {
      timestampMs: 2000,
      position: { x: 20, y: 1, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 10, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      throttle: 0.8,
      armed: true,
      crashed: false,
      currentGateIndex: 2,
    },
  ];
}

describe('ghost interpolation', () => {
  it('derives gate splits from frames', () => {
    const splits = deriveGhostGateSplits(framesWithGates(), 2);
    expect(splits).toEqual([
      { gateIndex: 0, timeMs: 1000 },
      { gateIndex: 1, timeMs: 2000 },
    ]);
  });

  it('lerps position and clamps timeline', () => {
    const frames = framesWithGates();
    const mid = sampleGhostAt(frames, 500);
    expect(mid.position.x).toBeCloseTo(5, 5);
    expect(mid.throttle).toBeCloseTo(0.35, 5);

    const clamped = sampleGhostAt(frames, 99999);
    expect(clamped.position.x).toBe(20);
    expect(clamped.currentGateIndex).toBe(2);

    const before = sampleGhostAt(frames, -100);
    expect(before.position.x).toBe(0);
  });

  it('samples a one-frame replay', () => {
    const frames: ReplayFrame[] = [
      {
        timestampMs: 0,
        position: { x: 3, y: 2, z: 1 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        linearVelocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        throttle: 0.4,
        armed: true,
        crashed: false,
        currentGateIndex: 0,
      },
    ];
    const sample = sampleGhostAt(frames, 500);
    expect(sample.position).toEqual({ x: 3, y: 2, z: 1 });
    expect(deriveGhostGateSplits(frames, 2)).toEqual([]);
  });

  it('handles empty frames', () => {
    expect(deriveGhostGateSplits([], 3)).toEqual([]);
    expect(deriveGhostGateSplits(framesWithGates(), 0)).toEqual([]);
  });
});
