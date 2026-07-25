import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FpvBadgeComponent } from './fpv-badge.component';

@Component({
  selector: 'fpv-result-shell',
  standalone: true,
  imports: [FpvBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="result" aria-live="polite">
      <header class="result__header">
        @if (eyebrow) {
          <p class="fpv-eyebrow">{{ eyebrow }}</p>
        }
        <p class="result__primary">{{ primary }}</p>
        @if (secondary) {
          <p class="result__secondary">{{ secondary }}</p>
        }
        <div class="result__badges">
          @if (newBest) {
            <fpv-badge tone="accent">New Best</fpv-badge>
          }
          @if (verified) {
            <fpv-badge tone="success">Verified Result</fpv-badge>
          } @else if (pending) {
            <fpv-badge tone="warning">Pending</fpv-badge>
          } @else if (local) {
            <fpv-badge tone="neutral">Local Result</fpv-badge>
          }
          @if (rejected) {
            <fpv-badge tone="danger">Rejected</fpv-badge>
          }
        </div>
      </header>
      <div class="result__meta">
        <ng-content select="[meta]" />
      </div>
      <div class="result__actions">
        <ng-content select="[actions]" />
      </div>
    </section>
  `,
  styles: [
    `
      .result {
        display: grid;
        gap: var(--fpv-space-20);
        padding: var(--fpv-space-24);
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-xl);
        background: var(--fpv-panel);
        box-shadow: var(--fpv-shadow-panel);
      }
      .result__header {
        display: grid;
        gap: var(--fpv-space-8);
      }
      .result__primary {
        margin: 0;
        font-family: var(--fpv-font-mono);
        font-size: clamp(2rem, 6vw, 3rem);
        font-weight: 500;
        letter-spacing: 0.02em;
        color: var(--fpv-text);
        line-height: 1;
      }
      .result__secondary {
        margin: 0;
        color: var(--fpv-text-muted);
        font-size: var(--fpv-text-body-sm);
      }
      .result__badges {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
      }
      .result__meta {
        display: grid;
        gap: var(--fpv-space-12);
      }
      .result__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
      }
    `,
  ],
})
export class FpvResultShellComponent {
  @Input({ required: true }) primary!: string;
  @Input() secondary = '';
  @Input() eyebrow = 'Result';
  @Input() newBest = false;
  @Input() verified = false;
  @Input() pending = false;
  @Input() local = true;
  @Input() rejected = false;
}
