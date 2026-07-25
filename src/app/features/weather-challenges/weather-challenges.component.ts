import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { CourseCatalogService } from '../../core/course/services/course-catalog.service';
import { EnvironmentRegistryService } from '../../core/environment/services/environment-registry.service';
import {
  listEnabledWeatherChallenges,
  type WeatherChallengeDefinition,
} from '../../core/weather/config/weather-challenges.config';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';
import { AppShellService } from '../../core/shell/app-shell.service';

interface ChallengeCardView {
  challenge: WeatherChallengeDefinition;
  environmentName: string;
  courseName: string;
}

@Component({
  selector: 'app-weather-challenges',
  templateUrl: './weather-challenges.component.html',
  styleUrl: './weather-challenges.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherChallengesComponent {
  private readonly shell = inject(AppShellService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly registry = inject(EnvironmentRegistryService);
  private readonly catalog = inject(CourseCatalogService);

  protected readonly challenges = computed<ChallengeCardView[]>(() =>
    listEnabledWeatherChallenges().map((challenge) => ({
      challenge,
      environmentName:
        this.registry.get(challenge.environmentId)?.name ??
        challenge.environmentId,
      courseName:
        this.catalog.list().find((c) => c.id === challenge.courseId)?.name ??
        challenge.courseId,
    })),
  );

  protected onStart(challenge: WeatherChallengeDefinition): void {
    const course = this.catalog.getPlayable(challenge.courseId);
    if (!course) {
      return;
    }
    this.settings.patchEnvironment({
      selectedEnvironmentId: challenge.environmentId,
    });
    this.shell.showFlight({
      kind: 'race',
      courseId: challenge.courseId,
      weatherPresetId: challenge.weatherPresetId,
      challengeId: challenge.id,
    });
  }

  protected onBack(): void {
    this.shell.showHome();
  }
}
