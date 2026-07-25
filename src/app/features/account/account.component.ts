import { Component, inject, signal } from '@angular/core';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { ProfileApiService } from '../../core/online/services/profile-api.service';
import { CLIENT_BUILD_VERSION } from '../../core/online/models/version.constants';
import { FpvPageHeaderComponent } from '../../shared/ui/fpv-page-header.component';
import { FpvPanelComponent } from '../../shared/ui/fpv-panel.component';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';
import { FpvDialogComponent } from '../../shared/ui/fpv-dialog.component';

@Component({
  standalone: true,
  imports: [FpvPageHeaderComponent, FpvPanelComponent, FpvButtonDirective, FpvDialogComponent],
  template: `
    <div class="fpv-page-bg">
      <main class="fpv-page--narrow fpv-page">
        <fpv-page-header
          eyebrow="Account"
          title="Privacy and data"
          support="Sessions, export, and destructive account actions."
        />

        <div class="stack">
          <fpv-panel title="Sessions" subtitle="Signed in as {{ auth.user()?.email }}">
            <button type="button" fpvButton variant="secondary" (click)="signOut()">Sign out</button>
          </fpv-panel>

          <fpv-panel title="Online" subtitle="Export a copy of your profile data.">
            <button type="button" fpvButton variant="secondary" (click)="requestExport()">Request export</button>
          </fpv-panel>

          <fpv-panel title="Danger zone" subtitle="These actions cannot be undone.">
            <button type="button" fpvButton variant="danger" (click)="confirmOpen.set(true)">Delete account</button>
          </fpv-panel>

          <p class="muted">FPV Trainer client v{{ buildVersion }}</p>
        </div>
      </main>
    </div>

    <fpv-dialog [open]="confirmOpen()" title="Delete account" (close)="confirmOpen.set(false)">
      <p>Delete your FPV Trainer account? This cannot be undone.</p>
      <div footer>
        <button type="button" fpvButton variant="ghost" (click)="confirmOpen.set(false)">Cancel</button>
        <button type="button" fpvButton variant="danger" (click)="deleteAccount()">Delete account</button>
      </div>
    </fpv-dialog>
  `,
  styles: [
    `
      .stack {
        display: grid;
        gap: var(--fpv-space-16);
      }
      .muted {
        color: var(--fpv-text-muted);
        font-size: var(--fpv-text-caption);
      }
    `,
  ],
})
export class AccountComponent {
  readonly auth = inject(AuthSessionService);
  private readonly profile = inject(ProfileApiService);
  readonly buildVersion = CLIENT_BUILD_VERSION;
  readonly confirmOpen = signal(false);

  signOut(): void {
    this.auth.logout().subscribe();
  }

  requestExport(): void {
    this.profile.export().subscribe();
  }

  deleteAccount(): void {
    this.confirmOpen.set(false);
    this.profile.deleteAccount().subscribe({ next: () => this.auth.clear() });
  }
}
