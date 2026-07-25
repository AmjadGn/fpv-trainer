import { describe, expect, it } from 'vitest';

import {
  REPLAY_FORMAT_VERSION,
  type FlightReplay,
} from '../models/replay.model';
import { sampleReplayAt } from '../utils/replay-interpolation';
import { validateReplay } from '../utils/replay-validation';

function makeReplay(overrides: Partial<FlightReplay> = {}): FlightReplay {
  const frames = [
    {
      timestampMs: 0,
      position: { x: 0, y: 1, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      throttle: 0,
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
      throttle: 0.8,
      armed: true,
      crashed: false,
      currentGateIndex: 1,
    },
  ];
  return {
    metadata: {
      replayVersion: REPLAY_FORMAT_VERSION,
      courseId: 'starter',
      environmentId: 'alpine-training-valley',
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 1000,
      completed: true,
      finalTimeMs: 1000,
      bestTimeAtCompletion: 1000,
      rateProfileId: 'normal',
      frameIntervalMs: 33.333,
    },
    frames,
    ...overrides,
  };
}

describe('replay validation', () => {
  it('accepts a valid replay', () => {
    const result = validateReplay(makeReplay());
    expect(result.ok).toBe(true);
  });

  it('rejects unsupported version', () => {
    const replay = makeReplay();
    replay.metadata.replayVersion = 99;
    const result = validateReplay(replay);
    expect(result.ok).toBe(false);
  });

  it('accepts legacy v1 replays and fills calm/standard defaults', () => {
    const replay = makeReplay();
    replay.metadata.replayVersion = 1;
    delete replay.metadata.environmentVersion;
    delete replay.metadata.weatherPresetId;
    delete replay.metadata.weatherCategory;
    delete replay.metadata.windSeed;
    delete replay.metadata.windParametersSnapshot;

    const result = validateReplay(replay);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replay.metadata.replayVersion).toBe(1);
      expect(result.replay.metadata.weatherPresetId).toBe('calm');
      expect(result.replay.metadata.weatherCategory).toBe('standard');
      expect(result.replay.metadata.environmentVersion).toBe(1);
      expect(result.replay.metadata.windSeed).toBe(0);
      expect(result.replay.metadata.windParametersSnapshot).toBeUndefined();
    }
  });

  it('defaults missing v2 weather fields to calm/standard', () => {
    const replay = makeReplay();
    replay.metadata.replayVersion = 2;
    delete replay.metadata.weatherPresetId;
    delete replay.metadata.weatherCategory;
    delete replay.metadata.environmentVersion;
    delete replay.metadata.windSeed;

    const result = validateReplay(replay);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replay.metadata.replayVersion).toBe(2);
      expect(result.replay.metadata.weatherPresetId).toBe('calm');
      expect(result.replay.metadata.weatherCategory).toBe('standard');
      expect(result.replay.metadata.environmentVersion).toBe(1);
      expect(result.replay.metadata.windSeed).toBe(0);
    }
  });

  it('rejects empty frames', () => {
    const result = validateReplay(makeReplay({ frames: [] }));
    expect(result.ok).toBe(false);
  });

  it('rejects non-finite numbers', () => {
    const replay = makeReplay();
    replay.frames[0].position.x = Number.NaN;
    expect(validateReplay(replay).ok).toBe(false);
  });

  it('rejects invalid timestamps', () => {
    const replay = makeReplay();
    replay.frames[0].timestampMs = -5;
    expect(validateReplay(replay).ok).toBe(false);
  });

  it('rejects invalid quaternion', () => {
    const replay = makeReplay();
    replay.frames[0].orientation = { x: 0, y: 0, z: 0, w: 0 };
    expect(validateReplay(replay).ok).toBe(false);
  });

  it('rejects zero duration metadata', () => {
    const replay = makeReplay();
    replay.metadata.durationMs = 0;
    expect(validateReplay(replay).ok).toBe(false);
  });
});

describe('replay interpolation', () => {
  it('lerps position between frames', () => {
    const sample = sampleReplayAt(makeReplay().frames, 500);
    expect(sample.position.x).toBeCloseTo(5, 5);
    expect(sample.throttle).toBeCloseTo(0.4, 5);
  });

  it('clamps to end frame', () => {
    const sample = sampleReplayAt(makeReplay().frames, 5000);
    expect(sample.position.x).toBe(10);
  });
});
