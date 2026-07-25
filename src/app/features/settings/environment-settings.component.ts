import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';

import { EnvironmentRegistryService } from '../../core/environment/services/environment-registry.service';
import { listWeatherPresetsForEnvironment } from '../../core/weather/config/weather-presets.config';
import type {
  EnvironmentQuality,
  TimeOfDay,
  TrainerEnvironmentSettings,
  TrainerWeatherSettings,
} from '../../core/settings/models/trainer-settings.model';

@Component({
  selector: 'app-environment-settings',
  templateUrl: './environment-settings.component.html',
  styleUrl: './environment-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentSettingsComponent {
  private readonly registry = inject(EnvironmentRegistryService);

  readonly settings = input.required<TrainerEnvironmentSettings>();
  readonly weather = input<TrainerWeatherSettings | null>(null);
  readonly disabled = input(false);

  readonly qualityChange = output<EnvironmentQuality>();
  readonly timeOfDayChange = output<TimeOfDay>();
  readonly vegetationChange = output<boolean>();
  readonly shadowsChange = output<boolean>();
  readonly fogChange = output<boolean>();
  readonly environmentIdChange = output<string>();
  readonly weatherPresetChange = output<string>();
  readonly windHudChange = output<boolean>();
  readonly windPhysicsChange = output<boolean>();
  readonly precipitationChange = output<boolean>();
  readonly ambienceVolumeChange = output<number>();
  readonly weatherAudioVolumeChange = output<number>();

  protected readonly qualities: EnvironmentQuality[] = [
    'low',
    'medium',
    'high',
  ];
  protected readonly times: TimeOfDay[] = ['morning', 'midday', 'sunset'];

  protected readonly environments = computed(() => this.registry.listEnabled());

  protected readonly weatherPresets = computed(() =>
    listWeatherPresetsForEnvironment(this.settings().selectedEnvironmentId),
  );

  protected labelQuality(q: EnvironmentQuality): string {
    switch (q) {
      case 'low':
        return 'Low';
      case 'high':
        return 'High';
      default:
        return 'Medium';
    }
  }

  protected labelTime(t: TimeOfDay): string {
    switch (t) {
      case 'morning':
        return 'Morning';
      case 'sunset':
        return 'Sunset';
      default:
        return 'Midday';
    }
  }

  protected onEnvironmentSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) {
      this.environmentIdChange.emit(value);
    }
  }

  protected onWeatherPresetSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) {
      this.weatherPresetChange.emit(value);
    }
  }

  protected onAmbienceVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.ambienceVolumeChange.emit(value);
    }
  }

  protected onWeatherAudioVolume(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.weatherAudioVolumeChange.emit(value);
    }
  }
}
