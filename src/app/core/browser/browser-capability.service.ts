import { Injectable, signal } from '@angular/core';
import {
  detectBrowserCapabilities,
  type BrowserCapabilityResult,
} from './browser-capabilities';

@Injectable({ providedIn: 'root' })
export class BrowserCapabilityService {
  readonly capabilities = signal<BrowserCapabilityResult>(detectBrowserCapabilities());

  refresh(): BrowserCapabilityResult {
    const next = detectBrowserCapabilities();
    this.capabilities.set(next);
    return next;
  }

  canStartFlight(): boolean {
    return this.capabilities().webgl;
  }
}
