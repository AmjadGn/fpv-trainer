import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AppShellService } from '../../core/shell/app-shell.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

/**
 * Fly → Expeditions foundation screen.
 * User-facing label: Expeditions. Internal view: missions.
 * No final Mediterranean mission content in this build.
 */
@Component({
  selector: 'app-expeditions-hub',
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page">
        <fpv-page-header
          eyebrow="Fly"
          title="Expeditions"
          support="Photography missions in curated locations. Content is installed per build."
        />

        <fpv-panel title="Expeditions" subtitle="Mission entry foundation for v1.3.0.">
          <p class="empty-copy">
            Expedition content is not installed in this build.
          </p>
          <div class="actions">
            <button type="button" fpvButton variant="secondary" size="sm" (click)="backToFly()">
              Back to Fly
            </button>
          </div>
        </fpv-panel>
      </main>
    </div>
  `,
  styles: [
    `
      .empty-copy {
        margin: 0 0 1rem;
        color: var(--fpv-text-muted, #9aa49c);
      }
      .actions {
        display: flex;
        gap: 0.75rem;
      }
    `,
  ],
})
export class ExpeditionsHubComponent {
  private readonly shell = inject(AppShellService);

  protected backToFly(): void {
    this.shell.showFly();
  }
}
