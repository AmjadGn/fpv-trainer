import { Injectable, computed, inject, signal } from '@angular/core';

import {
  getWeatherPreset,
  isWeatherPresetSupported,
  listWeatherPresetsForEnvironment,
} from '../config/weather-presets.config';
import type { WeatherState } from '../models/weather.models';
import {
  CALM_WEATHER_STATE,
  cloneWeatherState,
} from '../models/weather.models';
import type { WindState } from '../models/wind.models';
import { WindFieldService } from './wind-field.service';

/**
 * Owns authoritative weather state (physics + visual drivers).
 * Visual rendering is handled by WeatherRendererService.
 */
@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly windField = inject(WindFieldService);

  private readonly _state = signal<WeatherState>(cloneWeatherState(CALM_WEATHER_STATE));
  private readonly _target = signal<WeatherState>(cloneWeatherState(CALM_WEATHER_STATE));
  private readonly _transitioning = signal(false);
  private readonly _locked = signal(false);
  private readonly _environmentId = signal('alpine-training-valley');

  private transitionElapsed = 0;
  private transitionDuration = 4;
  private fromState: WeatherState = cloneWeatherState(CALM_WEATHER_STATE);

  readonly state = this._state.asReadonly();
  readonly target = this._target.asReadonly();
  readonly transitioning = this._transitioning.asReadonly();
  readonly locked = this._locked.asReadonly();
  readonly environmentId = this._environmentId.asReadonly();

  readonly presetId = computed(() => this._state().presetId);
  readonly recordCategory = computed(() => this._state().recordCategory);
  readonly windEnabled = computed(() => this._state().wind.enabled);
  readonly windSpeedHint = computed(() => this._state().wind.baseSpeed);

  setEnvironmentId(environmentId: string): void {
    this._environmentId.set(environmentId || 'alpine-training-valley');
  }

  listAvailablePresets() {
    return listWeatherPresetsForEnvironment(this._environmentId());
  }

  /** Instantly apply a preset (races, replay restore). */
  applyPreset(
    presetId: string,
    options?: { lock?: boolean; environmentId?: string },
  ): WeatherState {
    if (options?.environmentId) {
      this.setEnvironmentId(options.environmentId);
    }
    const envId = this._environmentId();
    const resolvedId =
      isWeatherPresetSupported(presetId, envId) || getWeatherPreset(presetId)
        ? presetId
        : 'calm';
    const preset = getWeatherPreset(resolvedId) ?? getWeatherPreset('calm')!;
    const next = cloneWeatherState({
      presetId: preset.id,
      ...preset.state,
      wind: { ...preset.state.wind, baseDirection: { ...preset.state.wind.baseDirection } },
    });
    this.fromState = cloneWeatherState(next);
    this._state.set(next);
    this._target.set(next);
    this._transitioning.set(false);
    this.transitionElapsed = 0;
    this.windField.setWindState(next.wind);
    if (options?.lock) {
      this._locked.set(true);
    }
    return next;
  }

  /** Smooth free-flight transition toward a preset. */
  transitionToPreset(presetId: string): WeatherState {
    if (this._locked()) {
      return this._state();
    }
    const envId = this._environmentId();
    if (!isWeatherPresetSupported(presetId, envId) && !getWeatherPreset(presetId)) {
      return this.applyPreset('calm');
    }
    const preset = getWeatherPreset(presetId) ?? getWeatherPreset('calm')!;
    const target = cloneWeatherState({
      presetId: preset.id,
      ...preset.state,
      wind: { ...preset.state.wind, baseDirection: { ...preset.state.wind.baseDirection } },
    });
    this.fromState = cloneWeatherState(this._state());
    this._target.set(target);
    this.transitionDuration = Math.min(
      10,
      Math.max(3, target.transitionDurationSeconds || 4),
    );
    this.transitionElapsed = 0;
    this._transitioning.set(true);
    return target;
  }

  lockForRace(): void {
    this._locked.set(true);
    this._transitioning.set(false);
    this._target.set(cloneWeatherState(this._state()));
  }

  unlock(): void {
    this._locked.set(false);
  }

  /** Advance visual/physics weather interpolation (call from sim or frame). */
  update(deltaSeconds: number): void {
    if (!this._transitioning() || this._locked()) {
      return;
    }
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.transitionElapsed += dt;
    const t = Math.min(1, this.transitionElapsed / this.transitionDuration);
    const eased = t * t * (3 - 2 * t);
    const blended = blendWeather(this.fromState, this._target(), eased);
    this._state.set(blended);
    this.windField.setWindState(blended.wind);
    if (t >= 1) {
      this._transitioning.set(false);
      this._state.set(cloneWeatherState(this._target()));
      this.windField.setWindState(this._target().wind);
    }
  }

  getWindState(): WindState {
    return this.windField.getWindState();
  }

  getWindField(): WindFieldService {
    return this.windField;
  }

  /** Snapshot for replay metadata. */
  snapshotForReplay(): {
    weatherPresetId: string;
    weatherCategory: WeatherState['recordCategory'];
    windSeed: number;
    windParametersSnapshot: WindState;
  } {
    const s = this._state();
    return {
      weatherPresetId: s.presetId,
      weatherCategory: s.recordCategory,
      windSeed: s.wind.seed,
      windParametersSnapshot: {
        ...s.wind,
        baseDirection: { ...s.wind.baseDirection },
      },
    };
  }

  resetToCalm(): void {
    this._locked.set(false);
    this.applyPreset('calm');
  }
}

