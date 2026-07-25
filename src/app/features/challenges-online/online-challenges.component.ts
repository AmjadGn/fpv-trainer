import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { NetworkStatusService } from '../../core/network/network-status.service';
import { ChallengeApiService } from '../../core/online/services/challenge-api.service';
import { AppShellService } from '../../core/shell/app-shell.service';

interface ChallengeCard {
  slug: string;
  title?: string;
  type?: string;
  courseId?: string;
  weatherPresetId?: string;
  endsAt?: string;
  environmentId?: string;
}

@Component({
  standalone: true,
  imports: [],
  selector: 'app-online-challenges',
  template: `
    <main class="online-page">
      <p class="eyebrow">Today &amp; weekly</p>
      <h1>Online challenges</h1>
      <p>
        Practice locally any time. Ranked attempts lock server weather and course settings
        and can appear on challenge leaderboards.
      </p>
      @if (error()) {
        <p class="error" role="status">{{ error() }}</p>
      }
      <section class="panel" aria-live="polite">
        <h2>Active challenges</h2>
        @if (loading()) {
          <p>Loading challenges…</p>
        } @else if (!cards().length) {
          <p class="muted">No active online challenges right now. Local weather challenges still work from the Challenges tab.</p>
        } @else {
          <ul class="cards">
            @for (card of cards(); track card.slug) {
              <li>
                <h3>{{ card.title || card.slug }}</h3>
                <p class="muted">{{ card.type || 'challenge' }} · {{ card.courseId }} · {{ card.weatherPresetId }}</p>
                @if (card.endsAt) {
                  <p class="muted">Ends {{ card.endsAt }}</p>
                }
                <div class="actions">
                  <button type="button" (click)="practice(card)">Practice Locally</button>
                  <button type="button" (click)="startRanked(card)">Start Ranked Attempt</button>
                  <button type="button" class="linkish" (click)="openLeaderboard(card.slug)">View Leaderboard</button>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .online-page { width: min(1000px, calc(100% - 2rem)); margin: 3rem auto; }
      .eyebrow { color: var(--fpv-accent); text-transform: uppercase; letter-spacing: 0.12em; }
      .panel { padding: 1.5rem; border: 1px solid var(--fpv-border); background: var(--fpv-panel); }
      .muted { color: var(--fpv-muted); }
      .error { color: var(--fpv-danger); }
      .cards { list-style: none; padding: 0; display: grid; gap: 1rem; }
      .cards li { border: 1px solid var(--fpv-border); padding: 1rem; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
      button { background: var(--fpv-accent); border: 0; color: #041014; padding: 0.55rem 0.85rem; font-weight: 700; cursor: pointer; }
      .linkish { background: transparent; color: var(--fpv-accent); border: 1px solid var(--fpv-border); }
    `,
  ],
})
export class OnlineChallengesComponent {
  private readonly api = inject(ChallengeApiService);
  private readonly shell = inject(AppShellService);
  private readonly auth = inject(AuthSessionService);
  private readonly network = inject(NetworkStatusService);
  private readonly router = inject(Router);

  readonly cards = signal<ChallengeCard[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.api.active().subscribe({
      next: (response) => {
        const raw = response as { challenges?: ChallengeCard[]; daily?: ChallengeCard; weekly?: ChallengeCard };
        const list = raw.challenges
          ?? [raw.daily, raw.weekly].filter((item): item is ChallengeCard => !!item?.slug);
        this.cards.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load online challenges. Local challenges remain available.');
        this.loading.set(false);
      },
    });
  }

  practice(card: ChallengeCard): void {
    if (!card.courseId) {
      return;
    }
    void this.router.navigateByUrl('/');
    this.shell.showFlight({
      kind: 'race',
      courseId: card.courseId,
      weatherPresetId: card.weatherPresetId,
      challengeId: card.slug,
    });
  }

  startRanked(card: ChallengeCard): void {
    this.error.set('');
    if (!this.auth.isAuthenticated()) {
      void this.router.navigateByUrl('/login');
      return;
    }
    if (!this.network.online()) {
      this.error.set('Ranked challenge attempts need a network connection.');
      return;
    }
    this.api.startSession(card.slug).subscribe({
      next: (session) => {
        void this.router.navigateByUrl('/');
        this.shell.showFlight({
          kind: 'race',
          courseId: session.courseId,
          weatherPresetId: session.weatherPresetId,
          challengeId: card.slug,
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
      error: () => this.error.set('Could not start a ranked challenge session.'),
    });
  }

  openLeaderboard(slug: string): void {
    void this.router.navigateByUrl(`/leaderboards/challenges/${slug}`);
  }
}
