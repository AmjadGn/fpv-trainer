import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TRAINER_SETTINGS,
  TRAINER_SETTINGS_STORAGE_KEY,
  normalizeTrainerSettings,
} from '../models/trainer-settings.model';
import { TrainerSettingsService } from './trainer-settings.service';

describe('TrainerSettingsService', () => {
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

  it('provides environment defaults', () => {
    expect(service.environmentSettings()).toEqual(
      DEFAULT_TRAINER_SETTINGS.environment,
    );
    expect(service.environmentSettings().selectedEnvironmentId).toBe(
      'alpine-training-valley',
    );
  });

  it('provides weather defaults including calm preset', () => {
    expect(service.weatherSettings()).toEqual(DEFAULT_TRAINER_SETTINGS.weather);
    expect(service.weatherSettings().selectedFreeFlightWeatherPreset).toBe(
      'calm',
    );
  });

  it('persists environment changes', () => {
    service.setQuality('high');
    service.setTimeOfDay('sunset');
    service.setVegetation(false);
    const raw = storage.get(TRAINER_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.environment.quality).toBe('high');
    expect(parsed.environment.timeOfDay).toBe('sunset');
    expect(parsed.environment.vegetation).toBe(false);
  });

  it('persists weather changes', () => {
    service.patchWeather({
      windHudEnabled: true,
      environmentAmbienceVolume: 25,
    });
    const raw = storage.get(TRAINER_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.weather.windHudEnabled).toBe(true);
    expect(parsed.weather.environmentAmbienceVolume).toBe(25);
    expect(parsed.weather.selectedFreeFlightWeatherPreset).toBe('calm');
  });

  it('migrates / normalizes invalid saved settings', () => {
    const normalized = normalizeTrainerSettings({
      version: 0,
      environment: {
        quality: 'ultra',
        timeOfDay: 'noon',
        vegetation: 'yes',
        shadows: true,
        fog: false,
      },
    });
    expect(normalized.environment.quality).toBe('medium');
    expect(normalized.environment.timeOfDay).toBe('midday');
    expect(normalized.environment.vegetation).toBe(true);
    expect(normalized.environment.fog).toBe(false);
    expect(normalized.environment.shadows).toBe(true);
    expect(normalized.environment.selectedEnvironmentId).toBe(
      'alpine-training-valley',
    );
    expect(normalized.audio.masterVolume).toBe(70);
    expect(normalized.camera.cameraEffectsEnabled).toBe(true);
    expect(normalized.weather).toEqual(DEFAULT_TRAINER_SETTINGS.weather);
    expect(normalized.version).toBe(4);
  });

  it('fills ghost / training / progression defaults when migrating old v2 settings', () => {
    const normalized = normalizeTrainerSettings({
      version: 2,
      environment: {
        quality: 'low',
        timeOfDay: 'morning',
        vegetation: true,
        shadows: true,
        fog: true,
      },
      autoFullscreenOnFlight: true,
      camera: { ...DEFAULT_TRAINER_SETTINGS.camera },
      audio: { ...DEFAULT_TRAINER_SETTINGS.audio },
      visualEffects: { ...DEFAULT_TRAINER_SETTINGS.visualEffects },
      replay: { ...DEFAULT_TRAINER_SETTINGS.replay },
      // Intentionally omit ghost / training / progression (pre-v3).
    });
    expect(normalized.version).toBe(4);
    expect(normalized.ghost).toEqual(DEFAULT_TRAINER_SETTINGS.ghost);
    expect(normalized.training).toEqual(DEFAULT_TRAINER_SETTINGS.training);
    expect(normalized.progression).toEqual(
      DEFAULT_TRAINER_SETTINGS.progression,
    );
    expect(normalized.weather).toEqual(DEFAULT_TRAINER_SETTINGS.weather);
    expect(normalized.autoFullscreenOnFlight).toBe(true);
  });

  it('migrates v3-shaped settings missing weather to defaults', () => {
    const normalized = normalizeTrainerSettings({
      version: 3,
      environment: {
        quality: 'high',
        timeOfDay: 'sunset',
        vegetation: false,
        shadows: true,
        fog: true,
      },
      autoFullscreenOnFlight: false,
      camera: { ...DEFAULT_TRAINER_SETTINGS.camera },
      audio: { ...DEFAULT_TRAINER_SETTINGS.audio },
      visualEffects: { ...DEFAULT_TRAINER_SETTINGS.visualEffects },
      replay: { ...DEFAULT_TRAINER_SETTINGS.replay },
      ghost: { ...DEFAULT_TRAINER_SETTINGS.ghost },
      training: { ...DEFAULT_TRAINER_SETTINGS.training },
      progression: { ...DEFAULT_TRAINER_SETTINGS.progression },
      // Intentionally omit weather / selectedEnvironmentId (pre-v4).
    });
    expect(normalized.version).toBe(4);
    expect(normalized.environment.selectedEnvironmentId).toBe(
      'alpine-training-valley',
    );
    expect(normalized.environment.quality).toBe('high');
    expect(normalized.environment.vegetation).toBe(false);
    expect(normalized.weather).toEqual(DEFAULT_TRAINER_SETTINGS.weather);
    expect(normalized.weather.selectedFreeFlightWeatherPreset).toBe('calm');
  });

  it('clamps weather ambience volume and falls back empty environment id', () => {
    const clampedHigh = normalizeTrainerSettings({
      version: 4,
      environment: {
        selectedEnvironmentId: '',
        quality: 'medium',
        timeOfDay: 'midday',
        vegetation: true,
        shadows: true,
        fog: true,
      },
      weather: {
        ...DEFAULT_TRAINER_SETTINGS.weather,
        environmentAmbienceVolume: 150,
        selectedFreeFlightWeatherPreset: '',
      },
    });
    expect(clampedHigh.environment.selectedEnvironmentId).toBe(
      'alpine-training-valley',
    );
    expect(clampedHigh.weather.environmentAmbienceVolume).toBe(100);
    expect(clampedHigh.weather.selectedFreeFlightWeatherPreset).toBe('calm');

    const clampedLow = normalizeTrainerSettings({
      version: 4,
      weather: {
        ...DEFAULT_TRAINER_SETTINGS.weather,
        environmentAmbienceVolume: -10,
        weatherAudioVolume: 200,
      },
    });
    expect(clampedLow.weather.environmentAmbienceVolume).toBe(0);
    expect(clampedLow.weather.weatherAudioVolume).toBe(100);
  });

  it('keeps unknown non-empty environment id strings', () => {
    const normalized = normalizeTrainerSettings({
      version: 4,
      environment: {
        selectedEnvironmentId: 'future-coastal-ruins',
        quality: 'medium',
        timeOfDay: 'midday',
        vegetation: true,
        shadows: true,
        fog: true,
      },
    });
    expect(normalized.environment.selectedEnvironmentId).toBe(
      'future-coastal-ruins',
    );
  });

  it('clamps ghostOpacity and falls back invalid ghostComparisonMode', () => {
    const clampedHigh = normalizeTrainerSettings({
      version: 3,
      ghost: {
        ghostEnabled: true,
        ghostTrailEnabled: true,
        ghostOpacity: 2.5,
        ghostCountdownPreview: true,
        ghostComparisonMode: 'gateSplits',
      },
    });
    expect(clampedHigh.ghost.ghostOpacity).toBe(1);

    const clampedLow = normalizeTrainerSettings({
      version: 3,
      ghost: {
        ghostEnabled: true,
        ghostTrailEnabled: true,
        ghostOpacity: -0.4,
        ghostCountdownPreview: true,
        ghostComparisonMode: 'not-a-mode',
      },
    });
    expect(clampedLow.ghost.ghostOpacity).toBe(0);
    expect(clampedLow.ghost.ghostComparisonMode).toBe('gateSplits');
    expect(clampedLow.version).toBe(4);
  });

  it('persists autoFullscreenOnFlight', () => {
    expect(service.settings().autoFullscreenOnFlight).toBe(false);
    service.setAutoFullscreenOnFlight(true);
    const raw = storage.get(TRAINER_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.autoFullscreenOnFlight).toBe(true);
  });

  it('migrates missing autoFullscreenOnFlight to default', () => {
    const normalized = normalizeTrainerSettings({
      version: 1,
      environment: {
        quality: 'low',
        timeOfDay: 'morning',
        vegetation: true,
        shadows: true,
        fog: true,
      },
    });
    expect(normalized.autoFullscreenOnFlight).toBe(false);
  });

  it('loads persisted settings on construct', () => {
    storage.set(
      TRAINER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        environment: {
          quality: 'low',
          timeOfDay: 'morning',
          vegetation: true,
          shadows: false,
          fog: true,
        },
      }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [TrainerSettingsService],
    });
    const fresh = TestBed.inject(TrainerSettingsService);
    expect(fresh.environmentSettings().quality).toBe('low');
    expect(fresh.environmentSettings().timeOfDay).toBe('morning');
    expect(fresh.environmentSettings().shadows).toBe(false);
    expect(fresh.environmentSettings().selectedEnvironmentId).toBe(
      'alpine-training-valley',
    );
    expect(fresh.weatherSettings()).toEqual(DEFAULT_TRAINER_SETTINGS.weather);
  });
});
