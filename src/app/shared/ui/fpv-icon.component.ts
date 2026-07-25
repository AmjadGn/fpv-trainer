import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FPV_ICON_PATHS, type FpvIconName } from '../icons/fpv-icons';

@Component({
  selector: 'fpv-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="fpv-icon"
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="label ? null : 'true'"
      [attr.role]="label ? 'img' : null"
      [attr.aria-label]="label || null"
    >
      <path [attr.d]="path" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        line-height: 0;
        color: inherit;
      }
      .fpv-icon {
        display: block;
        flex-shrink: 0;
      }
    `,
  ],
})
export class FpvIconComponent {
  @Input({ required: true }) name!: FpvIconName;
  @Input() size: number | string = 20;
  /** Accessible name; omit for decorative icons. */
  @Input() label = '';

  protected get path(): string {
    return FPV_ICON_PATHS[this.name] ?? '';
  }
}
