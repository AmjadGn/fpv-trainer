import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SeasonApiService } from '../../core/seasons/services/season-api.service';
import { TournamentApiService } from '../../core/tournaments/services/tournament-api.service';
import { GhostEventApiService } from '../../core/ghost-events/services/ghost-event-api.service';
import { FeatureFlagService } from '../../core/features/services/feature-flag.service';
import { CompetitiveCacheService } from '../../core/cache/services/competitive-cache.service';
import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvBadgeComponent } from '../../shared/ui/fpv-badge.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvEmptyStateComponent } from '../../shared/ui/fpv-empty-state.component';
import { FpvSkeletonComponent } from '../../shared/ui/fpv-skeleton.component';
import { FpvStatComponent } from '../../shared/ui/fpv-stat.component';
import { formatRemaining } from '../../shared/format/fpv-format';

interface SeasonPayload {
  season?: {
    name?: string;
    status?: string;
    ends_at?: string | null;
    description?: string | null;
  } | null;
  name?: string;
  status?: string;
  ends_at?: string | null;
  participant?: {
    current_rating?: number;
    seasonal_points?: number;
    final_rank?: number | null;
    currentDivision?: { name?: string };
  };
}

interface TournamentRow {
  slug: string;
  name: string;
  status: string;
  featured?: boolean;
  ends_at?: string | null;
}

interface GhostEventRow {
  slug: string;
  name: string;
  enabled?: boolean;
  ends_at?: string | null;
  benchmark_type?: string;
}

