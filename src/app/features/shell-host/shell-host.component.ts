import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Empty host for the default `/` route.
 * The real trainer shell (home, flight, etc.) renders in App when not on an online URL.
 * This route exists so Angular SSR / the dev server can resolve `/` instead of 404.
 */
@Component({
  selector: 'app-shell-host',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellHostComponent {}
