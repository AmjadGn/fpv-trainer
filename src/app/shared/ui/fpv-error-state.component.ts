import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FpvIconComponent } from './fpv-icon.component';
import { FpvButtonDirective } from './fpv-button.directive';

export type FpvErrorLevel = 'inline' | 'card' | 'section' | 'route' | 'flight';

@Component({
  selector: 'fpv-error-state',
  standalone: true,
  imports: [FpvIconComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error" [attr.data-level]="level" role="alert">
      <fpv-icon name="warning" [size]="22" label="Error" />
      <div class="error__copy">
        <h3 class="error__title">{{ title }}</h3>
        @if (body) {
          <p class="error__body">{{ body }}</p>
        }
        @if (code) {
          <p class="error__code">{{ code }}</p>
        }
      </div>
      <div class="error__actions">
        @if (retryLabel) {
          <button type="button" fpvButton variant="primary" size="sm" (click)="retry.emit()">
            {{ retryLabel }}
          </button>
        }
        @if (secondaryLabel) {
          <button type="button" fpvButton variant="ghost" size="sm" (click)="secondary.emit()">
            {{ secondaryLabel }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .error {
        display: grid;
        gap: var(--fpv-space-12);
        padding: var(--fpv-space-16);
        border: 1px solid color-mix(in srgb, var(--fpv-danger) 40%, transparent);
        border-radius: var(--fpv-radius-lg);
        background: color-mix(in srgb, var(--fpv-danger) 8%, var(--fpv-panel));
        color: var(--fpv-text);
      }
      .error[data-level='inline'] {
        padding: var(--fpv-space-8) 0;
        border: 0;
        background: transparent;
        color: var(--fpv-danger);
      }
      .error__title {
        margin: 0;
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-h3);
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .error__body {
        margin: var(--fpv-space-4) 0 0;
        color: var(--fpv-text-secondary);
        font-size: var(--fpv-text-body-sm);
      }
      .error__code {
        margin: var(--fpv-space-4) 0 0;
        color: var(--fpv-text-muted);
        font-family: var(--fpv-font-mono);
        font-size: var(--fpv-text-caption);
      }
      .error__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
      }
    `,
  ],
})
export class FpvErrorStateComponent {
  @Input({ required: true }) title!: string;
  @Input() body = '';
  @Input() code = '';
  @Input() level: FpvErrorLevel = 'section';
  @Input() retryLabel = 'Retry';
  @Input() secondaryLabel = '';
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly secondary = new EventEmitter<void>();
}
