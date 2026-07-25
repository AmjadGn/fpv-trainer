import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface FpvTabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'fpv-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist" [attr.aria-label]="ariaLabel">
      @for (tab of tabs; track tab.id) {
        <button
          type="button"
          role="tab"
          class="tabs__tab"
          [class.tabs__tab--active]="tab.id === activeId"
          [attr.aria-selected]="tab.id === activeId"
          [disabled]="tab.disabled"
          (click)="select(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .tabs {
        display: inline-flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-4);
        padding: var(--fpv-space-4);
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-lg);
        background: rgba(0, 0, 0, 0.28);
      }
      .tabs__tab {
        appearance: none;
        border: 0;
        border-radius: var(--fpv-radius-md);
        background: transparent;
        color: var(--fpv-text-muted);
        font: inherit;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        font-size: var(--fpv-text-label);
        padding: 0.45rem 0.85rem;
        cursor: pointer;
      }
      .tabs__tab:hover:not(:disabled) {
        color: var(--fpv-text);
      }
      .tabs__tab--active {
        background: var(--fpv-accent-soft);
        color: var(--fpv-accent);
      }
      .tabs__tab:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .tabs__tab:focus-visible {
        outline: 2px solid var(--fpv-focus-ring);
        outline-offset: 2px;
      }
    `,
  ],
})
export class FpvTabsComponent {
  @Input({ required: true }) tabs!: FpvTabItem[];
  @Input() activeId = '';
  @Input() ariaLabel = 'Sections';
  @Output() readonly activeIdChange = new EventEmitter<string>();

  protected select(id: string): void {
    if (id === this.activeId) {
      return;
    }
    this.activeIdChange.emit(id);
  }
}
