import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SeasonApiService } from '../core/seasons/services/season-api.service';
import { TournamentApiService } from '../core/tournaments/services/tournament-api.service';
import { GhostEventApiService } from '../core/ghost-events/services/ghost-event-api.service';
import { MissionApiService } from '../core/missions/services/mission-api.service';
import { CosmeticApiService, type LoadoutPayload } from '../core/cosmetics/services/cosmetic-api.service';
import { NotificationApiService } from '../core/notifications/services/notification-api.service';
import { CompetitiveCacheService } from '../core/cache/services/competitive-cache.service';
import { AuthSessionService } from '../core/auth/services/auth-session.service';
import { FpvPageHeaderComponent } from '../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../shared/ui/fpv-panel.component';
import { FpvBadgeComponent } from '../shared/ui/fpv-badge.component';
import { FpvButtonDirective } from '../shared/ui/fpv-button.directive';
import { FpvEmptyStateComponent } from '../shared/ui/fpv-empty-state.component';
import { FpvErrorStateComponent } from '../shared/ui/fpv-error-state.component';
import { FpvSkeletonComponent } from '../shared/ui/fpv-skeleton.component';
import { FpvTabsComponent, type FpvTabItem } from '../shared/ui/fpv-tabs.component';
import { FpvStatComponent } from '../shared/ui/fpv-stat.component';
import { FpvCardComponent } from '../shared/ui/fpv-card.component';
import { FpvProgressComponent } from '../shared/ui/fpv-progress.component';
import { FpvStatusBadgeComponent } from '../shared/ui/fpv-status-badge.component';
import {
  formatCacheAge,
  formatDate,
  formatRaceTimeMs,
  formatRank,
  formatRelativeTime,
  formatRemaining,
} from '../shared/format/fpv-format';

const PAGE = `
  .online-page { width: min(var(--fpv-content-max), calc(100% - 2 * var(--fpv-page-gutter))); margin: 0 auto; padding: var(--fpv-space-24) 0 var(--fpv-space-48); }
  .stack { display: grid; gap: var(--fpv-space-16); }
  .row { display: flex; flex-wrap: wrap; gap: var(--fpv-space-8); align-items: center; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--fpv-space-16); }
  .muted { color: var(--fpv-text-muted); font-size: var(--fpv-text-body-sm); margin: 0; }
  .title { margin: 0; font-family: var(--fpv-font-display); font-size: var(--fpv-text-h2); letter-spacing: .04em; text-transform: uppercase; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--fpv-space-12); margin: 0; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--fpv-space-8); }
  .list li, .notif { display: grid; gap: var(--fpv-space-4); padding: var(--fpv-space-12); border: 1px solid var(--fpv-border); border-radius: var(--fpv-radius-md); background: color-mix(in srgb, var(--fpv-panel) 90%, transparent); }
  .notif--unread { border-color: color-mix(in srgb, var(--fpv-accent) 45%, transparent); }
  .notif__time { color: var(--fpv-text-muted); font-family: var(--fpv-font-mono); font-size: var(--fpv-text-caption); }
  .table-wrap { overflow: auto; border: 1px solid var(--fpv-border); border-radius: var(--fpv-radius-lg); }
  table { width: 100%; border-collapse: collapse; font-size: var(--fpv-text-body-sm); }
  th, td { padding: .7rem .85rem; text-align: left; border-bottom: 1px solid var(--fpv-border); }
  th { position: sticky; top: 0; background: var(--fpv-surface-elevated); font-family: var(--fpv-font-display); letter-spacing: .08em; text-transform: uppercase; font-size: var(--fpv-text-caption); color: var(--fpv-text-muted); }
  .mono { font-family: var(--fpv-font-mono); }
  .ghost-option { display: flex; align-items: center; gap: var(--fpv-space-12); padding: var(--fpv-space-12); border: 1px solid var(--fpv-border); border-radius: var(--fpv-radius-md); }
  .ghost-option input { accent-color: var(--fpv-accent); }
  .group-label { margin: var(--fpv-space-16) 0 var(--fpv-space-8); color: var(--fpv-text-muted); font-size: var(--fpv-text-caption); letter-spacing: .1em; text-transform: uppercase; }
  .reward-path { display: flex; gap: var(--fpv-space-8); overflow: auto; padding-bottom: var(--fpv-space-8); }
  .reward-node { min-width: 140px; padding: var(--fpv-space-12); border: 1px solid var(--fpv-border); border-radius: var(--fpv-radius-md); background: var(--fpv-panel); }
  .reward-node--earned { border-color: color-mix(in srgb, var(--fpv-success) 50%, transparent); }
  .preview { min-height: 160px; border: 1px solid var(--fpv-border); border-radius: var(--fpv-radius-lg); background: linear-gradient(160deg, color-mix(in srgb, var(--fpv-accent) 12%, transparent), var(--fpv-panel)); display: grid; place-items: center; color: var(--fpv-text-muted); }
`;

