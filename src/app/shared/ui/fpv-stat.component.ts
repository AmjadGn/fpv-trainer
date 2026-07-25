import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'fpv-stat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat">
      <dt class="stat__label">{{ label }}</dt>
      <dd class="stat__value">{{ value }}</dd>
      @if (hint) {
        <p class="stat__hint">{{ hint }}</p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .stat {
        display: grid;
        gap: 0.15rem;
      }
      .stat__label {
        margin: 0;
        font-size: var(--fpv-text-caption);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--fpv-text-muted);
      }
      .stat__value {
        margin: 0;
        font-family: var(--fpv-font-mono);
        font-size: var(--fpv-text-body);
        color: var(--fpv-text);
      }
      .stat__hint {
        margin: 0;
        font-size: var(--fpv-text-caption);
        color: var(--fpv-text-muted);
      }
    `,
  ],
})
export class FpvStatComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string | number;
  @Input() hint = '';
}
