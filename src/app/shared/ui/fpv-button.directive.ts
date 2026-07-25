import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type FpvButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ranked';
export type FpvButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'button[fpvButton], a[fpvButton]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'hostClass',
    '[attr.data-variant]': 'variant',
    '[attr.data-size]': 'size',
  },
  template: `<ng-content />`,
  styles: [
    `
      :host {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--fpv-space-8);
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-md);
        background: color-mix(in srgb, var(--fpv-surface) 80%, transparent);
        color: var(--fpv-text);
        font: inherit;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        text-decoration: none;
        cursor: pointer;
        transition:
          background var(--fpv-motion-fast) var(--fpv-ease-standard),
          border-color var(--fpv-motion-fast) var(--fpv-ease-standard),
          color var(--fpv-motion-fast) var(--fpv-ease-standard);
      }
      :host([data-size='sm']) {
        padding: 0.4rem 0.7rem;
        font-size: var(--fpv-text-caption);
      }
      :host([data-size='md']) {
        padding: 0.55rem 0.95rem;
        font-size: var(--fpv-text-label);
      }
      :host([data-size='lg']) {
        padding: 0.75rem 1.2rem;
        font-size: var(--fpv-text-body-sm);
      }
      :host([data-variant='primary']) {
        border-color: var(--fpv-accent);
        background: var(--fpv-accent-soft);
        color: var(--fpv-accent);
      }
      :host([data-variant='primary']:hover:not(:disabled)) {
        background: color-mix(in srgb, var(--fpv-accent) 30%, transparent);
      }
      :host([data-variant='secondary']) {
        border-color: var(--fpv-border-strong);
        background: transparent;
        color: var(--fpv-accent);
      }
      :host([data-variant='ghost']) {
        border-color: transparent;
        background: transparent;
        color: var(--fpv-text-muted);
      }
      :host([data-variant='ghost']:hover:not(:disabled)) {
        color: var(--fpv-text);
        background: color-mix(in srgb, var(--fpv-text) 6%, transparent);
      }
      :host([data-variant='danger']) {
        border-color: color-mix(in srgb, var(--fpv-danger) 50%, transparent);
        background: color-mix(in srgb, var(--fpv-danger) 12%, transparent);
        color: var(--fpv-danger);
      }
      :host([data-variant='ranked']) {
        border-color: var(--fpv-ranked);
        background: color-mix(in srgb, var(--fpv-ranked) 16%, transparent);
        color: var(--fpv-ranked);
      }
      :host(:disabled),
      :host([aria-disabled='true']) {
        opacity: 0.45;
        cursor: not-allowed;
      }
      :host(:focus-visible) {
        outline: 2px solid var(--fpv-focus-ring);
        outline-offset: 2px;
      }
    `,
  ],
})
export class FpvButtonDirective {
  @Input() variant: FpvButtonVariant = 'secondary';
  @Input() size: FpvButtonSize = 'md';
  @Input() hostClass = 'fpv-btn';
}
