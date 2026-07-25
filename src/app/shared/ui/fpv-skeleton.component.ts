import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'fpv-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="sk" [style.width]="width" [style.height]="height" [attr.data-variant]="variant" aria-hidden="true"></span>`,
  styles: [
    `
      :host {
        display: block;
      }
      .sk {
        display: block;
        border-radius: var(--fpv-radius-md);
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--fpv-border) 35%, transparent),
          color-mix(in srgb, var(--fpv-border) 65%, transparent),
          color-mix(in srgb, var(--fpv-border) 35%, transparent)
        );
        background-size: 200% 100%;
        animation: fpv-skel var(--fpv-motion-slow) ease-in-out infinite;
      }
      .sk[data-variant='row'] {
        height: 2.75rem;
        width: 100%;
        margin-bottom: var(--fpv-space-8);
      }
      .sk[data-variant='card'] {
        height: 9rem;
        width: 100%;
      }
      .sk[data-variant='text'] {
        height: 0.85rem;
      }
      @keyframes fpv-skel {
        0% {
          background-position: 100% 0;
        }
        100% {
          background-position: -100% 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .sk {
          animation: none;
        }
      }
    `,
  ],
})
export class FpvSkeletonComponent {
  @Input() variant: 'text' | 'row' | 'card' = 'text';
  @Input() width = '100%';
  @Input() height = '';
}
