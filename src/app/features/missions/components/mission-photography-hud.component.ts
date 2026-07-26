import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  formatMissionDuration,
  missionPhotoComponentLabel,
  missionPhotoFeedbackText,
} from '../mission-photo-feedback.map';

/** One scored component of the most recent capture, as presentation data. */
export interface MissionPhotoComponentScore {
  readonly componentId: string;
  readonly rawScore: number;
  readonly maxScore: number;
}

/**
 * In-flight photography HUD.
 *
 * Presentation only: every value arrives as an input and the shutter is an
 * output. This component never scores a capture, builds evidence, or decides
 * whether an objective is complete.
 */
@Component({
  selector: 'app-mission-photography-hud',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="mission-hud" aria-label="Photography mission" data-testid="mission-photography-hud">
      <h2 class="mission-hud__title">{{ missionTitle() ?? 'Expedition' }}</h2>

      <p class="mission-hud__objective">
        <span class="mission-hud__step">{{ objectiveLabel() }}</span>
        <span class="mission-hud__name">{{ objectiveTitle() ?? 'Photography objective' }}</span>
      </p>

      @if (subjectName(); as subject) {
        <p class="mission-hud__subject">Target · {{ subject }}</p>
      }

      <dl class="mission-hud__stats">
        <div>
          <dt>Elapsed</dt>
          <dd>{{ elapsedLabel() }}</dd>
        </div>
        <div>
          <dt>Attempt</dt>
          <dd>{{ attemptNumber() }}</dd>
        </div>
      </dl>

      <button
        type="button"
        class="mission-hud__shutter"
        [disabled]="!captureEnabled() || capturePending()"
        (click)="captureRequested.emit()"
        data-testid="mission-shutter"
      >
        {{ capturePending() ? 'Capturing…' : 'Shutter' }}
        <span class="mission-hud__key" aria-hidden="true">V</span>
      </button>

      @if (capturePending()) {
        <p class="mission-hud__pending" role="status">Capture queued for the next step</p>
      } @else if (!captureEnabled()) {
        <p class="mission-hud__pending">Shutter needs FPV camera and a live objective</p>
      }

      @if (objectiveAccepted()) {
        <p class="mission-hud__accepted" role="status" data-testid="mission-objective-accepted">
          Objective accepted
        </p>
      }

      @if (feedbackMessages().length > 0) {
        <ul class="mission-hud__feedback" aria-live="polite">
          @for (message of feedbackMessages(); track message) {
            <li>{{ message }}</li>
          }
        </ul>
      }

      @if (breakdown().length > 0) {
        <div class="mission-hud__breakdown">
          <p class="mission-hud__breakdown-head">
            Last shot
            @if (lastScore() !== null) {
              <span>{{ lastScore() }} / {{ lastMaxScore() }}</span>
            }
          </p>
          <ul>
            @for (entry of breakdown(); track entry.componentId) {
              <li>
                <span>{{ label(entry.componentId) }}</span>
                <span>{{ entry.rawScore }}/{{ entry.maxScore }}</span>
              </li>
            }
          </ul>
        </div>
      }

      @if (boundaryWarning()) {
        <p class="mission-hud__alert" role="alert">
          Out of bounds — return in {{ boundaryRemainingLabel() }}s
        </p>
      }

      @if (infrastructureNotice(); as notice) {
        <p class="mission-hud__notice" role="alert" data-testid="mission-hud-notice">{{ notice }}</p>
      }
    </aside>
  `,
  styles: [
    `
      .mission-hud {
        position: absolute;
        right: 0.85rem;
        top: 0.85rem;
        z-index: 4;
        width: min(230px, 26vw);
        padding: 0.8rem 0.85rem 0.9rem;
        border: 1px solid rgba(120, 190, 210, 0.18);
        border-radius: 0.85rem;
        background: rgba(8, 14, 20, 0.62);
        backdrop-filter: blur(14px) saturate(1.15);
        -webkit-backdrop-filter: blur(14px) saturate(1.15);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.38);
        color: var(--fpv-text, #e6eef2);
        font-size: 0.78rem;
      }
      .mission-hud__title {
        margin: 0 0 0.5rem;
        font-family: var(--fpv-font-display);
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--fpv-accent, #2ec4b6) 80%, #fff);
      }
      .mission-hud__objective {
        margin: 0 0 0.35rem;
        display: grid;
        gap: 0.1rem;
      }
      .mission-hud__step {
        font-size: 0.66rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--fpv-muted, #8fa3ad);
      }
      .mission-hud__name {
        font-weight: 600;
      }
      .mission-hud__subject {
        margin: 0 0 0.6rem;
        color: var(--fpv-muted, #8fa3ad);
      }
      .mission-hud__stats {
        display: flex;
        gap: 1rem;
        margin: 0 0 0.7rem;
      }
      .mission-hud__stats dt {
        font-size: 0.62rem;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--fpv-muted, #8fa3ad);
      }
      .mission-hud__stats dd {
        margin: 0;
        font-family: var(--fpv-font-mono, ui-monospace, monospace);
        font-variant-numeric: tabular-nums;
      }
      .mission-hud__shutter {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.5rem 0.6rem;
        border-radius: 0.55rem;
        border: 1px solid color-mix(in srgb, var(--fpv-accent, #2ec4b6) 55%, transparent);
        background: color-mix(in srgb, var(--fpv-accent, #2ec4b6) 22%, transparent);
        color: #eafcf9;
        font: inherit;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .mission-hud__shutter:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .mission-hud__key {
        padding: 0.05rem 0.3rem;
        border-radius: 0.25rem;
        border: 1px solid rgba(255, 255, 255, 0.25);
        font-size: 0.62rem;
      }
      .mission-hud__pending,
      .mission-hud__accepted,
      .mission-hud__alert,
      .mission-hud__notice {
        margin: 0.5rem 0 0;
        font-size: 0.72rem;
      }
      .mission-hud__pending {
        color: var(--fpv-muted, #8fa3ad);
      }
      .mission-hud__accepted {
        color: #7dffb3;
        font-weight: 600;
      }
      .mission-hud__alert {
        color: #ffe6a8;
        font-weight: 600;
      }
      .mission-hud__notice {
        color: #ffb4b4;
      }
      .mission-hud__feedback {
        margin: 0.55rem 0 0;
        padding-left: 1rem;
        display: grid;
        gap: 0.15rem;
      }
      .mission-hud__breakdown {
        margin-top: 0.65rem;
        padding-top: 0.5rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .mission-hud__breakdown-head {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        margin: 0 0 0.3rem;
        font-size: 0.66rem;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--fpv-muted, #8fa3ad);
      }
      .mission-hud__breakdown ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 0.1rem;
      }
      .mission-hud__breakdown li {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        font-family: var(--fpv-font-mono, ui-monospace, monospace);
        font-variant-numeric: tabular-nums;
        font-size: 0.72rem;
      }
    `,
  ],
})
export class MissionPhotographyHudComponent {
  readonly missionTitle = input<string | null>(null);
  readonly objectiveTitle = input<string | null>(null);
  /** 1-based position of the active objective; 0 when none is active. */
  readonly objectiveNumber = input(0);
  readonly objectiveCount = input(0);
  readonly subjectName = input<string | null>(null);
  readonly attemptNumber = input(1);
  readonly capturePending = input(false);
  /** Whether the runtime currently accepts a shutter press. */
  readonly captureEnabled = input(false);
  readonly objectiveAccepted = input(false);
  readonly feedbackCodes = input<readonly string[]>([]);
  readonly componentScores = input<readonly MissionPhotoComponentScore[]>([]);
  readonly lastScore = input<number | null>(null);
  readonly lastMaxScore = input<number | null>(null);
  readonly elapsedSeconds = input(0);
  readonly boundaryWarning = input(false);
  readonly boundaryRemainingSeconds = input(0);
  /** Runtime/infrastructure failure surfaced to the pilot (capture unavailable, etc.). */
  readonly infrastructureNotice = input<string | null>(null);

  readonly captureRequested = output<void>();

  protected readonly objectiveLabel = computed(() => {
    const count = this.objectiveCount();
    const number = this.objectiveNumber();
    if (number <= 0 || count <= 0) {
      return 'Objective';
    }
    return `Objective ${number} of ${count}`;
  });

  protected readonly elapsedLabel = computed(() => formatMissionDuration(this.elapsedSeconds()));

  protected readonly boundaryRemainingLabel = computed(() =>
    Math.max(0, this.boundaryRemainingSeconds()).toFixed(1),
  );

  protected readonly feedbackMessages = computed(() =>
    this.feedbackCodes().map(missionPhotoFeedbackText),
  );

  /** Components with no points available add noise, so they are dropped. */
  protected readonly breakdown = computed(() =>
    this.componentScores().filter((entry) => entry.maxScore > 0),
  );

  protected label(componentId: string): string {
    return missionPhotoComponentLabel(componentId);
  }
}
