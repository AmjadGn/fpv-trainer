import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FpvIconComponent } from './fpv-icon.component';
import { FpvButtonDirective } from './fpv-button.directive';
import type { FpvIconName } from '../icons/fpv-icons';

@Component({
  selector: 'fpv-empty-state',
  standalone: true,
  imports: [FpvIconComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" role="status">
      @if (icon) {
        <fpv-icon class="empty__icon" [name]="icon" [size]="28" />
      }
      <h3 class="empty__title">{{ title }}</h3>
      @if (body) {
        <p class="empty__body">{{ body }}</p>
      }
      @if (actionLabel) {
        <button type="button" fpvButton variant="primary" size="sm" (click)="action.emit()">
          {{ actionLabel }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .empty {
        display: grid;
        justify-items: start;
        gap: var(--fpv-space-8);
        padding: var(--fpv-space-24);
        border: 1px dashed var(--fpv-border);
        border-radius: var(--fpv-radius-lg);
        background: color-mix(in srgb, var(--fpv-surface) 50%, transparent);
      }
      .empty__icon {
        color: var(--fpv-text-muted);
      }
      .empty__title {
        margin: 0;
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-h3);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .empty__body {
        margin: 0;
        color: var(--fpv-text-muted);
        font-size: var(--fpv-text-body-sm);
        max-width: 28rem;
      }
    `,
  ],
})
export class FpvEmptyStateComponent {
  @Input({ required: true }) title!: string;
  @Input() body = '';
  @Input() icon: FpvIconName | null = null;
  @Input() actionLabel = '';
  @Output() readonly action = new EventEmitter<void>();
}
