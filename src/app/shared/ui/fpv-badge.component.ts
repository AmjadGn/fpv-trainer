import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type FpvBadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'ghost'
  | 'ranked'
  | 'offline';

@Component({
  selector: 'fpv-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-tone]="tone"><ng-content /></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: var(--fpv-space-4);
        padding: 0.15rem 0.45rem;
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-sm);
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-caption);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--fpv-text-muted);
        background: color-mix(in srgb, var(--fpv-surface) 60%, transparent);
        white-space: nowrap;
      }
      .badge[data-tone='accent'] {
        color: var(--fpv-accent);
        border-color: color-mix(in srgb, var(--fpv-accent) 40%, transparent);
        background: var(--fpv-accent-soft);
      }
      .badge[data-tone='success'] {
        color: var(--fpv-success);
        border-color: color-mix(in srgb, var(--fpv-success) 40%, transparent);
        background: color-mix(in srgb, var(--fpv-success) 12%, transparent);
      }
      .badge[data-tone='warning'],
      .badge[data-tone='ranked'] {
        color: var(--fpv-warning);
        border-color: color-mix(in srgb, var(--fpv-warning) 40%, transparent);
        background: color-mix(in srgb, var(--fpv-warning) 12%, transparent);
      }
      .badge[data-tone='danger'] {
        color: var(--fpv-danger);
        border-color: color-mix(in srgb, var(--fpv-danger) 40%, transparent);
        background: color-mix(in srgb, var(--fpv-danger) 12%, transparent);
      }
      .badge[data-tone='info'],
      .badge[data-tone='ghost'] {
        color: var(--fpv-info);
        border-color: color-mix(in srgb, var(--fpv-info) 40%, transparent);
        background: color-mix(in srgb, var(--fpv-info) 12%, transparent);
      }
      .badge[data-tone='offline'] {
        color: var(--fpv-offline);
        border-color: color-mix(in srgb, var(--fpv-offline) 40%, transparent);
        background: color-mix(in srgb, var(--fpv-offline) 12%, transparent);
      }
    `,
  ],
})
export class FpvBadgeComponent {
  @Input() tone: FpvBadgeTone = 'neutral';
}
