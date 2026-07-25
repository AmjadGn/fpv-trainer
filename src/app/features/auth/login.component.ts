import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthSessionService } from '../../core/auth/services/auth-session.service';
import { FpvButtonDirective } from '../../shared/ui/fpv-button.directive';

const AUTH_STYLES = `
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
    width: min(440px, 100%);
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
  .auth__support {
    margin: 0;
    color: var(--fpv-text-muted);
    font-size: var(--fpv-text-body-sm);
  }
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
  input:focus-visible { outline: 2px solid var(--fpv-focus-ring); outline-offset: 2px; }
  .hint { margin: 0; color: var(--fpv-text-muted); font-size: var(--fpv-text-caption); text-transform: none; letter-spacing: normal; }
  .error { margin: 0; color: var(--fpv-danger); font-size: var(--fpv-text-body-sm); }
  .auth__links { display: flex; flex-wrap: wrap; gap: var(--fpv-space-12); align-items: center; }
  .auth__links a { color: var(--fpv-accent); }
  .terms { display: flex; gap: var(--fpv-space-8); align-items: flex-start; text-transform: none; letter-spacing: normal; font-size: var(--fpv-text-body-sm); color: var(--fpv-text); }
  .terms input { width: auto; margin-top: 0.2rem; }
`;

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, FpvButtonDirective],
  selector: 'app-login',
  template: `
    <main class="auth">
      <div class="auth__panel">
        <p class="auth__brand">FPV Trainer</p>
        <h1>Sign in</h1>
        <p class="auth__support">
          Sync progress and submit verified runs. Flying as a guest always remains available.
        </p>
        <form (ngSubmit)="submit()">
          <label>
            Email or username
            <input name="identifier" [(ngModel)]="identifier" autocomplete="username" required />
          </label>
          <label>
            Password
            <input name="password" [(ngModel)]="password" type="password" autocomplete="current-password" required />
          </label>
          <p class="error" aria-live="polite">{{ error() }}</p>
          <button type="submit" fpvButton variant="primary">Sign In</button>
        </form>
        <div class="auth__links">
          <a routerLink="/forgot-password">Forgot password?</a>
          <a routerLink="/register">Create account</a>
          <button type="button" fpvButton variant="ghost" size="sm" (click)="guest()">Continue as Guest</button>
        </div>
      </div>
    </main>
  `,
  styles: [AUTH_STYLES],
})
export class LoginComponent {
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  identifier = '';
  password = '';
  readonly error = signal('');

  submit(): void {
    this.auth.login({ identifier: this.identifier, password: this.password }).subscribe({
      next: () => void this.router.navigateByUrl('/app'),
      error: () => this.error.set('Sign-in failed. Check your details and try again.'),
    });
  }

  guest(): void {
    void this.router.navigateByUrl('/app');
  }
}
