import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REPLAY_FORMAT_VERSION } from '../models/replay.model';
import { ReplayPlaybackService } from './replay-playback.service';
import { ReplayRecorderService } from './replay-recorder.service';

describe('ReplayRecorderService', () => {
  let recorder: ReplayRecorderService;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (value.length > 50_000) {
            throw new Error('quota');
          }
          storage.set(key, value);
        },
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [ReplayRecorderService],
    });
    recorder = TestBed.inject(ReplayRecorderService);
  });

  afterEach(() => {
    storage.clear();
  });

  function sample(gate = 0) {
    return {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: -1 },
      angularVelocity: { pitch: 0, yaw: 0.1, roll: 0 },
      throttle: 0.4,
      armed: true,
      crashed: false,
      currentGateIndex: gate,
    };
  }

  it('starts on run start and records at sampling interval', () => {
    recorder.startRecording({
      courseId: 'c1',
      rateProfileId: 'normal',
    });
    // First sample always stored.
    recorder.pushSample(sample(), 1 / 120);
    // Below interval — should not add.
    recorder.pushSample(sample(), 1 / 120);
    // Advance enough time for another sample.
    for (let i = 0; i < 40; i++) {
      recorder.pushSample(sample(1), 1 / 120);
    }
    const saved = recorder.stopRecording({
      saveCompleted: true,
      finalTimeMs: 2000,
      bestTimeAtCompletion: 2000,
    });
    expect(saved).toBeTruthy();
    expect(saved!.frames.length).toBeGreaterThan(1);
    expect(saved!.metadata.completed).toBe(true);
    expect(saved!.metadata.replayVersion).toBe(REPLAY_FORMAT_VERSION);
    expect(recorder.hasReplay()).toBe(true);
  });

  it('does not save incomplete run as completed replay', () => {
    recorder.startRecording({ courseId: 'c1', rateProfileId: 'normal' });
    recorder.pushSample(sample(), 0.05);
    const result = recorder.stopRecording({ saveCompleted: false });
    expect(result).toBeNull();
    expect(recorder.hasReplay()).toBe(false);
    expect(recorder.getIncompleteForDebug()).toBeTruthy();
  });

  it('cancels on cancelRecording', () => {
    recorder.startRecording({ courseId: 'c1', rateProfileId: 'normal' });
    recorder.pushSample(sample(), 0.05);
    recorder.cancelRecording();
    expect(recorder.hasReplay()).toBe(false);
  });

  it('stores plain serializable data', () => {
    recorder.startRecording({ courseId: 'c1', rateProfileId: 'normal' });
    recorder.pushSample(sample(), 0.05);
    const saved = recorder.stopRecording({
      saveCompleted: true,
      finalTimeMs: 500,
    });
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });
});

describe('ReplayPlaybackService', () => {
  let playback: ReplayPlaybackService;
  let recorder: ReplayRecorderService;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
      },
      configurable: true,
    });
    TestBed.configureTestingModule({
      providers: [ReplayPlaybackService, ReplayRecorderService],
    });
    playback = TestBed.inject(ReplayPlaybackService);
    recorder = TestBed.inject(ReplayRecorderService);
  });

  function buildReplay() {
    recorder.startRecording({ courseId: 'c1', rateProfileId: 'normal' });
    for (let i = 0; i < 90; i++) {
      recorder.pushSample(
        {
          position: { x: i * 0.1, y: 1, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
          velocity: { x: 1, y: 0, z: 0 },
          angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
          throttle: 0.5,
          armed: true,
          crashed: false,
          currentGateIndex: i > 40 ? 1 : 0,
        },
        1 / 30,
      );
    }
    return recorder.stopRecording({
      saveCompleted: true,
      finalTimeMs: 3000,
      bestTimeAtCompletion: 3000,
    })!;
  }

  it('plays, pauses, seeks, and completes', () => {
    const replay = buildReplay();
    expect(playback.load(replay)).toBe(true);
    expect(playback.state()).toBe('paused');
    playback.play();
    expect(playback.state()).toBe('playing');
    playback.pause();
    expect(playback.state()).toBe('paused');
    playback.seek(500);
    expect(playback.currentTimeMs()).toBe(500);
    playback.setSpeed(2);
    playback.play();
    for (let i = 0; i < 200; i++) {
      playback.tick(0.05);
    }
    expect(playback.state()).toBe('finished');
    playback.restart();
    expect(playback.state()).toBe('playing');
    expect(playback.currentTimeMs()).toBe(0);
  });

  it('clamps timeline seek', () => {
    const replay = buildReplay();
    playback.load(replay);
    playback.seek(-100);
    expect(playback.currentTimeMs()).toBe(0);
    playback.seek(999999);
    expect(playback.currentTimeMs()).toBe(playback.durationMs());
  });

  it('does not spam gate events while scrubbing', () => {
    const replay = buildReplay();
    playback.load(replay);
    playback.beginScrub();
    playback.scrubTo(playback.durationMs() * 0.9);
    playback.scrubTo(0);
    playback.scrubTo(playback.durationMs() * 0.8);
    expect(playback.consumeGateEvent()).toBeNull();
    playback.endScrub();
  });

  it('emits gate event once during forward playback', () => {
    const replay = buildReplay();
    playback.load(replay);
    playback.play();
    let sawGate = false;
    for (let i = 0; i < 200; i++) {
      playback.tick(0.05);
      if (playback.consumeGateEvent() !== null) {
        sawGate = true;
        break;
      }
    }
    expect(sawGate).toBe(true);
  });
});
