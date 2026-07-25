import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvStatComponent } from '../../shared/ui/fpv-stat.component';
import { FpvTabsComponent, type FpvTabItem } from '../../shared/ui/fpv-tabs.component';

@Component({
  standalone: true,
  imports: [
    RouterLink,
    FpvPageHeaderComponent,
    FpvPanelComponent,
    FpvButtonDirective,
    FpvStatComponent,
    FpvTabsComponent,
  ],
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page">
        <fpv-page-header
          eyebrow="Pilot profile"
          [title]="auth.user()?.displayName || auth.user()?.username || 'Pilot'"
          [support]="'@' + (auth.user()?.username || 'pilot')"
        >
          <a actions routerLink="/profile/customize" fpvButton variant="secondary" size="sm">Customize Pilot</a>
          <a actions routerLink="/account" fpvButton variant="ghost" size="sm">Privacy Settings</a>
        </fpv-page-header>

        <fpv-tabs [tabs]="tabs" [activeId]="tab" (activeIdChange)="tab = $event" ariaLabel="Profile sections" />

        <fpv-panel>
          <dl class="stats">
            <fpv-stat label="Email" [value]="auth.user()?.email || '—'" />
            <fpv-stat label="Country" [value]="auth.user()?.countryCode || '—'" />
            <fpv-stat label="Competitive" [value]="auth.user()?.competitiveStatus || '—'" />
          </dl>
          <div class="actions">
            <a routerLink="/profile/runs" fpvButton variant="secondary" size="sm">Results</a>
            <a routerLink="/locker" fpvButton variant="ghost" size="sm">Cosmetics</a>
          </div>
        </fpv-panel>
      </main>
    </div>
  `,
  styles: [
    `
      .stats {
        margin: 0 0 var(--fpv-space-16);
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: var(--fpv-space-16);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--fpv-space-8);
      }
    `,
  ],
})
export class ProfileComponent {
  readonly auth = inject(AuthSessionService);
  tab = 'overview';
  readonly tabs: FpvTabItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'results', label: 'Results' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'replays', label: 'Replays' },
    { id: 'cosmetics', label: 'Cosmetics' },
  ];
}
