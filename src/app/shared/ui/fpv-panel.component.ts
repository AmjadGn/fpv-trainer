import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'fpv-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [class.panel--glass]="glass" [attr.aria-labelledby]="labelledBy || null">
      @if (title) {
        <header class="panel__header">
          <h2 class="panel__title" [id]="labelledBy || null">{{ title }}</h2>
          @if (subtitle) {
            <p class="panel__subtitle">{{ subtitle }}</p>
          }
        </header>
      }
      <div class="panel__body">
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .panel {
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-lg);
        background: var(--fpv-panel);
        box-shadow: var(--fpv-shadow-subtle);
      }
      .panel--glass {
        background: var(--fpv-panel-glass);
        backdrop-filter: blur(8px);
      }
      @media (prefers-reduced-motion: reduce) {
        .panel--glass {
          backdrop-filter: none;
        }
      }
      .panel__header {
        padding: var(--fpv-space-16) var(--fpv-space-16) 0;
      }
      .panel__title {
        margin: 0;
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-h3);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .panel__subtitle {
        margin: var(--fpv-space-4) 0 0;
        color: var(--fpv-text-muted);
        font-size: var(--fpv-text-body-sm);
      }
      .panel__body {
        padding: var(--fpv-space-16);
      }
    `,
  ],
})
export class FpvPanelComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() labelledBy = '';
  /** Glass only for HUD / floating overlays — avoid on data-heavy pages. */
  @Input() glass = false;
}