abstract class OnlinePage {
  protected readonly auth = inject(AuthSessionService);
  protected readonly router = inject(Router);
  protected offline(): void {
    void this.router.navigateByUrl('/');
  }
  protected signIn(): void {
    void this.router.navigateByUrl('/login');
  }
}


/** Loose API row shape for competitive screens (snake_case from Laravel). */
export interface CompetitiveRow {
  id?: string | number;
  key?: string;
  slug?: string;
  name?: string;
  title?: string;
  description?: string | null;
  status?: string;
  featured?: boolean;
  ends_at?: string | null;
  starts_at?: string | null;
  course_id?: string;
  weather_preset_id?: string | null;
  environment_id?: string;
  max_attempts?: number | null;
  max_visible_ghosts?: number;
  benchmark_type?: string;
  duration_ms?: number;
  label?: string;
  slot?: number | string;
  category?: string;
  default_owned?: boolean;
  owned?: boolean;
  cosmetic_key?: string;
  reward_key?: string;
  granted_at?: string;
  completed_at?: string | null;
  target_value?: number;
  reward_season_points?: number;
  reward_xp?: number;
  progress_value?: number;
  progress?: Array<{ progress_value?: number; completed_at?: string | null }>;
  final_rank?: number | null;
  rank?: number | null;
  current_rating?: number;
  seasonal_points?: number;
  currentDivision?: { name?: string };
  user?: { display_name?: string; username?: string };
  benchmarks?: CompetitiveRow[];
}

function asArray<T>(value: unknown, key?: string): T[] {

  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === 'object' && key && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, unknown>)[key] as T[];
  }
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

function pickSeason(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const obj = value as Record<string, unknown>;
  if (obj['season'] && typeof obj['season'] === 'object') {
    return { ...(obj['season'] as Record<string, unknown>), participant: obj['participant'] };
  }
  return obj;
}

