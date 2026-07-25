import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  REPLAY_FORMAT_VERSION,
  type FlightReplay,
  type ReplayFrame,
} from '../../replay/models/replay.model';
import { TrainerSettingsService } from '../../settings/services/trainer-settings.service';
import { GhostRaceService } from './ghost-race.service';
import { GhostStorageService } from './ghost-storage.service';

function makeFrame(
  timestampMs: number,
  x: number,
  gateIndex: number,
): ReplayFrame {
  return {
    timestampMs,
    position: { x, y: 1, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocity: { x: 1, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    throttle: 0.5,
    armed: true,
    crashed: false,
    currentGateIndex: gateIndex,
  };
}

function makeReplay(courseId: string, durationMs = 2000): FlightReplay {
  return {
    metadata: {
      replayVersion: REPLAY_FORMAT_VERSION,
      courseId,
      environmentId: 'alpine-training-valley',
      startedAt: '2026-01-01T00:00:00.000Z',
      durationMs,
      completed: true,
      finalTimeMs: durationMs,
      bestTimeAtCompletion: durationMs,
      rateProfileId: 'normal',
      frameIntervalMs: 33.333,
    },
    frames: [
      makeFrame(0, 0, 0),
      makeFrame(1000, 10, 1),
      makeFrame(durationMs, 20, 2),
    ],
  };
}

describe('GhostRaceService', () => {
  let race: GhostRaceService;
  let storage: GhostStorageService;
  let map: Map<string, string>;

  beforeEach(() => {
    map = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => map.set(key, value),
        removeItem: (key: string) => map.delete(key),
        clear: () => map.clear(),
        get length() {
          return map.size;
        },
        key: (index: number) => [...map.keys()][index] ?? null,
      },
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        GhostRaceService,
        GhostStorageService,
        TrainerSettingsService,
      ],
    });
    race = TestBed.inject(GhostRaceService);
    storage = TestBed.inject(GhostStorageService);
  });

  afterEach(() => {
    map.clear();
  });

  function seedGhost(
    courseId = 'course-a',
    courseVersion = 1,
    durationMs = 2000,
  ): void {
    storage.saveGhostIfBest(courseId, makeReplay(courseId, durationMs), {
      courseVersion,
    });
  }

  function loadGhost(
    courseId = 'course-a',
    courseVersion = 1,
    gateCount = 2,
    environmentId = 'alpine-training-valley',
  ): void {
    race.loadForCourse(courseId, gateCount, {
      courseVersion,
      environmentId,
    });
  }

  it('loadForCourse is unavailable when no ghost exists', () => {
    loadGhost('missing');
    expect(race.state()).toBe('unavailable');
    expect(race.message()).toBe('NO GHOST YET');
  });

  it('onCountdownStart keeps waiting with start sample', () => {
    seedGhost();
    loadGhost();
    race.onCountdownStart();
    expect(race.state()).toBe('waiting');
    expect(race.sample()?.position.x).toBe(0);
  });

  it('onRunStart enters racing', () => {
    seedGhost();
    loadGhost();
    race.onCountdownStart();
    race.onRunStart();
    expect(race.state()).toBe('racing');
  });

  it('syncToElapsedMs advances sample with elapsed time', () => {
    seedGhost();
    loadGhost();
    race.onRunStart();
    race.syncToElapsedMs(500, {
      playerGateIndex: 0,
      playerCompletedGates: 0,
      paused: false,
    });
    expect(race.sample()?.position.x).toBeCloseTo(5, 5);
  });

  it('does not advance sample while paused during racing', () => {
    seedGhost();
    loadGhost();
    race.onRunStart();
    race.syncToElapsedMs(500, {
      playerGateIndex: 0,
      playerCompletedGates: 0,
      paused: false,
    });
    const pausedAt = race.sample()!.position.x;
    race.syncToElapsedMs(1500, {
      playerGateIndex: 0,
      playerCompletedGates: 0,
      paused: true,
    });
    expect(race.sample()!.position.x).toBe(pausedAt);
  });

  it('onReset returns to ready', () => {
    seedGhost();
    loadGhost();
    race.onRunStart();
    race.syncToElapsedMs(500, {
      playerGateIndex: 0,
      playerCompletedGates: 0,
      paused: false,
    });
    race.onReset();
    expect(race.state()).toBe('ready');
    expect(race.sample()?.position.x).toBe(0);
  });

  it('onPlayerFinished sets ghostBeaten when player is faster', () => {
    seedGhost('course-a', 1, 2000);
    loadGhost();
    race.onRunStart();
    race.onPlayerFinished(1500);
    expect(race.state()).toBe('finished');
    expect(race.hud().ghostBeaten).toBe(true);
    expect(race.hud().finalDeltaSeconds).toBeCloseTo(-0.5, 5);
    expect(race.message()).toBe('Ghost Beaten');
  });

  it('does not depend on CourseRunService (isolation)', () => {
    // Providers intentionally omit CourseRunService — inject would throw if required.
    expect(race).toBeTruthy();
    seedGhost();
    loadGhost();
    expect(race.state()).toBe('ready');
  });

  it('sets error state on course version mismatch', () => {
    seedGhost('course-a', 1);
    loadGhost('course-a', 2);
    expect(race.state()).toBe('error');
    expect(race.unavailableReason()).toBe('course_version_mismatch');
  });

  it('sets error state on environment mismatch', () => {
    seedGhost();
    race.loadForCourse('course-a', 2, {
      courseVersion: 1,
      environmentId: 'desert-industrial-yard',
    });
    expect(race.state()).toBe('error');
    expect(race.unavailableReason()).toBe('environment_mismatch');
    expect(race.message()).toContain('environment');
  });

  it('reports no ghost for mismatched weather category', () => {
    seedGhost();
    race.loadForCourse('course-a', 2, {
      courseVersion: 1,
      environmentId: 'alpine-training-valley',
      weatherCategory: 'challenge',
    });
    expect(race.state()).toBe('unavailable');
    expect(race.message()).toBe('No ghost for this weather');
    expect(race.unavailableReason()).toBe('weather_category_mismatch');
  });
});