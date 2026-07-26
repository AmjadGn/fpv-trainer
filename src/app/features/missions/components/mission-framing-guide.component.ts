import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MISSION_CAPTURE_ASPECT_RATIO } from '@fpv/simulation-contracts';

/**
 * Presentation-only 16:9 framing guide.
 * Does not alter camera FOV, scoring evidence, or renderer size.
 */
@Component({
  selector: 'app-mission-framing-guide',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div
        class="framing-guide"
        aria-live="polite"
        [attr.aria-label]="statusLabel()"
        data-testid="mission-framing-guide"
      >
        <div class="letterbox letterbox-top" [style.height.px]="bars().vertical"></div>
        <div class="letterbox letterbox-bottom" [style.height.px]="bars().vertical"></div>
        <div class="pillarbox pillarbox-left" [style.width.px]="bars().horizontal"></div>
        <div class="pillarbox pillarbox-right" [style.width.px]="bars().horizontal"></div>
        <div
          class="frame"
          [style.width.px]="frame().width"
          [style.height.px]="frame().height"
          [style.left.px]="frame().left"
          [style.top.px]="frame().top"
        ></div>
        <span class="sr-only">{{ statusLabel() }}</span>
      </div>
    }
  `,
  styles: [
    `
      .framing-guide {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 20;
      }
      .letterbox,
      .pillarbox {
        position: absolute;
        background: rgba(0, 0, 0, 0.45);
        pointer-events: none;
      }
      .letterbox-top {
        top: 0;
        left: 0;
        right: 0;
      }
      .letterbox-bottom {
        bottom: 0;
        left: 0;
        right: 0;
      }
      .pillarbox-left {
        top: 0;
        bottom: 0;
        left: 0;
      }
      .pillarbox-right {
        top: 0;
        bottom: 0;
        right: 0;
      }
      .frame {
        position: absolute;
        box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.55);
        pointer-events: none;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }
    `,
  ],
})
export class MissionFramingGuideComponent {
  /** Viewport width in CSS pixels (not device pixels). */
  readonly viewportWidth = input.required<number>();
  /** Viewport height in CSS pixels (not device pixels). */
  readonly viewportHeight = input.required<number>();
  /** Active photography objective or explicit development preview. */
  readonly active = input(false);
  readonly preview = input(false);

  protected readonly visible = computed(() => this.active() || this.preview());

  protected readonly frame = computed(() => {
    const vw = Math.max(1, this.viewportWidth());
    const vh = Math.max(1, this.viewportHeight());
    const viewportAspect = vw / vh;
    const target = MISSION_CAPTURE_ASPECT_RATIO;
    let width: number;
    let height: number;
    if (viewportAspect > target) {
      // Wider than 16:9 → pillarbox
      height = vh;
      width = vh * target;
    } else {
      // Taller/narrower → letterbox
      width = vw;
      height = vw / target;
    }
    return {
      width,
      height,
      left: (vw - width) / 2,
      top: (vh - height) / 2,
    };
  });

  protected readonly bars = computed(() => {
    const vw = Math.max(1, this.viewportWidth());
    const vh = Math.max(1, this.viewportHeight());
    const f = this.frame();
    return {
      horizontal: Math.max(0, (vw - f.width) / 2),
      vertical: Math.max(0, (vh - f.height) / 2),
    };
  });

  protected readonly statusLabel = computed(() =>
    this.visible()
      ? 'Photography framing guide active — 16 by 9 capture region'
      : 'Photography framing guide hidden',
  );
}
