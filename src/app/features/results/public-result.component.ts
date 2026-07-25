import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvStatusBadgeComponent } from '../../shared/ui/fpv-status-badge.component';

@Component({
  standalone: true,
  imports: [RouterLink, FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective, FpvStatusBadgeComponent],
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page--narrow fpv-page">
        <fpv-page-header
          eyebrow="Shared run"
          title="Public result"
          support="Verified race result shared from FPV Trainer."
        />
        <fpv-panel>
          <div class="result">
            <fpv-status-badge status="verified" />
            <p class="result__id mono">Result {{ id }}</p>
            <p class="muted">Course, environment, weather, and rank load from the public results API when available.</p>
            <div class="actions">
              <a [routerLink]="['/replays', id]" fpvButton variant="primary">Watch Replay</a>
              <a routerLink="/" fpvButton variant="secondary">Try FPV Trainer</a>
            </div>
          </div>
        </fpv-panel>
      </main>
    </div>
  `,
  styles: [
    `
      .result {
        display: grid;
        gap: var(--fpv-space-12);
      }
      .result__id {
        margin: 0;
        font-family: var(--fpv-font-mono);
        font-size: var(--fpv-text-h2);
      }
      .muted {
        margin: 0;
        color: var(--fpv-text-muted);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
      }
    `,
  ],
})
export class PublicResultComponent {
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('publicId') ?? '';
}
