import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, FpvButtonDirective],
  selector: 'app-register',
  template: `
    <main class="auth">
      <div class="auth__panel">
        <p class="auth__brand">FPV Trainer</p>
        <h1>Create account</h1>
        <p class="auth__support">
          Keep progression synced and unlock verified competition. Guest flying stays available.
        </p>
        <form (ngSubmit)="submit()">
          <label>
            Display name
            <input name="displayName" [(ngModel)]="displayName" minlength="2" maxlength="60" required />
          </label>
          <label>
            Username
            <input name="username" [(ngModel)]="username" autocomplete="username" required />
          </label>
          <label>
            Email
            <input name="email" [(ngModel)]="email" type="email" autocomplete="email" required />
          </label>
          <label>
            Country code (optional)
            <input name="countryCode" [(ngModel)]="countryCode" maxlength="2" autocapitalize="characters" />
          </label>
          <label>
            Password
            <input
              name="password"
              [(ngModel)]="password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              aria-describedby="password-req"
            />
            <span id="password-req" class="hint">At least 8 characters.</span>
          </label>
          <label>
            Confirm password
            <input
              name="passwordConfirmation"
              [(ngModel)]="passwordConfirmation"
              type="password"
              autocomplete="new-password"
              required
            />
          </label>
          <label class="terms">
            <input name="acceptedTerms" [(ngModel)]="acceptedTerms" type="checkbox" required />
            <span>I accept the terms</span>
          </label>
          <p class="error" aria-live="polite">{{ error() }}</p>
          @if (passwordMismatch()) {
            <p class="error" role="alert">Passwords do not match.</p>
          }
          <button type="submit" fpvButton variant="primary" [disabled]="!canSubmit()">Create Account</button>
        </form>
        <div class="auth__links">
          <a routerLink="/login">Already have an account?</a>
          <button type="button" fpvButton variant="ghost" size="sm" (click)="guest()">Continue as Guest</button>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100%; }
      .auth {
        min-height: 100%;
        display: grid;
        place-items: center;
        padding: var(--fpv-space-24) var(--fpv-space-16);
        background:
          radial-gradient(900px 480px at 20% -10%, color-mix(in srgb, var(--fpv-accent) 14%, transparent), transparent 55%),
          linear-gradient(180deg, var(--fpv-bg-top), var(--fpv-bg-bottom));
      }
      .auth__panel {
        width: min(480px, 100%);
        padding: var(--fpv-space-32);
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-xl);
        background: var(--fpv-panel);
        box-shadow: var(--fpv-shadow-panel);
        display: grid;
        gap: var(--fpv-space-16);
      }
      .auth__brand {
        margin: 0;
        font-family: var(--fpv-font-display);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fpv-accent);
        font-size: var(--fpv-text-label);
      }
      h1 {
        margin: 0;
        font-family: var(--fpv-font-display);
        font-size: var(--fpv-text-h1);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        line-height: 1.1;
      }
      .auth__support { margin: 0; color: var(--fpv-text-muted); font-size: var(--fpv-text-body-sm); }
      form { display: grid; gap: var(--fpv-space-12); }
      label { display: grid; gap: var(--fpv-space-4); font-size: var(--fpv-text-caption); letter-spacing: .08em; text-transform: uppercase; color: var(--fpv-text-muted); }
      input {
        padding: 0.7rem 0.8rem;
        border: 1px solid var(--fpv-border);
        border-radius: var(--fpv-radius-md);
        background: var(--fpv-bg);
        color: var(--fpv-text);
        font: inherit;
        text-transform: none;
        letter-spacing: normal;
      }
      .hint { margin: 0; color: var(--fpv-text-muted); font-size: var(--fpv-text-caption); text-transform: none; letter-spacing: normal; }
      .error { margin: 0; color: var(--fpv-danger); font-size: var(--fpv-text-body-sm); }
      .auth__links { display: flex; flex-wrap: wrap; gap: var(--fpv-space-12); align-items: center; }
      .auth__links a { color: var(--fpv-accent); }
      .terms { display: flex; gap: var(--fpv-space-8); align-items: flex-start; text-transform: none; letter-spacing: normal; font-size: var(--fpv-text-body-sm); color: var(--fpv-text); }
      .terms input { width: auto; margin-top: 0.2rem; }
    `,
  ],
})
export class RegisterComponent {
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  displayName = '';
  username = '';
  email = '';
  countryCode = '';
  password = '';
  passwordConfirmation = '';
  acceptedTerms = false;
  readonly error = signal('');

  passwordMismatch(): boolean {
    return this.passwordConfirmation.length > 0 && this.password !== this.passwordConfirmation;
  }

  canSubmit(): boolean {
    return this.acceptedTerms && this.password.length >= 8 && !this.passwordMismatch();
  }

  submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.auth
      .register({
        displayName: this.displayName,
        username: this.username,
        email: this.email,
        password: this.password,
        passwordConfirmation: this.passwordConfirmation,
        acceptedTerms: this.acceptedTerms,
        countryCode: this.countryCode.trim().toUpperCase() || undefined,
      })
      .subscribe({
        next: () => void this.router.navigateByUrl('/app'),
        error: () => this.error.set('Unable to create your account.'),
      });
  }

  guest(): void {
    void this.router.navigateByUrl('/app');
  }
}
