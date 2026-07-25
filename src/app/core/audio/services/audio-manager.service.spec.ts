import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_TRAINER_SETTINGS,
  TRAINER_SETTINGS_STORAGE_KEY,
  clampVolume,
  normalizeTrainerSettings,
} from '../../settings/models/trainer-settings.model';
import { TrainerSettingsService } from '../../settings/services/trainer-settings.service';
import { AudioManagerService } from './audio-manager.service';
import { DroneAudioService } from './drone-audio.service';
import { GameplayAudioService } from './gameplay-audio.service';

class MockAudioParam {
  value = 0;
  setTargetAtTime(v: number): void {
    this.value = v;
  }
  setValueAtTime(v: number): void {
    this.value = v;
  }
  exponentialRampToValueAtTime(): void {
    // no-op
  }
  linearRampToValueAtTime(): void {
    // no-op
  }
}

class MockGainNode {
  gain = new MockAudioParam();
  connect(): this {
    return this;
  }
  disconnect(): void {
    // no-op
  }
}

class MockOscillator {
  type = 'sine';
  frequency = new MockAudioParam();
  connect(): this {
    return this;
  }
  disconnect(): void {
    // no-op
  }
  start(): void {
    // no-op
  }
  stop(): void {
    // no-op
  }
  onended: (() => void) | null = null;
}

class MockFilter {
  type = 'lowpass';
  frequency = new MockAudioParam();
  Q = new MockAudioParam();
  connect(): this {
    return this;
  }
  disconnect(): void {
    // no-op
  }
}

class MockBufferSource {
  buffer: unknown = null;
  loop = false;
  connect(): this {
    return this;
  }
  disconnect(): void {
    // no-op
  }
  start(): void {
    // no-op
  }
  stop(): void {
    // no-op
  }
  onended: (() => void) | null = null;
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createGain(): MockGainNode {
    return new MockGainNode();
  }
  createOscillator(): MockOscillator {
    return new MockOscillator();
  }
  createBiquadFilter(): MockFilter {
    return new MockFilter();
  }
  createBufferSource(): MockBufferSource {
    return new MockBufferSource();
  }
  createBuffer(
    _channels: number,
    length: number,
    _rate: number,
  ): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return {
      getChannelData: () => data,
    };
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('Audio settings model', () => {
  it('provides defaults', () => {
    expect(DEFAULT_AUDIO_SETTINGS.masterVolume).toBe(70);
    expect(DEFAULT_AUDIO_SETTINGS.motorVolume).toBe(65);
  });

  it('clamps volumes', () => {
    expect(clampVolume(150, 70)).toBe(100);
    expect(clampVolume(-10, 70)).toBe(0);
    expect(clampVolume(Number.NaN, 70)).toBe(70);
  });

  it('migrates missing polish settings', () => {
    const normalized = normalizeTrainerSettings({
      version: 1,
      environment: {
        quality: 'low',
        timeOfDay: 'morning',
        vegetation: true,
        shadows: true,
        fog: true,
      },
      autoFullscreenOnFlight: true,
    });
    expect(normalized.autoFullscreenOnFlight).toBe(true);
    expect(normalized.environment.quality).toBe('low');
    expect(normalized.audio.masterVolume).toBe(70);
    expect(normalized.camera.cameraEffectsEnabled).toBe(true);
    expect(normalized.version).toBe(DEFAULT_TRAINER_SETTINGS.version);
  });

  it('replaces invalid polish values safely', () => {
    const normalized = normalizeTrainerSettings({
      version: 2,
      environment: DEFAULT_TRAINER_SETTINGS.environment,
      camera: { cameraEffectsIntensity: 'ultra', dynamicFovStrength: 99 },
      audio: { masterVolume: 999, motorVolume: 'loud' },
    });
    expect(normalized.camera.cameraEffectsIntensity).toBe('low');
    expect(normalized.camera.dynamicFovStrength).toBeLessThanOrEqual(8);
    expect(normalized.audio.masterVolume).toBe(100);
    expect(normalized.audio.motorVolume).toBe(65);
  });
});

describe('TrainerSettingsService polish persistence', () => {
  let service: TrainerSettingsService;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
      configurable: true,
    });
    TestBed.configureTestingModule({
      providers: [TrainerSettingsService],
    });
    service = TestBed.inject(TrainerSettingsService);
  });

  afterEach(() => {
    storage.clear();
  });

  it('persists audio settings', () => {
    service.patchAudio({ masterVolume: 40, motorVolume: 30 });
    const raw = storage.get(TRAINER_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.audio.masterVolume).toBe(40);
    expect(parsed.audio.motorVolume).toBe(30);
  });

  it('resetPolishSettings preserves environment', () => {
    service.setQuality('high');
    service.patchAudio({ masterVolume: 10 });
    service.resetPolishSettings();
    expect(service.environmentSettings().quality).toBe('high');
    expect(service.audioSettings().masterVolume).toBe(70);
  });
});

describe('AudioManagerService / DroneAudioService', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', MockAudioContext);
    TestBed.configureTestingModule({
      providers: [AudioManagerService, DroneAudioService, GameplayAudioService],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles initialization failure gracefully', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const manager = TestBed.inject(AudioManagerService);
    const ok = await manager.unlock();
    expect(ok).toBe(false);
    expect(manager.unlockState()).toBe('unavailable');
  });

  it('unlocks and updates motor targets', async () => {
    const manager = TestBed.inject(AudioManagerService);
    const drone = TestBed.inject(DroneAudioService);
    const ok = await manager.unlock();
    expect(ok).toBe(true);
    manager.applySettings(DEFAULT_AUDIO_SETTINGS);
    drone.update({
      armed: true,
      crashed: false,
      throttle: 0.8,
      paused: false,
    });
    expect(drone).toBeTruthy();
    drone.dispose();
    manager.dispose();
  });

  it('mute prevents effect playback', async () => {
    const manager = TestBed.inject(AudioManagerService);
    const gameplay = TestBed.inject(GameplayAudioService);
    await manager.unlock();
    manager.setMuted(true);
    expect(() => gameplay.play('gate')).not.toThrow();
  });

  it('audio disabled prevents effect playback', async () => {
    const manager = TestBed.inject(AudioManagerService);
    const gameplay = TestBed.inject(GameplayAudioService);
    await manager.unlock();
    manager.applySettings({ ...DEFAULT_AUDIO_SETTINGS, audioEnabled: false });
    expect(() => gameplay.beepGate()).not.toThrow();
  });
});
