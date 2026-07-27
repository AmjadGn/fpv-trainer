import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { MissionResultsViewModel } from '../../../core/mission/services/mission-results.facade';
import {
  formatMissionDuration,
  missionFailureReasonText,
  missionPhotoFeedbackText,
} from '../mission-photo-feedback.map';

/**
 * Mission results overlay with durable persistence status.
 *
 * Presentation images are session object URLs owned and revoked by
 * `MissionResultsFacade`. Personal Best confirmation comes only from
 * persistence comparator outcomes.
 */
@Component({
  selector: 'app-mission-session-results',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="results-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-results-title"
      data-testid="mission-session-results"
    >
      <div class="results-card">
        <h2 class="results-card__title" id="mission-results-title">
          {{ completed() ? 'Mission Complete' : 'Mission Failed' }}
        </h2>
        <p class="results-card__mission">{{ viewModel().missionTitle ?? 'Expedition mission' }}</p>

        @if (failureText(); as failure) {
          <p class="results-card__failure">{{ failure }}</p>
        }

        <dl class="results-card__stats">
          <div>
            <dt>Score</dt>
            <dd>{{ finalScore() }} / {{ maxScore() }}</dd>
          </div>
          <div>
            <dt>Normalized</dt>
            <dd>{{ normalizedLabel() }}</dd>
          </div>
          @if (viewModel().showTimeBonus) {
            <div>
              <dt>Time bonus</dt>
              <dd>{{ viewModel().timeBonusPoints }}</dd>
            </div>
          }
          <div>
            <dt>Duration</dt>
            <dd>{{ durationLabel() }} · {{ viewModel().elapsedTicks }} ticks</dd>
          </div>
        </dl>

        @if (viewModel().showObjectiveBreakdown) {
          <ul class="results-objectives">
            @for (objective of viewModel().objectives; track objective.objectiveId) {
              <li class="results-objective" [attr.data-status]="objective.status">
                @if (objective.presentationImageUrl; as url) {
                  <img class="results-objective__shot" [src]="url" alt="" />
                } @else {
                  <span class="results-objective__shot results-objective__shot--empty" aria-hidden="true">
                    No shot
                  </span>
                }
                <div class="results-objective__body">
                  <p class="results-objective__name">
                    {{ objective.displayName ?? objective.objectiveId }}
                  </p>
                  <p class="results-objective__meta">
                    {{ objective.scorePoints }} / {{ objective.maxPoints }} ·
                    {{ objective.status }} · {{ objective.attemptCount }} attempts
                  </p>
                  @if (objective.feedbackCodes.length > 0) {
                    <p class="results-objective__feedback">{{ feedbackText(objective.feedbackCodes) }}</p>
                  }
                </div>
              </li>
            }
          </ul>
        }

        @if (viewModel().customResultsNote; as note) {
          <p class="results-card__note">{{ note }}</p>
        }
        @if (viewModel().isNewPersonalBest) {
          <p class="results-card__best" data-testid="new-personal-best">New Personal Best</p>
        }
        @if (persistenceLabel(); as persistence) {
          <p
            class="results-card__session"
            data-testid="persistence-status"
            [attr.data-status]="viewModel().persistenceStatus"
          >
            {{ persistence }}
          </p>
        }

        <div class="results-card__actions">
          <button type="button" class="results-btn results-btn--primary" (click)="retryRequested.emit()">
            Retry mission
          </button>
          <button type="button" class="results-btn" (click)="returnRequested.emit()">
            Return to Expeditions
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .results-overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        z-index: var(--fpv-z-modal, 500);
        background: rgba(4, 8, 12, 0.62);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        color: var(--fpv-text, #e6eef2);
      }
      .results-card {
        width: min(30rem, 92vw);
        max-height: 86%;
        overflow: auto;
        padding: 1.3rem 1.4rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(120, 190, 210, 0.22);
        background: rgba(10, 16, 22, 0.95);
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);
      }
      .results-card__title {
        margin: 0;
        font-family: var(--fpv-font-display);
        font-size: 1.5rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--fpv-accent, #2ec4b6);
      }
      .results-card__mission {
        margin: 0.2rem 0 0.9rem;
        color: var(--fpv-muted, #8fa3ad);
      }
      .results-card__failure {
        margin: 0 0 0.9rem;
        color: #ffb4b4;
        font-weight: 600;
      }
      .results-card__stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem 1rem;
        margin: 0 0 1rem;
      }
      .results-card__stats dt {
        font-size: 0.66rem;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--fpv-muted, #8fa3ad);
      }
      .results-card__stats dd {
        margin: 0;
        font-family: var(--fpv-font-mono, ui-monospace, monospace);
        font-variant-numeric: tabular-nums;
      }
      .results-objectives {
        margin: 0 0 1rem;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 0.6rem;
      }
      .results-objective {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        padding-top: 0.6rem;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .results-objective__shot {
        width: 96px;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border-radius: 0.35rem;
        border: 1px solid rgba(255, 255, 255, 0.14);
        flex: none;
      }
      .results-objective__shot--empty {
        display: grid;
        place-items: center;
        font-size: 0.65rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--fpv-muted, #8fa3ad);
        background: rgba(255, 255, 255, 0.04);
      }
      .results-objective__name {
        margin: 0 0 0.15rem;
        font-weight: 600;
      }
      .results-objective__meta,
      .results-objective__feedback {
        margin: 0;
        font-size: 0.75rem;
        color: var(--fpv-muted, #8fa3ad);
      }
      .results-objective[data-status='completed'] .results-objective__name {
        color: #7dffb3;
      }
      .results-card__note,
      .results-card__session {
        margin: 0 0 0.5rem;
        font-size: 0.78rem;
        color: var(--fpv-muted, #8fa3ad);
      }
      .results-card__best {
        margin: 0 0 0.5rem;
        font-size: 0.9rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #7dffb3;
      }
      .results-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.9rem;
      }
      .results-btn {
        flex: 1 1 auto;
        padding: 0.55rem 0.9rem;
        border-radius: 0.5rem;
        border: 1px solid var(--fpv-border, rgba(120, 190, 210, 0.25));
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .results-btn--primary {
        border-color: color-mix(in srgb, var(--fpv-accent, #2ec4b6) 55%, transparent);
        background: color-mix(in srgb, var(--fpv-accent, #2ec4b6) 22%, transparent);
        color: #eafcf9;
      }
    `,
  ],
})
export class MissionSessionResultsComponent {
  readonly viewModel = input.required<MissionResultsViewModel>();

  readonly retryRequested = output<void>();
  readonly returnRequested = output<void>();

  protected readonly completed = computed(() => this.viewModel().status === 'completed');

  protected readonly failureText = computed(() =>
    missionFailureReasonText(this.viewModel().failureReasonCode),
  );

  protected readonly finalScore = computed(() => this.viewModel().score?.finalScore ?? 0);

  protected readonly maxScore = computed(() => this.viewModel().score?.maxScore ?? 0);

  protected readonly normalizedLabel = computed(() => {
    const max = this.maxScore();
    if (max <= 0) {
      return '—';
    }
    return `${Math.round((this.finalScore() / max) * 100)}%`;
  });

  protected readonly durationLabel = computed(() =>
    formatMissionDuration(this.viewModel().elapsedSeconds),
  );

  protected readonly persistenceLabel = computed(() => {
    const note = this.viewModel().persistenceNote;
    if (note) {
      return note;
    }
    switch (this.viewModel().persistenceStatus) {
      case 'saving':
        return 'Saving result…';
      case 'saved-new-personal-best':
        return 'New Personal Best';
      case 'saved-without-images':
        return 'Personal Best saved. Photo storage incomplete.';
      case 'memory-only':
        return 'Saved for this session only — durable storage is unavailable.';
      case 'attempt-saved':
        return 'Attempt saved';
      case 'saved':
        return 'Result saved';
      case 'save-failed':
        return 'Could not save this result.';
      default:
        return null;
    }
  });

  protected feedbackText(codes: readonly string[]): string {
    return codes.map(missionPhotoFeedbackText).join(' · ');
  }
}