@Component({
  standalone: true,
  imports: [
    RouterLink,
    FpvPageHeaderComponent,
    FpvPanelComponent,
    FpvBadgeComponent,
    FpvButtonDirective,
    FpvErrorStateComponent,
    FpvSkeletonComponent,
    FpvTabsComponent,
    FpvStatComponent,
  ],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg">
      <main class="online-page stack">
        <fpv-page-header eyebrow="Season" [title]="title()" [support]="description()">
          <div actions class="row">
            @if (cached()) {
              <fpv-badge tone="offline">{{ cacheLabel() }}</fpv-badge>
            }
            <a routerLink="/compete" fpvButton variant="ghost" size="sm">Compete hub</a>
          </div>
        </fpv-page-header>

        <fpv-tabs [tabs]="tabs" [activeId]="tab()" (activeIdChange)="onTab($event)" ariaLabel="Season sections" />

        @if (loading()) {
          <fpv-skeleton variant="card" />
        } @else if (error()) {
          <fpv-error-state title="Could not load season" [body]="error()" (retry)="reload()" secondaryLabel="Continue Offline" (secondary)="offline()" />
        } @else {
          <fpv-panel>
            <div class="stack">
              <div class="row">
                <fpv-badge tone="ranked">{{ status() }}</fpv-badge>
                @if (division()) {
                  <fpv-badge tone="accent">{{ division() }}</fpv-badge>
                }
                <span class="muted">{{ remaining() }}</span>
              </div>
              <dl class="meta">
                <fpv-stat label="Rating" [value]="rating()" />
                <fpv-stat label="Global rank" [value]="rank()" />
                <fpv-stat label="Season points" [value]="points()" />
              </dl>
              @if (placement()) {
                <p class="muted">Placement: {{ placement() }}</p>
              }
              <div class="row">
                <a routerLink="/season/leaderboard" fpvButton variant="secondary" size="sm">Leaderboard</a>
                <a routerLink="/season/missions" fpvButton variant="secondary" size="sm">Missions</a>
                <a routerLink="/season/rewards" fpvButton variant="secondary" size="sm">Rewards</a>
                <a routerLink="/season/history" fpvButton variant="ghost" size="sm">History</a>
              </div>
            </div>
          </fpv-panel>
        }
      </main>
    </div>
  `,
})
export class SeasonHomeComponent extends OnlinePage {
  private readonly api = inject(SeasonApiService);
  private readonly cache = inject(CompetitiveCacheService);
  readonly data = signal<unknown>(null);
  readonly cached = signal(false);
  readonly cacheTs = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tab = signal('overview');
  readonly tabs: FpvTabItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'missions', label: 'Missions' },
    { id: 'rewards', label: 'Rewards' },
    { id: 'history', label: 'History' },
  ];
  readonly title = computed(() => String(pickSeason(this.data())['name'] ?? 'Season'));
  readonly description = computed(() => String(pickSeason(this.data())['description'] ?? 'Division progress from verified ranked runs.'));
  readonly status = computed(() => String(pickSeason(this.data())['status'] ?? '—'));
  readonly remaining = computed(() => formatRemaining(pickSeason(this.data())['ends_at'] as string | null));
  readonly division = computed(() => {
    const p = pickSeason(this.data())['participant'] as { currentDivision?: { name?: string } } | undefined;
    return p?.currentDivision?.name ?? '';
  });
  readonly rating = computed(() => {
    const p = pickSeason(this.data())['participant'] as { current_rating?: number } | undefined;
    return p?.current_rating != null ? String(Math.round(p.current_rating)) : '—';
  });
  readonly rank = computed(() => {
    const p = pickSeason(this.data())['participant'] as { final_rank?: number | null } | undefined;
    return formatRank(p?.final_rank ?? null);
  });
  readonly points = computed(() => {
    const p = pickSeason(this.data())['participant'] as { seasonal_points?: number } | undefined;
    return p?.seasonal_points != null ? String(p.seasonal_points) : '—';
  });
  readonly placement = computed(() => {
    const p = pickSeason(this.data())['participant'] as { placement_status?: string } | undefined;
    return p?.placement_status ?? '';
  });

  constructor() {
    super();
    const saved = this.cache.get<unknown>('season.current', true);
    if (saved) {
      this.data.set(saved.value);
      this.cached.set(saved.stale);
      this.cacheTs.set(Date.now());
      this.loading.set(false);
    }
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.current().subscribe({
      next: (value) => {
        this.data.set(value);
        this.cached.set(false);
        this.cache.set('season.current', value);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        if (!this.data()) {
          this.error.set('Season data is unavailable. You can keep flying offline.');
        }
      },
    });
  }

  cacheLabel(): string {
    return formatCacheAge(this.cacheTs());
  }

  onTab(id: string): void {
    this.tab.set(id);
    const map: Record<string, string> = {
      overview: '/season',
      leaderboard: '/season/leaderboard',
      missions: '/season/missions',
      rewards: '/season/rewards',
      history: '/season/history',
    };
    void this.router.navigateByUrl(map[id] ?? '/season');
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvSkeletonComponent, FpvEmptyStateComponent, FpvErrorStateComponent, FpvButtonDirective],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Season" title="Leaderboard" support="Division and global standing for the current season.">
        <a actions routerLink="/season" fpvButton variant="ghost" size="sm">Overview</a>
      </fpv-page-header>
      @if (loading()) { <fpv-skeleton variant="row" /><fpv-skeleton variant="row" /> }
      @else if (error()) { <fpv-error-state title="Leaderboard unavailable" [body]="error()" (retry)="load()" /> }
      @else if (!rows().length) { <fpv-empty-state title="No leaderboard entry" body="Complete a verified ranked run to enter this leaderboard." icon="leaderboard" actionLabel="Start Ranked Run" (action)="goFly()" /> }
      @else {
        <div class="table-wrap"><table><caption class="fpv-sr-only">Season leaderboard</caption>
          <thead><tr><th>Rank</th><th>Pilot</th><th>Division</th><th>Rating</th><th>Points</th></tr></thead>
          <tbody>
            @for (row of rows(); track row.id ?? $index) {
              <tr>
                <td class="mono">{{ formatRank(row.final_rank ?? row.rank) }}</td>
                <td>{{ row.user?.display_name || row.user?.username || 'Pilot' }}</td>
                <td>{{ row.currentDivision?.name || '—' }}</td>
                <td class="mono">{{ row.current_rating ?? '—' }}</td>
                <td class="mono">{{ row.seasonal_points ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table></div>
      }
    </main></div>
  `,
})
export class SeasonLeaderboardComponent extends OnlinePage {
  private readonly api = inject(SeasonApiService);
  readonly rows = signal<CompetitiveRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly formatRank = formatRank;
  constructor() {
    super();
    this.load();
  }
  load(): void {
    this.loading.set(true);
    this.api.leaderboard().subscribe({
      next: (value) => {
        this.rows.set(asArray(value, 'data'));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load season leaderboard.');
        this.loading.set(false);
      },
    });
  }
  goFly(): void {
    void this.router.navigateByUrl('/');
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvCardComponent, FpvBadgeComponent, FpvProgressComponent, FpvEmptyStateComponent, FpvSkeletonComponent, FpvButtonDirective],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Season" title="Missions" support="Seasonal missions are online progression. Local flying always remains available.">
        <a actions routerLink="/season" fpvButton variant="ghost" size="sm">Overview</a>
      </fpv-page-header>
      @if (loading()) { <div class="grid"><fpv-skeleton variant="card" /><fpv-skeleton variant="card" /></div> }
      @else if (!missions().length) {
        <fpv-empty-state title="No mission" body="New seasonal missions will appear here." icon="season" />
      } @else {
        <div class="grid">
          @for (m of missions(); track m.id ?? m.key) {
            <fpv-card>
              <div class="row">
                <h2 class="title">{{ m.title || m.key }}</h2>
                @if (m.completed_at || m.progress?.[0]?.completed_at) { <fpv-badge tone="success">Completed</fpv-badge> }
              </div>
              <p class="muted">{{ m.description || 'Season mission' }}</p>
              <fpv-progress [value]="progressPct(m)" [label]="m.title || 'Mission progress'" />
              <dl class="meta">
                <div><dt class="muted">Target</dt><dd class="mono">{{ progressValue(m) }} / {{ m.target_value ?? '—' }}</dd></div>
                <div><dt class="muted">Reward</dt><dd class="mono">{{ m.reward_season_points ?? 0 }} pts · {{ m.reward_xp ?? 0 }} XP</dd></div>
              </dl>
            </fpv-card>
          }
        </div>
      }
    </main></div>
  `,
})
export class SeasonMissionsComponent {
  private readonly api = inject(MissionApiService);
  readonly missions = signal<CompetitiveRow[]>([]);
  readonly loading = signal(true);
  constructor() {
    this.api.list().subscribe({
      next: (value) => {
        this.missions.set(asArray(value, 'missions'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
  progressValue(m: CompetitiveRow): number {
    return m.progress?.[0]?.progress_value ?? m.progress_value ?? 0;
  }
  progressPct(m: CompetitiveRow): number {
    const target = Number(m.target_value ?? 0);
    if (!target) return 0;
    return Math.min(100, Math.round((this.progressValue(m) / target) * 100));
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvEmptyStateComponent, FpvSkeletonComponent, FpvBadgeComponent, FpvButtonDirective],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Season" title="Rewards" support="Earn cosmetics and titles through play — no paid track.">
        <a actions routerLink="/season" fpvButton variant="ghost" size="sm">Overview</a>
      </fpv-page-header>
      @if (loading()) { <fpv-skeleton variant="row" /> }
      @else if (!rewards().length) {
        <fpv-empty-state title="No rewards yet" body="Season rewards unlock as you complete ranked goals and missions." icon="trophy" />
      } @else {
        <div class="reward-path" role="list">
          @for (r of rewards(); track r.id ?? r.reward_key) {
            <div class="reward-node reward-node--earned" role="listitem">
              <fpv-badge tone="success">Earned</fpv-badge>
              <p class="title">{{ r.reward_key || 'Reward' }}</p>
              <p class="muted">{{ formatDate(r.granted_at) }}</p>
            </div>
          }
        </div>
      }
    </main></div>
  `,
})
export class SeasonRewardsComponent {
  private readonly api = inject(SeasonApiService);
  readonly rewards = signal<CompetitiveRow[]>([]);
  readonly loading = signal(true);
  readonly formatDate = formatDate;
  constructor() {
    this.api.rewards().subscribe({
      next: (value) => {
        this.rewards.set(asArray(value, 'rewards'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvEmptyStateComponent, FpvSkeletonComponent, FpvBadgeComponent, FpvButtonDirective],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Season" title="History" support="Previous seasons and final placements.">
        <a actions routerLink="/season" fpvButton variant="ghost" size="sm">Overview</a>
      </fpv-page-header>
      @if (loading()) { <fpv-skeleton variant="row" /> }
      @else if (!seasons().length) {
        <fpv-empty-state title="No season history" body="Completed seasons will appear here." icon="season" />
      } @else {
        <ul class="list">
          @for (s of seasons(); track s.id ?? s.slug) {
            <li>
              <div class="row"><strong>{{ s.name }}</strong><fpv-badge>{{ s.status }}</fpv-badge></div>
              <p class="muted">{{ formatDate(s.starts_at) }} – {{ formatDate(s.ends_at) }}</p>
            </li>
          }
        </ul>
      }
    </main></div>
  `,
})
export class SeasonHistoryComponent {
  private readonly api = inject(SeasonApiService);
  readonly seasons = signal<CompetitiveRow[]>([]);
  readonly loading = signal(true);
  readonly formatDate = formatDate;
  constructor() {
    this.api.history().subscribe({
      next: (value) => {
        this.seasons.set(asArray(value, 'seasons'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvCardComponent, FpvBadgeComponent, FpvEmptyStateComponent, FpvSkeletonComponent, FpvButtonDirective],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Compete" title="Tournaments" support="Practice never needs sign-in. Ranked attempts are verified online.">
        <a actions routerLink="/compete" fpvButton variant="ghost" size="sm">Compete hub</a>
      </fpv-page-header>
      @if (loading()) { <div class="grid"><fpv-skeleton variant="card" /><fpv-skeleton variant="card" /></div> }
      @else if (!tournaments().length) {
        <fpv-empty-state title="No tournament" body="No tournaments are active right now." icon="tournament" />
      } @else {
        @for (group of groups(); track group.label) {
          <h2 class="group-label">{{ group.label }}</h2>
          <div class="grid">
            @for (t of group.items; track t.slug) {
              <fpv-card [interactive]="true">
                <div class="row">
                  <h3 class="title">{{ t.name }}</h3>
                  <fpv-badge [tone]="t.status === 'active' ? 'success' : t.featured ? 'accent' : 'neutral'">{{ t.status }}</fpv-badge>
                </div>
                <dl class="meta">
                  <div><dt class="muted">Course</dt><dd>{{ t.course_id || '—' }}</dd></div>
                  <div><dt class="muted">Weather</dt><dd>{{ t.weather_preset_id || 'Fixed' }}</dd></div>
                  <div><dt class="muted">Attempts</dt><dd class="mono">{{ t.max_attempts ?? 'Open' }}</dd></div>
                  <div><dt class="muted">Remaining</dt><dd>{{ formatRemaining(t.ends_at) }}</dd></div>
                </dl>
                <a [routerLink]="['/tournaments', t.slug]" fpvButton variant="primary" size="sm">Open</a>
              </fpv-card>
            }
          </div>
        }
      }
    </main></div>
  `,
})
export class TournamentListComponent {
  private readonly api = inject(TournamentApiService);
  readonly tournaments = signal<CompetitiveRow[]>([]);
  readonly loading = signal(true);
  readonly formatRemaining = formatRemaining;
  readonly groups = computed(() => {
    const all = this.tournaments();
    const featured = all.filter((t) => t.featured);
    const live = all.filter((t) => t.status === 'active' && !t.featured);
    const upcoming = all.filter((t) => t.status === 'upcoming' || t.status === 'registration');
    const completed = all.filter((t) => t.status === 'completed' || t.status === 'archived');
    return [
      { label: 'Featured', items: featured },
      { label: 'Live', items: live },
      { label: 'Upcoming', items: upcoming },
      { label: 'Completed', items: completed },
    ].filter((g) => g.items.length);
  });
  constructor() {
    this.api.list().subscribe({
      next: (value) => {
        this.tournaments.set(asArray(value, 'tournaments'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvPanelComponent, FpvBadgeComponent, FpvStatComponent, FpvButtonDirective, FpvErrorStateComponent, FpvSkeletonComponent, FpvStatusBadgeComponent],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Tournament" [title]="name()" support="Deterministic course and weather. Practice freely; ranked attempts are verified.">
        <a actions routerLink="/tournaments" fpvButton variant="ghost" size="sm">All tournaments</a>
      </fpv-page-header>
      @if (loading()) { <fpv-skeleton variant="card" /> }
      @else {
        <fpv-panel>
          <div class="stack">
            <div class="row">
              <fpv-badge [tone]="status() === 'active' ? 'success' : 'neutral'">{{ status() }}</fpv-badge>
              <fpv-status-badge status="ranked" />
            </div>
            <dl class="meta">
              <fpv-stat label="Course" [value]="course()" />
              <fpv-stat label="Weather" [value]="weather()" />
              <fpv-stat label="Attempts" [value]="attempts()" />
              <fpv-stat label="Remaining" [value]="remaining()" />
            </dl>
            <p class="muted">Ranked attempts require an account and pass verification. Practice does not consume ranked attempt budget.</p>
            <div class="row">
              <button type="button" fpvButton variant="secondary" (click)="practice()">Practice</button>
              <button type="button" fpvButton variant="ranked" (click)="ranked()">Start Ranked Attempt</button>
            </div>
            @if (message()) { <fpv-error-state level="inline" [title]="message()" retryLabel="Sign in" (retry)="signIn()" [secondaryLabel]="''" /> }
          </div>
        </fpv-panel>
      }
    </main></div>
  `,
})
export class TournamentDetailComponent extends OnlinePage {
  private readonly api = inject(TournamentApiService);
  private readonly route = inject(ActivatedRoute);
  readonly tournament = signal<CompetitiveRow>({});
  readonly message = signal('');
  readonly loading = signal(true);
  readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  readonly name = computed(() => String(this.tournament()['name'] ?? 'Tournament'));
  readonly status = computed(() => String(this.tournament()['status'] ?? '—'));
  readonly course = computed(() => String(this.tournament()['course_id'] ?? '—'));
  readonly weather = computed(() => String(this.tournament()['weather_preset_id'] ?? 'Fixed'));
  readonly attempts = computed(() => String(this.tournament()['max_attempts'] ?? 'Open'));
  readonly remaining = computed(() => formatRemaining(this.tournament()['ends_at'] as string | null));
  constructor() {
    super();
    this.api.get(this.slug).subscribe({
      next: (value) => {
        const t = (value as { tournament?: CompetitiveRow })?.tournament ?? (value as CompetitiveRow);
        this.tournament.set(t ?? {});
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
  practice(): void {
    this.api.attempt(this.slug, 'practice').subscribe({ next: () => this.offline(), error: () => this.offline() });
  }
  ranked(): void {
    if (!this.auth.isAuthenticated()) {
      this.message.set('Sign in to start a ranked attempt. Practice remains available.');
      return;
    }
    this.api.attempt(this.slug, 'ranked').subscribe({
      error: () => this.message.set('Could not start ranked attempt.'),
    });
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvCardComponent, FpvBadgeComponent, FpvEmptyStateComponent, FpvSkeletonComponent, FpvButtonDirective],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Compete" title="Ghost Events" support="Race selected ghosts in practice, or submit a verified ranked attempt online.">
        <a actions routerLink="/compete" fpvButton variant="ghost" size="sm">Compete hub</a>
      </fpv-page-header>
      @if (loading()) { <div class="grid"><fpv-skeleton variant="card" /></div> }
      @else if (!events().length) {
        <fpv-empty-state title="No Ghost Event" body="No Ghost Events are scheduled right now." icon="ghost" />
      } @else {
        <div class="grid">
          @for (e of events(); track e.slug) {
            <fpv-card>
              <div class="row"><h3 class="title">{{ e.name }}</h3><fpv-badge tone="ghost">{{ e.benchmark_type || 'Benchmark' }}</fpv-badge></div>
              <p class="muted">{{ e.description || 'Ghost Event' }}</p>
              <dl class="meta">
                <div><dt class="muted">Course</dt><dd>{{ e.course_id || '—' }}</dd></div>
                <div><dt class="muted">Remaining</dt><dd>{{ formatRemaining(e.ends_at) }}</dd></div>
              </dl>
              <a [routerLink]="['/ghost-events', e.slug]" fpvButton variant="primary" size="sm">Open</a>
            </fpv-card>
          }
        </div>
      }
    </main></div>
  `,
})
export class GhostEventListComponent {
  private readonly api = inject(GhostEventApiService);
  readonly events = signal<CompetitiveRow[]>([]);
  readonly loading = signal(true);
  readonly formatRemaining = formatRemaining;
  constructor() {
    this.api.list().subscribe({
      next: (value) => {
        this.events.set(asArray(value, 'events'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvPanelComponent, FpvBadgeComponent, FpvStatComponent, FpvButtonDirective, FpvErrorStateComponent, FpvSkeletonComponent],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Ghost Event" [title]="name()" support="Select compatible ghosts. Maximum visible ghosts are enforced.">
        <a actions routerLink="/ghost-events" fpvButton variant="ghost" size="sm">All events</a>
      </fpv-page-header>
      @if (loading()) { <fpv-skeleton variant="card" /> }
      @else {
        <fpv-panel>
          <div class="stack">
            <div class="row">
              <fpv-badge tone="ghost">{{ benchmarkType() }}</fpv-badge>
              <span class="muted">Max ghosts: {{ maxGhosts() }}</span>
            </div>
            <dl class="meta">
              <fpv-stat label="Benchmark" [value]="benchmarkTime()" />
              <fpv-stat label="Course" [value]="course()" />
              <fpv-stat label="Environment" [value]="environment()" />
              <fpv-stat label="Weather" [value]="weather()" />
              <fpv-stat label="Attempts" [value]="attempts()" />
            </dl>
            <h3 class="title">Ghost selector</h3>
            @for (g of ghosts(); track g.id) {
              <label class="ghost-option">
                <input type="checkbox" [checked]="isSelected(g)" (change)="toggleGhost(g)" [disabled]="!isSelected(g) && selected().length >= maxGhosts()" />
                <span>
                  <strong>{{ g.label || g.slot || 'Ghost' }}</strong>
                  <span class="mono"> · {{ formatRaceTimeMs(g.duration_ms) }}</span>
                </span>
              </label>
            }
            <p class="muted">Selected {{ selected().length }} / {{ maxGhosts() }}. Compatibility issues are shown before launch.</p>
            <div class="row">
              <button type="button" fpvButton variant="secondary" (click)="start(false)">Practice</button>
              <button type="button" fpvButton variant="ranked" (click)="start(true)">Start Ranked Attempt</button>
            </div>
            @if (message()) {
              <fpv-error-state level="card" [title]="message()" retryLabel="Sign in" (retry)="signIn()" />
            }
          </div>
        </fpv-panel>
      }
    </main></div>
  `,
})
export class GhostEventDetailComponent extends OnlinePage {
  private readonly api = inject(GhostEventApiService);
  private readonly route = inject(ActivatedRoute);
  readonly event = signal<CompetitiveRow>({});
  readonly message = signal('');
  readonly loading = signal(true);
  readonly selected = signal<string[]>([]);
  readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  readonly formatRaceTimeMs = formatRaceTimeMs;
  readonly name = computed(() => this.event().name ?? 'Ghost Event');
  readonly benchmarkType = computed(() => this.event().benchmark_type ?? 'Benchmark');
  readonly course = computed(() => this.event().course_id ?? '—');
  readonly environment = computed(() => this.event().environment_id ?? '—');
  readonly weather = computed(() => this.event().weather_preset_id ?? 'Fixed');
  readonly attempts = computed(() => String(this.event().max_attempts ?? 'Open'));
  readonly maxGhosts = computed(() => Number(this.event().max_visible_ghosts ?? 4));
  readonly ghosts = computed(() => asArray<CompetitiveRow>(this.event().benchmarks));
  readonly benchmarkTime = computed(() => {
    const first = this.ghosts()[0];
    return first ? formatRaceTimeMs(first.duration_ms) : '—';
  });
  constructor() {
    super();
    this.api.get(this.slug).subscribe({
      next: (value) => {
        const e = (value as { event?: CompetitiveRow })?.event ?? (value as CompetitiveRow);
        this.event.set(e ?? {});
        const ids = asArray<CompetitiveRow>(e?.benchmarks)
          .slice(0, 2)
          .map((b) => String(b.id ?? ''))
          .filter((id) => id.length > 0);
        this.selected.set(ids);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
  ghostId(g: CompetitiveRow): string {
    return String(g.id ?? '');
  }
  isSelected(g: CompetitiveRow): boolean {
    const id = this.ghostId(g);
    return id.length > 0 && this.selected().includes(id);
  }
  toggleGhost(g: CompetitiveRow): void {
    const id = this.ghostId(g);
    if (!id) {
      return;
    }
    const cur = this.selected();
    if (cur.includes(id)) {
      this.selected.set(cur.filter((x) => x !== id));
      return;
    }
    if (cur.length >= this.maxGhosts()) {
      return;
    }
    this.selected.set([...cur, id]);
  }
  start(ranked: boolean): void {
    if (ranked && !this.auth.isAuthenticated()) {
      this.message.set('Sign in for ranked attempts; practice is always available.');
      return;
    }
    this.api.start(this.slug, ranked, this.selected()).subscribe({
      next: () => this.offline(),
      error: () => this.message.set('Could not start this event.'),
    });
  }
}

@Component({
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvCardComponent, FpvBadgeComponent, FpvEmptyStateComponent, FpvSkeletonComponent, FpvButtonDirective, FpvTabsComponent],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Pilot" title="Locker" support="Cosmetics change appearance only — never flight performance." />
      <fpv-tabs [tabs]="categories" [activeId]="category()" (activeIdChange)="category.set($event)" ariaLabel="Cosmetic categories" />
      <div class="grid" style="grid-template-columns: minmax(200px, 280px) 1fr; align-items: start;">
        <div class="preview" aria-live="polite">{{ equippedLabel() || 'Select an item' }}</div>
        <div class="stack">
          @if (loading()) { <div class="grid"><fpv-skeleton variant="card" /><fpv-skeleton variant="card" /></div> }
          @else if (!filtered().length) {
            <fpv-empty-state title="No items" body="Unlock cosmetics through seasons, missions, and events." icon="locker" />
          } @else {
            <div class="grid">
              @for (item of filtered(); track item.key ?? item.id) {
                <fpv-card [selected]="isEquipped(item)" [interactive]="true">
                  <div class="row">
                    <h3 class="title">{{ item.name || item.key }}</h3>
                    @if (isEquipped(item)) { <fpv-badge tone="accent">Equipped</fpv-badge> }
                    @else if (item.default_owned || item.owned) { <fpv-badge tone="success">Owned</fpv-badge> }
                    @else { <fpv-badge>Locked</fpv-badge> }
                  </div>
                  <p class="muted">{{ item.description || item.category || 'Cosmetic' }}</p>
                  @if (item.default_owned || item.owned) {
                    <button type="button" fpvButton variant="secondary" size="sm" (click)="equip(item)">Equip</button>
                  }
                </fpv-card>
              }
            </div>
          }
        </div>
      </div>
    </main></div>
  `,
})
export class LockerComponent {
  private readonly api = inject(CosmeticApiService);
  readonly items = signal<CompetitiveRow[]>([]);
  readonly loadout = signal<CompetitiveRow[]>([]);
  readonly loading = signal(true);
  readonly category = signal('drone');
  readonly categories: FpvTabItem[] = [
    { id: 'drone', label: 'Drone' },
    { id: 'ghost', label: 'Ghost' },
    { id: 'hud', label: 'HUD' },
    { id: 'titles', label: 'Titles' },
    { id: 'badges', label: 'Badges' },
  ];
  readonly filtered = computed(() => {
    const cat = this.category();
    const map: Record<string, string[]> = {
      drone: ['frame', 'prop', 'drone'],
      ghost: ['ghost', 'trail'],
      hud: ['hud'],
      titles: ['title', 'titles'],
      badges: ['badge', 'badges'],
    };
    const keys = map[cat] ?? [cat];
    return this.items().filter((i) => keys.includes(String(i.category || '').toLowerCase()) || !i.category);
  });
  constructor() {
    this.api.catalog().subscribe({
      next: (value) => {
        const payload = value as { cosmetics?: unknown[]; loadout?: unknown[] };
        this.items.set(asArray(payload?.cosmetics ?? value, 'cosmetics'));
        this.loadout.set(asArray(payload?.loadout, 'loadout'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
  isEquipped(item: CompetitiveRow): boolean {
    return this.loadout().some((l) => l.cosmetic_key === item.key || l.key === item.key);
  }
  equippedLabel(): string {
    const first = this.loadout()[0];
    return first ? String(first.cosmetic_key || first.key || '') : '';
  }
  equip(item: CompetitiveRow): void {
    const payload: LoadoutPayload = {};
    const cat = String(item.category || 'frame');
    if (cat === 'frame') payload.frame = item.key;
    else if (cat === 'prop') payload.prop = item.key;
    else payload.trail = item.key;
    this.api.equip(payload).subscribe({
      next: () => {
        this.loadout.update((rows) => {
          const next = rows.filter((r) => r.category !== cat);
          return [...next, { category: cat, cosmetic_key: item.key }];
        });
      },
    });
  }
}

@Component({
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective, FpvSkeletonComponent],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Pilot" title="Customize Pilot" support="Update your equipped cosmetics." />
      <fpv-panel>
        @if (loading()) { <fpv-skeleton variant="row" /> }
        @else {
          <dl class="meta">
            @for (row of rows(); track row.category) {
              <div><dt class="muted">{{ row.category }}</dt><dd class="mono">{{ row.cosmetic_key || '—' }}</dd></div>
            }
          </dl>
          <button type="button" fpvButton variant="primary" (click)="save()">Save loadout</button>
          @if (message()) { <p class="muted">{{ message() }}</p> }
        }
      </fpv-panel>
    </main></div>
  `,
})
export class ProfileCustomizeComponent extends OnlinePage {
  private readonly api = inject(CosmeticApiService);
  readonly loadout = signal<unknown>({});
  readonly rows = signal<CompetitiveRow[]>([]);
  readonly message = signal('');
  readonly loading = signal(true);
  constructor() {
    super();
    this.api.loadout().subscribe({
      next: (value) => {
        this.loadout.set(value);
        this.rows.set(asArray(value, 'loadout'));
        this.loading.set(false);
      },
      error: () => {
        this.api.catalog().subscribe({
          next: (value) => {
            const payload = value as { loadout?: unknown[] };
            this.rows.set(asArray(payload?.loadout, 'loadout'));
            this.loadout.set(payload);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
    });
  }
  save(): void {
    const previous = this.loadout();
    this.api.equip(previous as LoadoutPayload).subscribe({
      error: () => {
        this.loadout.set(previous);
        this.message.set('Could not save loadout; your previous selection was restored.');
      },
    });
  }
}

@Component({
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvEmptyStateComponent, FpvButtonDirective, FpvBadgeComponent],
  styles: [PAGE],
  template: `
    <div class="fpv-page-bg"><main class="online-page stack">
      <fpv-page-header eyebrow="Inbox" title="Notifications" support="Competitive updates, rewards, and account alerts.">
        <button actions type="button" fpvButton variant="ghost" size="sm" (click)="markAll()">Mark all read</button>
      </fpv-page-header>
      @if (!grouped().today.length && !grouped().earlier.length && !grouped().older.length) {
        <fpv-empty-state title="You’re all caught up" body="No notifications right now." icon="notification" />
      } @else {
        @for (group of groupList(); track group.label) {
          <h2 class="group-label">{{ group.label }}</h2>
          @for (item of group.items; track item.id) {
            <article class="notif" [class.notif--unread]="!item.readAt">
              <div class="row">
                <strong>{{ item.title }}</strong>
                @if (!item.readAt) { <fpv-badge tone="accent">Unread</fpv-badge> }
              </div>
              <p class="muted">{{ item.body }}</p>
              <p class="notif__time">{{ formatRelativeTime(item.createdAt) }}</p>
              @if (!item.readAt) {
                <button type="button" fpvButton variant="ghost" size="sm" (click)="read(item.id)">Mark read</button>
              }
            </article>
          }
        }
      }
    </main></div>
  `,
})
export class NotificationsCenterComponent {
  readonly notifications = inject(NotificationApiService);
  readonly formatRelativeTime = formatRelativeTime;
  constructor() {
    this.notifications.fetch().subscribe();
  }
  readonly grouped = computed(() => {
    const now = Date.now();
    const day = 86400_000;
    const items = this.notifications.notifications();
    const today = [];
    const earlier = [];
    const older = [];
    for (const item of items) {
      const ts = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      const age = now - ts;
      if (age < day) today.push(item);
      else if (age < day * 7) earlier.push(item);
      else older.push(item);
    }
    return { today, earlier, older };
  });
  readonly groupList = computed(() => {
    const g = this.grouped();
    return [
      { label: 'Today', items: g.today },
      { label: 'Earlier', items: g.earlier },
      { label: 'Older', items: g.older },
    ].filter((x) => x.items.length);
  });
  read(id: string): void {
    this.notifications.markRead(id).subscribe();
  }
  markAll(): void {
    for (const item of this.notifications.notifications()) {
      if (!item.readAt) {
        this.notifications.markRead(item.id).subscribe();
      }
    }
  }
}
