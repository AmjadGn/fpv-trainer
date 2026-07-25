import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { STARTER_CIRCUIT } from '../config/default-course';
import type { Course, CourseGate } from '../models/course.model';
import { quatFromYaw } from '../models/course.model';
import { formatRunTime } from '../models/run-state.model';
import { bestTimeKey, CourseRunService } from './course-run.service';

describe('CourseRunService', () => {
  let service: CourseRunService;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    const localStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [CourseRunService],
    });
    service = TestBed.inject(CourseRunService);
    service.resetRun();
  });

  afterEach(() => {
    storage.clear();
  });

  function straightGate(
    index: number,
    z: number,
    extras: Partial<CourseGate> = {},
  ): CourseGate {
    return {
      id: `g${index}`,
      index,
      position: { x: 0, y: 2, z },
      rotation: quatFromYaw(0),
      width: 4,
      height: 3,
      depth: 0.4,
      triggerPadding: 0.2,
      ...extras,
    };
  }

  function tinyCourse(gates: CourseGate[]): Course {
    return {
      id: 'test-course',
      version: 1,
      name: 'Test',
      description: 'unit',
      startPosition: { x: 0, y: 1, z: 5 },
      startOrientation: quatFromYaw(0),
      requireValidOpening: true,
      gates,
    };
  }

  it('starts in idle state', () => {
    expect(service.runState().status).toBe('idle');
    expect(service.runState().currentGateIndex).toBe(0);
    expect(service.runState().completedGateCount).toBe(0);
    expect(service.runState().elapsedSeconds).toBe(0);
    expect(service.course().id).toBe(STARTER_CIRCUIT.id);
  });

  it('countdown progresses then starts timer at GO', () => {
    service.startCountdown();
    expect(service.runState().status).toBe('countdown');
    expect(service.runState().countdownSeconds).toBe(3);

    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1);
    expect(service.runState().countdownSeconds).toBeCloseTo(2, 5);
    expect(service.runState().status).toBe('countdown');
    expect(service.runState().elapsedSeconds).toBe(0);

    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1);
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1);
    expect(service.runState().status).toBe('running');
    expect(service.runState().elapsedSeconds).toBe(0);
    expect(service.runState().goFlashSeconds).toBeGreaterThan(0);

    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 0.25);
    expect(service.runState().elapsedSeconds).toBeCloseTo(0.25, 5);
  });

  it('accepts a valid forward gate crossing', () => {
    service.setCourse(tinyCourse([straightGate(0, -10)]));
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);

    service.update(
      { x: 0, y: 2, z: -9.5 },
      { x: 0, y: 2, z: -10.5 },
      1 / 120,
    );

    expect(service.runState().completedGateCount).toBe(1);
    expect(service.runState().status).toBe('finished');
  });

  it('rejects reverse crossing', () => {
    service.setCourse(
      tinyCourse([straightGate(0, -10), straightGate(1, -20)]),
    );
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);

    // Cross from front side toward back (local +Z direction = reverse).
    service.update(
      { x: 0, y: 2, z: -10.5 },
      { x: 0, y: 2, z: -9.5 },
      1 / 120,
    );

    expect(service.runState().wrongDirection).toBe(true);
    expect(service.runState().completedGateCount).toBe(0);
    expect(service.runState().currentGateIndex).toBe(0);
  });

  it('rejects crossing the plane outside the opening', () => {
    service.setCourse(
      tinyCourse([straightGate(0, -10), straightGate(1, -20)]),
    );
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);

    service.update(
      { x: 5, y: 2, z: -9.5 },
      { x: 5, y: 2, z: -10.5 },
      1 / 120,
    );

    expect(service.runState().missedGate).toBe(true);
    expect(service.runState().completedGateCount).toBe(0);
    expect(service.runState().currentGateIndex).toBe(0);
  });

  it('requires gates to be sequential', () => {
    service.setCourse(
      tinyCourse([straightGate(0, -10), straightGate(1, -20)]),
    );
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);

    // Skip gate 0, cross gate 1 — should not count.
    service.update(
      { x: 0, y: 2, z: -19.5 },
      { x: 0, y: 2, z: -20.5 },
      1 / 120,
    );

    expect(service.runState().completedGateCount).toBe(0);
    expect(service.runState().currentGateIndex).toBe(0);
  });

  it('detects high-speed movement segment crossing', () => {
    service.setCourse(
      tinyCourse([straightGate(0, -10), straightGate(1, -20)]),
    );
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);

    // Jump entirely through the gate in one step.
    service.update(
      { x: 0, y: 2, z: -5 },
      { x: 0, y: 2, z: -15 },
      1 / 120,
    );

    expect(service.runState().completedGateCount).toBe(1);
    expect(service.runState().currentGateIndex).toBe(1);
  });

  it('does not double-count a duplicate pass while latched', () => {
    service.setCourse(
      tinyCourse([straightGate(0, -10), straightGate(1, -20)]),
    );
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);

    service.update(
      { x: 0, y: 2, z: -9.5 },
      { x: 0, y: 2, z: -10.5 },
      1 / 120,
    );
    expect(service.runState().completedGateCount).toBe(1);

    // Still near gate 0 volume; another segment must not re-complete it.
    service.update(
      { x: 0, y: 2, z: -10.2 },
      { x: 0, y: 2, z: -10.8 },
      1 / 120,
    );
    expect(service.runState().completedGateCount).toBe(1);
    expect(service.runState().currentGateIndex).toBe(1);
  });

  it('finishes the run on the final gate', () => {
    service.setCourse(
      tinyCourse([straightGate(0, -10), straightGate(1, -20)]),
    );
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);

    service.update(
      { x: 0, y: 2, z: -9.5 },
      { x: 0, y: 2, z: -10.5 },
      0.5,
    );
    expect(service.runState().status).toBe('running');

    // Leave first gate trigger, then cross second.
    service.update(
      { x: 0, y: 2, z: -14 },
      { x: 0, y: 2, z: -14.1 },
      0.1,
    );
    service.update(
      { x: 0, y: 2, z: -19.5 },
      { x: 0, y: 2, z: -20.5 },
      0.1,
    );

    expect(service.runState().status).toBe('finished');
    expect(service.runState().completedGateCount).toBe(2);
    expect(service.runState().finishedAt).not.toBeNull();
  });

  it('invalidates the run on crash', () => {
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);
    expect(service.runState().status).toBe('running');

    service.invalidateRun('Crash');
    expect(service.runState().status).toBe('invalid');
    expect(service.runState().invalidReason).toBe('Crash');
  });

  it('reset clears the current run', () => {
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1.5);
    service.resetRun();

    expect(service.runState().status).toBe('idle');
    expect(service.runState().elapsedSeconds).toBe(0);
    expect(service.runState().completedGateCount).toBe(0);
  });

  it('persists best time and ignores slower runs', () => {
    service.setCourse(tinyCourse([straightGate(0, -10)]));
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 2);
    service.update(
      { x: 0, y: 2, z: -9.5 },
      { x: 0, y: 2, z: -10.5 },
      0.1,
    );

    const best = service.runState().bestTimeSeconds;
    expect(best).not.toBeNull();
    expect(best!).toBeGreaterThan(2);
    expect(storage.get(bestTimeKey('test-course'))).toBeTruthy();

    // Slower second run.
    service.resetRun();
    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 5);
    service.update(
      { x: 0, y: 2, z: -9.5 },
      { x: 0, y: 2, z: -10.5 },
      0.1,
    );

    expect(service.runState().bestTimeSeconds).toBe(best);
  });

  it('ignores corrupted saved best time', () => {
    storage.set(bestTimeKey(STARTER_CIRCUIT.id), '{not-json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [CourseRunService],
    });
    const fresh = TestBed.inject(CourseRunService);
    expect(fresh.runState().bestTimeSeconds).toBeNull();

    storage.set(bestTimeKey(STARTER_CIRCUIT.id), '{"seconds":"nope"}');
    fresh.setCourse(STARTER_CIRCUIT);
    expect(fresh.runState().bestTimeSeconds).toBeNull();
  });

  it('reports progress percentage', () => {
    service.setCourse(
      tinyCourse([straightGate(0, -10), straightGate(1, -20)]),
    );
    expect(service.progressPercent()).toBe(0);

    service.startCountdown();
    service.update({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 3.1);
    service.update(
      { x: 0, y: 2, z: -9.5 },
      { x: 0, y: 2, z: -10.5 },
      0.1,
    );

    expect(service.progressPercent()).toBe(50);
  });

  it('formats timer output', () => {
    expect(formatRunTime(null)).toBe('--:--.--');
    expect(formatRunTime(0)).toBe('0:00.00');
    expect(formatRunTime(65.432)).toBe('1:05.43');
    expect(service.formattedElapsedTime()).toBe('0:00.00');
    expect(service.formattedBestTime()).toBe('--:--.--');
  });
});
