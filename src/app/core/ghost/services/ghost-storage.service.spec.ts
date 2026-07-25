import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  REPLAY_FORMAT_VERSION,
  type FlightReplay,
  type ReplayFrame,
} from '../../replay/models/replay.model';
import {
  GHOST_RECORD_VERSION,
  ghostStorageKey,
} from '../models/ghost.models';
import { GhostStorageService } from './ghost-storage.service';

function makeFrame(
  timestampMs: number,
  overrides: Partial<ReplayFrame> = {},
): ReplayFrame {
  return {
    timestampMs,
    position: { x: timestampMs / 100, y: 1, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocity: { x: 1, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    throttle: 0.5,
    armed: true,
    crashed: false,
    currentGateIndex: 0,
    ...overrides,
  };
}

function makeReplay(
  courseId: string,
  finalTimeMs: number,
  overrides: {
    completed?: boolean;
    frames?: ReplayFrame[];
    metadata?: Partial<FlightReplay['metadata']>;
  } = {},
): FlightReplay {
  const frames =
    overrides.frames ??
    [
      makeFrame(0),
      makeFrame(finalTimeMs, { currentGateIndex: 1 }),
    ];
  return {
    metadata: {
      replayVersion: REPLAY_FORMAT_VERSION,
      courseId,
      environmentId: 'alpine-training-valley',
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs: finalTimeMs,
      completed: overrides.completed ?? true,
      finalTimeMs,
      bestTimeAtCompletion: finalTimeMs,
      rateProfileId: 'normal',
      frameIntervalMs: 33.333,
      ...overrides.metadata,
    },
    frames,
  };
}

describe('GhostStorageService', () => {
  let service: GhostStorageService;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        get length() {
          return storage.size;
        },
        key: (index: number) => [...storage.keys()][index] ?? null,
      },
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [GhostStorageService],
    });
    service = TestBed.inject(GhostStorageService);
  });

  afterEach(() => {
    storage.clear();
  });

  it('saves the first valid completed replay as ghost', () => {
    const result = service.saveGhostIfBest('course-a', makeReplay('course-a', 5000), {
      courseVersion: 1,
    });
    expect(result.saved).toBe(true);
    if (result.saved) {
      expect(result.reason).toBe('first');
      expect(result.record.finalTimeMs).toBe(5000);
      expect(result.record.version).toBe(GHOST_RECORD_VERSION);
    }
    expect(service.hasGhost('course-a')).toBe(true);
    expect(storage.get(ghostStorageKey('course-a'))).toBeTruthy();
  });

  it('replaces ghost when a faster replay arrives', () => {
    service.saveGhostIfBest('course-a', makeReplay('course-a', 5000), {
      courseVersion: 1,
    });
    const result = service.saveGhostIfBest('course-a', makeReplay('course-a', 4000), {
      courseVersion: 1,
    });
    expect(result.saved).toBe(true);
    if (result.saved) {
      expect(result.reason).toBe('improved');
      expect(result.record.finalTimeMs).toBe(4000);
    }
    expect(service.getGhost('course-a')!.finalTimeMs).toBe(4000);
  });

  it('does not replace ghost with a slower replay', () => {
    service.saveGhostIfBest('course-a', makeReplay('course-a', 4000), {
      courseVersion: 1,
    });
    const result = service.saveGhostIfBest('course-a', makeReplay('course-a', 5000), {
      courseVersion: 1,
    });
    expect(result.saved).toBe(false);
    if (!result.saved) {
      expect(result.reason).toBe('slower');
    }
    expect(service.getGhost('course-a')!.finalTimeMs).toBe(4000);
  });

  it('rejects incomplete replays', () => {
    const result = service.saveGhostIfBest(
      'course-a',
      makeReplay('course-a', 5000, { completed: false }),
      { courseVersion: 1 },
    );
    expect(result.saved).toBe(false);
    if (!result.saved) {
      expect(result.reason).toBe('incomplete');
    }
    expect(service.hasGhost('course-a')).toBe(false);
  });

  it('discards corrupted records on load', () => {
    storage.set(ghostStorageKey('course-a'), '{not-json');
    expect(service.getGhost('course-a')).toBeNull();
    expect(service.storageStatus()).toBe('corrupt');
    expect(storage.has(ghostStorageKey('course-a'))).toBe(false);
  });

  it('rejects course id mismatch', () => {
    const result = service.saveGhostIfBest(
      'course-a',
      makeReplay('course-b', 5000),
      { courseVersion: 1 },
    );
    expect(result.saved).toBe(false);
    if (!result.saved) {
      expect(result.reason).toBe('course_mismatch');
    }
  });

  it('handles quota failure while keeping ghost in memory', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
        get length() {
          return storage.size;
        },
        key: () => null,
      },
      configurable: true,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [GhostStorageService],
    });
    const fresh = TestBed.inject(GhostStorageService);

    const result = fresh.saveGhostIfBest('course-a', makeReplay('course-a', 5000), {
      courseVersion: 1,
    });
    expect(result.saved).toBe(true);
    expect(fresh.hasGhost('course-a')).toBe(true);
    expect(fresh.getGhost('course-a')!.finalTimeMs).toBe(5000);
    expect(fresh.storageStatus()).toBe('quota_exceeded');
    expect(fresh.warning()).toBeTruthy();
  });

  it('deleteGhost removes memory and storage', () => {
    service.saveGhostIfBest('course-a', makeReplay('course-a', 5000), {
      courseVersion: 1,
    });
    service.deleteGhost('course-a');
    expect(service.hasGhost('course-a')).toBe(false);
    expect(storage.has(ghostStorageKey('course-a'))).toBe(false);
  });

  it('keeps separate ghosts per course', () => {
    service.saveGhostIfBest('course-a', makeReplay('course-a', 5000), {
      courseVersion: 1,
    });
    service.saveGhostIfBest('course-b', makeReplay('course-b', 3000), {
      courseVersion: 1,
    });
    expect(service.getGhost('course-a')!.finalTimeMs).toBe(5000);
    expect(service.getGhost('course-b')!.finalTimeMs).toBe(3000);
    expect(storage.has(ghostStorageKey('course-a'))).toBe(true);
    expect(storage.has(ghostStorageKey('course-b'))).toBe(true);
  });
});
