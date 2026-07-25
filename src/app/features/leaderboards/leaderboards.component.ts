import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LeaderboardApiService } from '../../core/online/services/leaderboard-api.service';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvEmptyStateComponent } from '../../shared/ui/fpv-empty-state.component';
import { FpvErrorStateComponent } from '../../shared/ui/fpv-error-state.component';
import { FpvSkeletonComponent } from '../../shared/ui/fpv-skeleton.component';
import { FpvStatusBadgeComponent } from '../../shared/ui/fpv-status-badge.component';
import { formatRaceTimeMs, formatRank } from '../../shared/format/fpv-format';

interface LeaderboardRow {
  rank?: number;
  displayName?: string;
  username?: string;
  countryCode?: string;
  bestDurationMs?: number;
  durationMs?: number;
  userId?: number;
}

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    FpvPageHeaderComponent,
    FpvButtonDirective,
    FpvEmptyStateComponent,
    FpvErrorStateComponent,
    FpvSkeletonComponent,
    FpvStatusBadgeComponent,
  ],
  template: `
    <div class="fpv-page-bg">
      <main class="lb fpv-page">
        <fpv-page-header
          eyebrow="Verified competition"
          title="Leaderboards"
          support="Only server-verified ranked runs appear here."
        >
          <a actions [routerLink]="['/leaderboards', course]" fpvButton variant="ghost" size="sm">Course details</a>
        </fpv-page-header>

        <div class="lb__filters">
          <label>
            <span>Course</span>
            <select [(ngModel)]="course" (change)="load()">
              <option value="starter-circuit">Starter Circuit</option>
              <option value="industrial-sprint">Industrial Sprint</option>
              <option value="coastal-run">Coastal Run</option>
            </select>
          </label>
          <label>
            <span>Period</span>
            <select [(ngModel)]="period" (change)="load()">
              <option value="all">All time</option>
              <option value="daily">Today</option>
              <option value="weekly">This week</option>
            </select>
          </label>
        </div>

        <section class="lb__board" aria-live="polite">
          @if (loading()) {
            <fpv-skeleton variant="row" />
            <fpv-skeleton variant="row" />
            <fpv-skeleton variant="row" />
          } @else if (error()) {
            <fpv-error-state title="Leaderboard unavailable" [body]="error()" (retry)="load()" secondaryLabel="Continue Offline" (secondary)="goHome()" />
          } @else if (!entries().length) {
            <fpv-empty-state
              title="No verified runs yet"
              body="Complete a verified ranked run to enter this leaderboard."
              icon="leaderboard"
              actionLabel="Start Ranked Run"
              (action)="goHome()"
            />
          } @else {
            <div class="lb__table-wrap">
              <table class="lb__table">
                <caption class="fpv-sr-only">Course leaderboard</caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Pilot</th>
                    <th scope="col">Time</th>
                    <th scope="col">Gap</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (entry of entries(); track entry.rank; let i = $index) {
                    <tr
                      [class.lb__row--top]="(entry.rank ?? 99) <= 3"
                      [class.lb__row--me]="isCurrentUser(entry)"
                    >
                      <td class="mono" data-label="Rank">{{ formatRank(entry.rank) }}</td>
                      <td data-label="Pilot">
                        <span class="lb__pilot">{{ entry.displayName || entry.username || 'Pilot' }}</span>
                        @if (entry.countryCode) {
                          <span class="lb__country">{{ entry.countryCode }}</span>
                        }
                      </td>
                      <td class="mono" data-label="Time">{{ formatRaceTimeMs(entry.bestDurationMs ?? entry.durationMs) }}</td>
                      <td class="mono" data-label="Gap">{{ gapLabel(entry, i) }}</td>
                      <td data-label="Status"><fpv-status-badge status="verified" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </main>
    </div>
  `,
  styles: [
    `
      .lb__filters {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-16);
        margin-bottom: var(--fpv-space-20);
      }
      label {
        display: grid;
        gap: var(--fpv-space-4);
        font-size: var(--fpv-text-caption);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--fpv-text-muted);
      }
      select {
        min-width: 12rem;
        padding: 0.55rem 0.7rem;
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-md);
        background: var(--fpv-surface);
        color: var(--fpv-text);
        font: inherit;
      }
      .lb__table-wrap {
        overflow: auto;
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-lg);
        background: var(--fpv-panel);
      }
      .lb__table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--fpv-text-body-sm);
      }
      th,
      td {
        padding: 0.75rem 0.9rem;
        text-align: left;
        border-bottom: 1px solid var(--fpv-border);
      }
      th {
        position: sticky;
        top: 0;
        background: var(--fpv-surface-elevated);
        font-family: var(--fpv-font-display);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: var(--fpv-text-caption);
        color: var(--fpv-text-muted);
        z-index: 1;
      }
      .mono {
        font-family: var(--fpv-font-mono);
      }
      .lb__row--top td:first-child {
        color: var(--fpv-accent);
        font-weight: 600;
      }
      .lb__row--me {
        background: color-mix(in srgb, var(--fpv-accent) 10%, transparent);
      }
      .lb__pilot {
        font-weight: 600;
      }
      .lb__country {
        margin-left: 0.45rem;
        color: var(--fpv-text-muted);
        font-family: var(--fpv-font-mono);
        font-size: var(--fpv-text-caption);
      }
      @media (max-width: 720px) {
        thead {
          display: none;
        }
        tr {
          display: grid;
          gap: 0.35rem;
          padding: 0.85rem;
          border-bottom: 1px solid var(--fpv-border);
        }
        td {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          border: 0;
          padding: 0;
        }
        td::before {
          content: attr(data-label);
          color: var(--fpv-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: var(--fpv-text-caption);
        }
      }
    `,
  ],
})
export class LeaderboardsComponent {
  private readonly api = inject(LeaderboardApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly shell = inject(AppShellService);
  course = 'starter-circuit';
  period = 'all';
  readonly entries = signal<LeaderboardRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly formatRaceTimeMs = formatRaceTimeMs;
  readonly formatRank = formatRank;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.forCourse(this.course, { period: this.period, perPage: 25 }).subscribe({
      next: (response) => {
        const body = response as { entries?: LeaderboardRow[] };
        this.entries.set(body.entries ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Leaderboard unavailable. Check your connection.');
        this.loading.set(false);
      },
    });
  }

  isCurrentUser(entry: LeaderboardRow): boolean {
    const user = this.auth.user();
    if (!user) {
      return false;
    }
    return entry.username === user.username || String(entry.userId) === String(user.id);
  }

  gapLabel(entry: LeaderboardRow, index: number): string {
    if (index === 0) {
      return '—';
    }
    const leader = this.entries()[0]?.bestDurationMs ?? this.entries()[0]?.durationMs;
    const current = entry.bestDurationMs ?? entry.durationMs;
    if (leader == null || current == null) {
      return '—';
    }
    const delta = (current - leader) / 1000;
    return `+${delta.toFixed(2)} s`;
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
    this.shell.showCourses();
  }
}
