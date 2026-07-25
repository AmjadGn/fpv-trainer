import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { formatRunTime } from '../../core/course/models/run-state.model';
import {
  CourseCatalogService,
  type CourseCatalogEntry,
} from '../../core/course/services/course-catalog.service';
import { bestTimeKey } from '../../core/course/services/course-run.service';
import { EnvironmentRegistryService } from '../../core/environment/services/environment-registry.service';
import { GhostStorageService } from '../../core/ghost/services/ghost-storage.service';
import { NetworkStatusService } from '../../core/network/network-status.service';
import { RankedRaceService } from '../../core/online/services/ranked-race.service';
import { ProgressionService } from '../../core/progression/services/progression.service';
import { AppShellService } from '../../core/shell/app-shell.service';

interface CourseCardView {
  entry: CourseCatalogEntry;
  bestTimeLabel: string;
  hasGhost: boolean;
}

@Component({
  selector: 'app-courses',
  templateUrl: './courses.component.html',
  styleUrl: './courses.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesComponent {
  private readonly shell = inject(AppShellService);
  private readonly catalog = inject(CourseCatalogService);
  private readonly environmentRegistry = inject(EnvironmentRegistryService);
  private readonly ghostStorage = inject(GhostStorageService);
  private readonly progression = inject(ProgressionService);
  private readonly auth = inject(AuthSessionService);
  private readonly network = inject(NetworkStatusService);
  private readonly ranked = inject(RankedRaceService);
  private readonly router = inject(Router);

  protected readonly rankedError = signal<string | null>(null);
  protected readonly rankedBusy = signal(false);
  protected readonly canRank = computed(
    () => this.auth.isAuthenticated() && this.network.online() && !this.network.apiUnavailable(),
  );

  protected readonly courses = computed<CourseCardView[]>(() => {
    // Recompute when race bests change.
    void this.progression.progress().bestTimes;
    return this.catalog.list().map((entry) => ({
      entry,
      bestTimeLabel: formatRunTime(loadBestTimeSeconds(entry.id)),
      hasGhost: this.ghostStorage.hasGhost(entry.id),
    }));
  });

  protected environmentLabel(environmentId: string): string {
    return this.environmentRegistry.get(environmentId)?.name ?? environmentId;
  }

  protected onStartRace(courseId: string): void {
    const course = this.catalog.getPlayable(courseId);
    if (!course) {
      return;
    }
    this.shell.showFlight({ kind: 'race', courseId });
  }

  protected onStartRanked(courseId: string): void {
    this.rankedError.set(null);
    if (!this.auth.isAuthenticated()) {
      void this.router.navigateByUrl('/login');
      return;
    }
    if (!this.network.online()) {
      this.rankedError.set('Ranked runs need a network connection. Local races still work.');
      return;
    }
    const course = this.catalog.getPlayable(courseId);
    if (!course) {
      return;
    }
    const weatherPresetId = 'calm';
    this.rankedBusy.set(true);
    this.ranked.startSession(courseId, weatherPresetId).subscribe({
      next: (session) => {
        this.rankedBusy.set(false);
        this.shell.showFlight({
          kind: 'race',
          courseId,
          weatherPresetId: session.weatherPresetId,
          ranked: true,
          rankedSession: {
            id: session.id,
            nonce: session.nonce,
            environmentId: session.environmentId,
            weatherPresetId: session.weatherPresetId,
            rulesVersion: session.rulesVersion,
            expiresAt: session.expiresAt,
          },
        });
      },
      error: () => {
        this.rankedBusy.set(false);
        this.rankedError.set(
          'Could not start a ranked session. Offline flight is still available.',
        );
      },
    });
  }

  protected onEnvironments(): void {
    this.shell.showEnvironments();
  }

  protected onBack(): void {
    this.shell.showHome();
  }
}

function loadBestTimeSeconds(courseId: string): number | null {
  try {
    const raw = localStorage.getItem(bestTimeKey(courseId));
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'seconds' in parsed &&
      typeof (parsed as { seconds: unknown }).seconds === 'number' &&
      Number.isFinite((parsed as { seconds: number }).seconds) &&
      (parsed as { seconds: number }).seconds >= 0
    ) {
      return (parsed as { seconds: number }).seconds;
    }
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return asNumber;
    }
  } catch {
    // Ignore.
  }
  return null;
}
