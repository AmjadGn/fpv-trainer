import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FpvIconComponent } from './fpv-icon.component';

@Component({
  selector: 'fpv-card',
  standalone: true,
  imports: [FpvIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="card"
      [class.card--selected]="selected"
      [class.card--disabled]="disabled"
      [class.card--locked]="locked"
      [class.card--interactive]="interactive"
      [attr.aria-disabled]="disabled || locked ? 'true' : null"
      [attr.aria-selected]="selected || null"
    >
      @if (selected) {
        <span class="card__selected" aria-hidden="true">
          <fpv-icon name="check" [size]="14" />
          Selected
        </span>
      }
      <ng-content />
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .card {
        position: relative;
        display: grid;
        gap: var(--fpv-space-12);
        padding: var(--fpv-space-16);
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-lg);
        background: color-mix(in srgb, var(--fpv-panel) 92%, transparent);
        box-shadow: var(--fpv-shadow-subtle);
        transition:
          border-color var(--fpv-motion-fast) var(--fpv-ease-standard),
          box-shadow var(--fpv-motion-fast) var(--fpv-ease-standard),
          transform var(--fpv-motion-fast) var(--fpv-ease-standard);
      }
      .card--interactive:hover:not(.card--disabled):not(.card--locked) {
        border-color: var(--fpv-border-strong);
        box-shadow: var(--fpv-shadow-panel);
      }
      .card--selected {
        border-color: color-mix(in srgb, var(--fpv-accent) 55%, transparent);
        box-shadow: var(--fpv-shadow-panel);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--fpv-accent) 10%, transparent),
            transparent 48%
          ),
          color-mix(in srgb, var(--fpv-panel) 96%, transparent);
      }
      .card--disabled,
      .card--locked {
        opacity: 0.55;
      }
      .card__selected {
        position: absolute;
        top: var(--fpv-space-12);
        right: var(--fpv-space-12);
        display: inline-flex;
        align-items: center;
        gap: var(--fpv-space-4);
        padding: 0.15rem 0.45rem;
        border-radius: var(--fpv-radius-sm);
        background: var(--fpv-accent-soft);
        color: var(--fpv-accent);
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-caption);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    `,
  ],
})
export class FpvCardComponent {
  @Input() selected = false;
  @Input() disabled = false;
  @Input() locked = false;
  @Input() interactive = false;
}
