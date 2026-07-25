import { Injectable, signal } from '@angular/core';

import {
  DEFAULT_TRAINER_SETTINGS,
  TRAINER_SETTINGS_STORAGE_KEY,
  clonePolishDefaults,
  type EnvironmentQuality,
  type TimeOfDay,
  type TrainerAudioSettings,
  type TrainerCameraEffectsSettings,
  type TrainerEnvironmentSettings,
  type TrainerGhostSettings,
  type TrainerProgressionSettings,
  type TrainerReplaySettings,
  type TrainerSettings,
  type TrainerTrainingSettings,
  type TrainerVisualEffectsSettings,
  type TrainerWeatherSettings,
  normalizeTrainerSettings,
} from '../models/trainer-settings.model';

@Injectable({ providedIn: 'root' })
export class TrainerSettingsService {
  private readonly settingsSignal = signal<TrainerSettings>(
    this.loadFromStorage(),
  );

  readonly settings = this.settingsSignal.asReadonly();

  environmentSettings(): TrainerEnvironmentSettings {
    return this.settingsSignal().environment;
  }

  weatherSettings(): TrainerWeatherSettings {
    return this.settingsSignal().weather;
  }

  cameraSettings(): TrainerCameraEffectsSettings {
    return this.settingsSignal().camera;
  }

  audioSettings(): TrainerAudioSettings {
    return this.settingsSignal().audio;
  }

  visualEffectsSettings(): TrainerVisualEffectsSettings {
    return this.settingsSignal().visualEffects;
  }

  replaySettings(): TrainerReplaySettings {
    return this.settingsSignal().replay;
  }

  ghostSettings(): TrainerGhostSettings {
    return this.settingsSignal().ghost;
  }

  trainingSettings(): TrainerTrainingSettings {
    return this.settingsSignal().training;
  }

  progressionSettings(): TrainerProgressionSettings {
    return this.settingsSignal().progression;
  }

  patchEnvironment(
    patch: Partial<TrainerEnvironmentSettings>,
  ): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      environment: {
        ...current.environment,
        ...patch,
      },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchWeather(patch: Partial<TrainerWeatherSettings>): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      weather: { ...current.weather, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchCamera(patch: Partial<TrainerCameraEffectsSettings>): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      camera: { ...current.camera, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchAudio(patch: Partial<TrainerAudioSettings>): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      audio: { ...current.audio, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchVisualEffects(
    patch: Partial<TrainerVisualEffectsSettings>,
  ): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      visualEffects: { ...current.visualEffects, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchReplay(patch: Partial<TrainerReplaySettings>): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      replay: { ...current.replay, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchGhost(patch: Partial<TrainerGhostSettings>): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      ghost: { ...current.ghost, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchTraining(patch: Partial<TrainerTrainingSettings>): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      training: { ...current.training, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  patchProgression(
    patch: Partial<TrainerProgressionSettings>,
  ): TrainerSettings {
    const current = this.settingsSignal();
    const next: TrainerSettings = {
      ...current,
      progression: { ...current.progression, ...patch },
    };
    this.settingsSignal.set(next);
    this.persist(next);
    return next;
  }

  setQuality(quality: EnvironmentQuality): void {
    this.patchEnvironment({ quality });
  }

  setTimeOfDay(timeOfDay: TimeOfDay): void {
    this.patchEnvironment({ timeOfDay });
  }

  setVegetation(vegetation: boolean): void {
    this.patchEnvironment({ vegetation });
  }

  setShadows(shadows: boolean): void {
    this.patchEnvironment({ shadows });
  }

  setFog(fog: boolean): void {
    this.patchEnvironment({ fog });
  }

  setAutoFullscreenOnFlight(autoFullscreenOnFlight: boolean): void {
    const current = this.settingsSignal();
    if (current.autoFullscreenOnFlight === autoFullscreenOnFlight) {
      return;
    }
    const next: TrainerSettings = {
      ...current,
      autoFullscreenOnFlight,
    };
    this.settingsSignal.set(next);
    this.persist(next);
  }

  /** Reset camera / audio / visual / replay polish settings only. */
  resetPolishSettings(): void {
    const current = this.settingsSignal();
    const polish = clonePolishDefaults();
    const next: TrainerSettings = {
      ...current,
      ...polish,
    };
    this.settingsSignal.set(next);
    this.persist(next);
  }

  resetToDefaults(): void {
    const next: TrainerSettings = normalizeTrainerSettings({
      ...DEFAULT_TRAINER_SETTINGS,
      environment: { ...DEFAULT_TRAINER_SETTINGS.environment },
    });
    this.settingsSignal.set(next);
    this.persist(next);
  }

  private loadFromStorage(): TrainerSettings {
    try {
      const raw = localStorage.getItem(TRAINER_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return normalizeTrainerSettings(null);
      }
      return normalizeTrainerSettings(JSON.parse(raw));
    } catch {
      return normalizeTrainerSettings(null);
    }
  }

  private persist(settings: TrainerSettings): void {
    try {
      localStorage.setItem(
        TRAINER_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    } catch {
      // Quota / private mode — ignore.
    }
  }
}
