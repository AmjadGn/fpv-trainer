import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import type { EnvironmentMetadata } from '../../core/environment/models/environment-registry.model';
import { EnvironmentRegistryService } from '../../core/environment/services/environment-registry.service';
import { CourseCatalogService } from '../../core/course/services/course-catalog.service';
import { TrainerSettingsService } from '../../core/settings/services/trainer-settings.service';
import { AppShellService } from '../../core/shell/app-shell.service';

interface EnvironmentCardView {
  meta: EnvironmentMetadata;
  courseNames: string[];
  weatherFlags: string[];
  selected: boolean;
}

@Component({
  selector: 'app-environments',
  templateUrl: './environments.component.html',
  styleUrl: './environments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsComponent {
  private readonly registry = inject(EnvironmentRegistryService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly shell = inject(AppShellService);
  private readonly catalog = inject(CourseCatalogService);

  protected readonly selectedEnvironmentId = computed(
    () => this.settings.settings().environment.selectedEnvironmentId,
  );

  protected readonly environments = computed<EnvironmentCardView[]>(() => {
    const selectedId = this.selectedEnvironmentId();
    return this.registry.listEnabled().map((meta) => ({
      meta,
      courseNames: meta.supportedCourses.map(
        (id) => this.catalog.list().find((c) => c.id === id)?.name ?? id,
      ),
      weatherFlags: buildWeatherFlags(meta),
      selected: meta.id === selectedId,
    }));
  });

  protected onSelect(environmentId: string, mode: 'courses' | 'free'): void {
    this.settings.patchEnvironment({ selectedEnvironmentId: environmentId });
    if (mode === 'courses') {
      this.shell.showCourses();
    } else {
      this.shell.showFlight({ kind: 'free' });
    }
  }

  protected onBack(): void {
    this.shell.showHome();
  }
}

function buildWeatherFlags(meta: EnvironmentMetadata): string[] {
  const flags: string[] = [];
  if (meta.supportsWind) {
    flags.push('Wind');
  }
  if (meta.supportsFog) {
    flags.push('Fog');
  }
  const precip = meta.supportsPrecipitation.filter((p) => p !== 'none');
  if (precip.length > 0) {
    flags.push(precip.map(labelPrecip).join(' / '));
  }
  if (meta.supportsVegetation) {
    flags.push('Vegetation');
  }
  return flags;
}

function labelPrecip(type: string): string {
  switch (type) {
    case 'rain':
      return 'Rain';
    case 'lightSnow':
      return 'Snow';
    case 'dust':
      return 'Dust';
    default:
      return type;
  }
}
