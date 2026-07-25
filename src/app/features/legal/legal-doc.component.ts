import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

const PAGES: Record<string, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: 'Privacy Policy',
    paragraphs: [
      'Requires legal review before commercial use.',
      'We distinguish essential local storage (settings, calibration, onboarding) from optional analytics and error reporting.',
      'Analytics and error reporting respect your privacy preferences. Flying does not require analytics consent.',
      'Account data export and deletion are available when signed in, subject to backend support.',
    ],
  },
  terms: {
    title: 'Terms of Use',
    paragraphs: [
      'Requires legal review before commercial use.',
      'FPV Trainer is provided as an alpha simulation product. Features may change or break.',
      'You are responsible for complying with local laws when flying real aircraft. This software is not certified training.',
    ],
  },
  cookies: {
    title: 'Cookie / tracking notice',
    paragraphs: [
      'Requires legal review.',
      'Essential storage keeps the product working on this device. Optional analytics and error reporting are controlled in Privacy settings.',
    ],
  },
  licenses: {
    title: 'Third-Party Licenses',
    paragraphs: [
      'This product uses open-source libraries including Angular, Three.js, Rapier, and RxJS under their respective licenses.',
      'See repository package licenses for the full list. Legal review recommended before commercial distribution.',
    ],
  },
  'asset-licenses': {
    title: 'Asset Licenses',
    paragraphs: [
      'Aircraft, environments, and UI assets used in FPV Trainer must be project-owned or properly licensed.',
      'Do not use unlicensed manufacturer logos, DJI imagery, or third-party drone photography.',
      'See docs/asset-licenses.md for the inventory. Requires legal review.',
    ],
  },
  'alpha-disclaimer': {
    title: 'Alpha Disclaimer',
    paragraphs: [
      'This is an early public alpha. Stability, physics, and competitive rules may change.',
      'Results may be rejected. Features may be gated. Feedback and diagnostics help us improve.',
    ],
  },
  safety: {
    title: 'Safety Disclaimer',
    paragraphs: [
      'Requires legal review.',
      'This is a simulation. It is not a substitute for local legal training or certification.',
      'Real drone use may require permits. Follow local laws. Flight behavior is an approximation. Supported hardware behavior may vary.',
    ],
  },
};

@Component({
  selector: 'app-legal-doc',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="legal">
      <a routerLink="/" class="legal__back">← FPV Trainer</a>
      <h1>{{ page().title }}</h1>
      <p class="legal__notice" role="note">
        Placeholder for professional legal review. Not final legal advice.
      </p>
      @for (p of page().paragraphs; track p) {
        <p>{{ p }}</p>
      }
      <footer class="legal__links">
        <a routerLink="/privacy">Privacy</a>
        <a routerLink="/terms">Terms</a>
        <a routerLink="/cookies">Cookies</a>
        <a routerLink="/licenses">Licenses</a>
        <a routerLink="/asset-licenses">Asset licenses</a>
        <a routerLink="/alpha-disclaimer">Alpha</a>
        <a routerLink="/safety">Safety</a>
      </footer>
    </div>
  `,
  styles: [
    `
      .legal {
        max-width: 44rem;
        margin: 0 auto;
        padding: 2rem 1.25rem 4rem;
        line-height: 1.55;
      }
      .legal__back {
        display: inline-block;
        margin-bottom: 1rem;
        color: inherit;
      }
      .legal__notice {
        padding: 0.75rem 1rem;
        border-left: 3px solid #b8860b;
        background: rgba(184, 134, 11, 0.12);
      }
      .legal__links {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-top: 2.5rem;
        font-size: 0.9rem;
      }
      .legal__links a {
        color: inherit;
      }
    `,
  ],
})
export class LegalDocComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly page = toSignal(
    this.route.data.pipe(
      map((data) => PAGES[String(data['doc'] ?? 'privacy')] ?? PAGES['privacy']),
    ),
    { initialValue: PAGES['privacy'] },
  );
}
