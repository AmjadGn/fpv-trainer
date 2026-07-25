import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FpvIconComponent } from './fpv-icon.component';

@Component({
  selector: 'fpv-dialog',
  standalone: true,
  imports: [FpvIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div class="backdrop" (click)="onBackdrop()" role="presentation">
        <div
          #dialogEl
          class="dialog"
          role="dialog"
          tabindex="-1"
          [attr.aria-modal]="true"
          [attr.aria-labelledby]="titleId"
          (click)="$event.stopPropagation()"
        >
          <header class="dialog__header">
            <h2 class="dialog__title" [id]="titleId">{{ title }}</h2>
            <button type="button" class="dialog__close" (click)="close.emit()" aria-label="Close">
              <fpv-icon name="close" [size]="18" />
            </button>
          </header>
          <div class="dialog__body">
            <ng-content />
          </div>
          <footer class="dialog__footer">
            <ng-content select="[footer]" />
          </footer>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: var(--fpv-z-modal);
        display: grid;
        place-items: center;
        padding: var(--fpv-space-16);
        background: rgba(0, 0, 0, 0.55);
      }
      .dialog {
        width: min(480px, 100%);
        max-height: min(90dvh, 640px);
        overflow: auto;
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-xl);
        background: var(--fpv-surface-elevated);
        box-shadow: var(--fpv-shadow-modal);
      }
      .dialog__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--fpv-space-12);
        padding: var(--fpv-space-16) var(--fpv-space-16) 0;
      }
      .dialog__title {
        margin: 0;
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-h3);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .dialog__close {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--fpv-text-muted);
        cursor: pointer;
        padding: var(--fpv-space-4);
      }
      .dialog__body {
        padding: var(--fpv-space-16);
      }
      .dialog__footer {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
        justify-content: flex-end;
        padding: 0 var(--fpv-space-16) var(--fpv-space-16);
      }
    `,
  ],
})
export class FpvDialogComponent implements OnChanges, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private previousFocus: HTMLElement | null = null;

  @ViewChild('dialogEl') dialogEl?: ElementRef<HTMLElement>;
  @Input() open = false;
  @Input({ required: true }) title!: string;
  @Input() closeOnBackdrop = true;
  @Output() readonly close = new EventEmitter<void>();

  protected readonly titleId = `fpv-dialog-${Math.random().toString(36).slice(2, 9)}`;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) {
      return;
    }
    if (this.open) {
      this.previousFocus = this.document.activeElement as HTMLElement | null;
      queueMicrotask(() => this.dialogEl?.nativeElement.focus());
    } else if (this.previousFocus) {
      this.previousFocus.focus?.();
      this.previousFocus = null;
    }
  }

  ngOnDestroy(): void {
    this.previousFocus?.focus?.();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.close.emit();
    }
  }

  protected onBackdrop(): void {
    if (this.closeOnBackdrop) {
      this.close.emit();
    }
  }
}
