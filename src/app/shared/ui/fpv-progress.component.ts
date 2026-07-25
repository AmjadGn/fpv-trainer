import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'fpv-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="progress"
      role="progressbar"
      [attr.aria-valuenow]="clamped"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-label]="label || null"
    >
      <div class="progress__fill" [style.width.%]="clamped"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .progress {
        height: 0.4rem;
        border-radius: var(--fpv-radius-pill);
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid var(--fpv-border);
        overflow: hidden;
      }
      .progress__fill {
        height: 100%;
        background: var(--fpv-accent);
        border-radius: inherit;
        transition: width var(--fpv-motion-normal) var(--fpv-ease-standard);
      }
      @media (prefers-reduced-motion: reduce) {
        .progress__fill {
          transition: none;
        }
      }
    `,
  ],
})
export class FpvProgressComponent {
  @Input() value = 0;
  @Input() label = '';

  protected get clamped(): number {
    if (!Number.isFinite(this.value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(this.value)));
  }
}