function blendWeather(
  from: WeatherState,
  to: WeatherState,
  t: number,
): WeatherState {
  const windEnabled = to.wind.enabled || from.wind.enabled;
  const wind: WindState = {
    enabled: windEnabled && (lerp(from.wind.enabled ? 1 : 0, to.wind.enabled ? 1 : 0, t) > 0.05),
    baseDirection: {
      x: lerp(from.wind.baseDirection.x, to.wind.baseDirection.x, t),
      y: 0,
      z: lerp(from.wind.baseDirection.z, to.wind.baseDirection.z, t),
    },
    baseSpeed: lerp(from.wind.baseSpeed, to.wind.baseSpeed, t),
    gustStrength: lerp(from.wind.gustStrength, to.wind.gustStrength, t),
    gustFrequency: lerp(from.wind.gustFrequency, to.wind.gustFrequency, t),
    turbulence: lerp(from.wind.turbulence, to.wind.turbulence, t),
    verticalDraftStrength: lerp(
      from.wind.verticalDraftStrength,
      to.wind.verticalDraftStrength,
      t,
    ),
    seed: to.wind.seed || from.wind.seed,
  };

  return {
    presetId: t < 0.5 ? from.presetId : to.presetId,
    wind,
    visibility: lerp(from.visibility, to.visibility, t),
    fogDensity: lerp(from.fogDensity, to.fogDensity, t),
    cloudCoverage: lerp(from.cloudCoverage, to.cloudCoverage, t),
    precipitationType:
      t < 0.5 ? from.precipitationType : to.precipitationType,
    precipitationIntensity: lerp(
      from.precipitationIntensity,
      to.precipitationIntensity,
      t,
    ),
    surfaceWetness: lerp(from.surfaceWetness, to.surfaceWetness, t),
    ambientLightMultiplier: lerp(
      from.ambientLightMultiplier,
      to.ambientLightMultiplier,
      t,
    ),
    sunLightMultiplier: lerp(from.sunLightMultiplier, to.sunLightMultiplier, t),
    temperatureVisualHint: lerp(
      from.temperatureVisualHint,
      to.temperatureVisualHint,
      t,
    ),
    transitionDurationSeconds: to.transitionDurationSeconds,
    recordCategory: t < 0.5 ? from.recordCategory : to.recordCategory,
    difficultyClass: t < 0.5 ? from.difficultyClass : to.difficultyClass,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