@Component({
  selector: 'app-compete-hub',
  standalone: true,
  imports: [
    RouterLink,
    FpvPageHeaderComponent,
    FpvPanelComponent,
    FpvBadgeComponent,
    FpvButtonDirective,
    FpvEmptyStateComponent,
    FpvSkeletonComponent,
    FpvStatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page compete">
        <fpv-page-header
          eyebrow="Competitive"
          title="Compete"
          support="Season ranking, challenges, tournaments, and Ghost Events — focused hierarchy, not equal weight."
        >
          <a actions routerLink="/leaderboards" fpvButton variant="ghost" size="sm">Leaderboards</a>
        </fpv-page-header>

        @if (loading()) {
          <fpv-skeleton variant="card" />
          <div class="compete__grid">
            <fpv-skeleton variant="card" />
            <fpv-skeleton variant="card" />
          </div>
        } @else {
          <section class="compete__primary" aria-labelledby="season-heading">
            <fpv-panel>
              <div class="compete__season">
                <div>
                  <p class="fpv-eyebrow">Current Season</p>
                  <h2 id="season-heading" class="compete__season-title">{{ seasonName() }}</h2>
                  <p class="compete__season-support">{{ seasonSupport() }}</p>
                  <div class="compete__badges">
                    <fpv-badge tone="ranked">{{ seasonStatus() }}</fpv-badge>
                    @if (division()) {
                      <fpv-badge tone="accent">{{ division() }}</fpv-badge>
                    }
                    @if (cached()) {
                      <fpv-badge tone="offline">Cached</fpv-badge>
                    }
                  </div>
                </div>
                <dl class="compete__stats">
                  <fpv-stat label="Rating" [value]="ratingLabel()" />
                  <fpv-stat label="Rank" [value]="rankLabel()" />
                  <fpv-stat label="Time remaining" [value]="remainingLabel()" />
                </dl>
                <div class="compete__actions">
                  @if (features.seasonsEnabled()) {
                    <a routerLink="/season" fpvButton variant="primary">View Season</a>
                  }
                  <button type="button" fpvButton variant="secondary" (click)="flyRanked()">Start Ranked Run</button>
                </div>
              </div>
            </fpv-panel>
          </section>

          <div class="compete__grid">
            <fpv-panel title="Daily Challenge" subtitle="Fixed conditions. One focused grind.">
              <button type="button" fpvButton variant="secondary" size="sm" (click)="openChallenges()">Open Challenges</button>
            </fpv-panel>

            <fpv-panel title="Weekly Challenge" subtitle="Longer window, same verified rules.">
              <a routerLink="/leaderboards" fpvButton variant="ghost" size="sm">Browse boards</a>
            </fpv-panel>

            @if (features.tournamentsEnabled()) {
              <fpv-panel title="Featured Tournament" [subtitle]="featuredTournament()?.name || 'No featured tournament right now.'">
                @if (featuredTournament(); as t) {
                  <div class="compete__row">
                    <fpv-badge [tone]="t.status === 'active' ? 'success' : 'neutral'">{{ t.status }}</fpv-badge>
                    <a [routerLink]="['/tournaments', t.slug]" fpvButton variant="primary" size="sm">View</a>
                  </div>
                } @else {
                  <fpv-empty-state
                    title="No tournament"
                    body="No tournaments are active right now."
                    icon="tournament"
                    actionLabel="Browse tournaments"
                    (action)="go('/tournaments')"
                  />
                }
              </fpv-panel>
            }

            @if (features.ghostEventsEnabled()) {
              <fpv-panel title="Active Ghost Event" [subtitle]="activeGhost()?.name || 'No active Ghost Event.'">
                @if (activeGhost(); as g) {
                  <div class="compete__row">
                    <fpv-badge tone="ghost">{{ g.benchmark_type || 'Benchmark' }}</fpv-badge>
                    <a [routerLink]="['/ghost-events', g.slug]" fpvButton variant="primary" size="sm">View</a>
                  </div>
                } @else {
                  <fpv-empty-state
                    title="No Ghost Event"
                    body="Check back when a benchmark event goes live."
                    icon="ghost"
                    actionLabel="Browse events"
                    (action)="go('/ghost-events')"
                  />
                }
              </fpv-panel>
            }

            <fpv-panel title="Your Division" [subtitle]="division() || 'Join the season to receive a division.'">
              <fpv-stat label="Seasonal points" [value]="pointsLabel()" />
            </fpv-panel>

            <fpv-panel title="Recent ranking" subtitle="Rating changes appear after verified ranked runs.">
              <p class="compete__muted">Complete a Ranked Run to update your season standing.</p>
            </fpv-panel>
          </div>
        }
      </main>
    </div>
  `,
  styles: [
    `
      .compete__primary {
        margin-bottom: var(--fpv-space-24);
      }
      .compete__season {
        display: grid;
        gap: var(--fpv-space-20);
      }
      .compete__season-title {
        margin: var(--fpv-space-8) 0;
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-h1);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        line-height: 1.1;
      }
      .compete__season-support {
        margin: 0;
        color: var(--fpv-text-muted);
        max-width: 36rem;
      }
      .compete__badges,
      .compete__actions,
      .compete__row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
        align-items: center;
      }
      .compete__stats {
        margin: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: var(--fpv-space-16);
      }
      .compete__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: var(--fpv-space-16);
      }
      .compete__muted {
        margin: 0;
        color: var(--fpv-text-muted);
        font-size: var(--fpv-text-body-sm);
      }
    `,
  ],
})
export class CompeteHubComponent {
  private readonly seasonApi = inject(SeasonApiService);
  private readonly tournamentApi = inject(TournamentApiService);
  private readonly ghostApi = inject(GhostEventApiService);
  private readonly cache = inject(CompetitiveCacheService);
  private readonly shell = inject(AppShellService);
  private readonly router = inject(Router);
  protected readonly features = inject(FeatureFlagService);

  protected readonly loading = signal(true);
  protected readonly cached = signal(false);
  protected readonly season = signal<SeasonPayload | null>(null);
  protected readonly tournamentRows = signal<TournamentRow[]>([]);
  protected readonly ghostRows = signal<GhostEventRow[]>([]);

  protected readonly featuredTournament = computed(() => {
    const list = this.tournamentRows();
    return list.find((t) => t.featured) ?? list.find((t) => t.status === 'active') ?? list[0] ?? null;
  });

  protected readonly activeGhost = computed(() => {
    const list = this.ghostRows();
    return list.find((e) => e.enabled !== false) ?? list[0] ?? null;
  });

  constructor() {
    const saved = this.cache.get<SeasonPayload>('season.current', true);
    if (saved) {
      this.season.set(saved.value);
      this.cached.set(saved.stale);
      this.loading.set(false);
    }
    this.seasonApi.current().subscribe({
      next: (value) => {
        this.season.set(value as SeasonPayload);
        this.cached.set(false);
        this.cache.set('season.current', value);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.tournamentApi.list().subscribe({
      next: (value) => {
        const rows = (value as { tournaments?: TournamentRow[] })?.tournaments ?? [];
        this.tournamentRows.set(Array.isArray(rows) ? rows : []);
      },
    });
    this.ghostApi.list().subscribe({
      next: (value) => {
        const rows = (value as { events?: GhostEventRow[] })?.events ?? [];
        this.ghostRows.set(Array.isArray(rows) ? rows : []);
      },
    });
  }

  protected seasonName(): string {
    const s = this.season();
    return s?.season?.name ?? s?.name ?? 'Season';
  }

  protected seasonSupport(): string {
    return this.season()?.season?.description
      || 'Verified ranked runs feed division progress and seasonal rewards.';
  }

  protected seasonStatus(): string {
    return this.season()?.season?.status ?? this.season()?.status ?? 'Scheduled';
  }

  protected division(): string {
    return this.season()?.participant?.currentDivision?.name ?? '';
  }

  protected ratingLabel(): string {
    const r = this.season()?.participant?.current_rating;
    return r != null ? String(Math.round(r)) : '—';
  }

  protected rankLabel(): string {
    const r = this.season()?.participant?.final_rank;
    return r != null ? `#${r}` : '—';
  }

  protected pointsLabel(): string {
    const p = this.season()?.participant?.seasonal_points;
    return p != null ? String(p) : '—';
  }

  protected remainingLabel(): string {
    return formatRemaining(this.season()?.season?.ends_at ?? this.season()?.ends_at ?? null);
  }

  protected flyRanked(): void {
    void this.router.navigateByUrl('/');
    this.shell.showCourses();
  }

  protected openChallenges(): void {
    void this.router.navigateByUrl('/');
    this.shell.showChallenges();
  }

  protected go(path: string): void {
    void this.router.navigateByUrl(path);
  }
}
