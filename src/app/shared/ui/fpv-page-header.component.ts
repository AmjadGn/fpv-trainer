import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'fpv-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="header__copy">
        @if (eyebrow) {
          <p class="fpv-eyebrow">{{ eyebrow }}</p>
        }
        <h1 class="fpv-title">{{ title }}</h1>
        @if (support) {
          <p class="fpv-support">{{ support }}</p>
        }
      </div>
      <div class="header__actions">
        <ng-content select="[actions]" />
      </div>
    </header>
  `,
  styles: [
    `
      .header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--fpv-space-16);
        margin-bottom: var(--fpv-space-24);
      }
      .header__copy {
        display: grid;
        gap: var(--fpv-space-8);
        min-width: min(100%, 18rem);
        flex: 1 1 18rem;
      }
      .header__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
        align-items: center;
      }
    `,
  ],
})
export class FpvPageHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input() eyebrow = '';
  @Input() support = '';
}
