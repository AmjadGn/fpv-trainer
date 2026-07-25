import { Injectable, signal } from '@angular/core';

/**
 * Single source of truth for flight-session fullscreen state.
 * Owns the Fullscreen API + one `fullscreenchange` listener — callers must
 * not attach duplicate listeners or track separate fullscreen flags.
 */
@Injectable({ providedIn: 'root' })
export class TrainerSessionService {
  private readonly fullscreenSignal = signal(false);
  private readonly userMessageSignal = signal<string | null>(null);
  private target: HTMLElement | null = null;
  private onResize: (() => void) | null = null;
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;
  /** Armed by an explicit user gesture (e.g. Start Flight) for a deferred enter. */
  private autoFullscreenArmed = false;

  readonly isFullscreen = this.fullscreenSignal.asReadonly();
  readonly userMessage = this.userMessageSignal.asReadonly();

  /** Register a resize callback invoked after every fullscreenchange sync. */
  setResizeHandler(handler: (() => void) | null): void {
    this.onResize = handler;
  }

  /**
   * Mark that the next flight viewport may request fullscreen after a user
   * action (Start Flight). Never call from bare page-load paths.
   */
  armAutoFullscreen(): void {
    this.autoFullscreenArmed = true;
  }

  /** Consume a pending auto-fullscreen arm; returns true once. */
  consumeAutoFullscreenArm(): boolean {
    if (!this.autoFullscreenArmed) {
      return false;
    }
    this.autoFullscreenArmed = false;
    return true;
  }

  async enter(element: HTMLElement): Promise<boolean> {
    this.ensureListening();
    this.target = element;

    if (this.isElementFullscreen(element)) {
      this.fullscreenSignal.set(true);
      this.requestResize();
      return true;
    }

    try {
      await this.requestFullscreen(element);
      this.syncFromDocument();
      return this.fullscreenSignal();
    } catch {
      this.showMessage('Fullscreen unavailable — continuing in windowed mode.');
      this.syncFromDocument();
      return false;
    }
  }

  async exit(): Promise<void> {
    this.ensureListening();
    if (!this.getFullscreenElement()) {
      this.fullscreenSignal.set(false);
      this.requestResize();
      return;
    }

    try {
      await this.exitFullscreen();
    } catch {
      // Browser may already be exiting (e.g. Escape) — sync from document.
    }
    this.syncFromDocument();
  }

  async toggle(element: HTMLElement): Promise<boolean> {
    if (this.fullscreenSignal() || this.isElementFullscreen(element)) {
      await this.exit();
      return false;
    }
    return this.enter(element);
  }

  clearMessage(): void {
    if (this.messageTimer !== null) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    this.userMessageSignal.set(null);
  }

  private ensureListening(): void {
    if (this.listening || typeof document === 'undefined') {
      return;
    }
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener(
      'webkitfullscreenchange',
      this.onFullscreenChange,
    );
    this.listening = true;
  }

  private readonly onFullscreenChange = (): void => {
    this.syncFromDocument();
  };

  private syncFromDocument(): void {
    const active = this.getFullscreenElement();
    const isOurs =
      active != null &&
      this.target != null &&
      (active === this.target || this.target.contains(active));
    this.fullscreenSignal.set(isOurs);
    this.requestResize();
  }

  private requestResize(): void {
    this.onResize?.();
  }

  private showMessage(message: string, durationMs = 3400): void {
    if (this.messageTimer !== null) {
      clearTimeout(this.messageTimer);
    }
    this.userMessageSignal.set(message);
    this.messageTimer = setTimeout(() => {
      this.userMessageSignal.set(null);
      this.messageTimer = null;
    }, durationMs);
  }

  private getFullscreenElement(): Element | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  }

  private isElementFullscreen(element: HTMLElement): boolean {
    const active = this.getFullscreenElement();
    return active === element || (active != null && element.contains(active));
  }

  private async requestFullscreen(element: HTMLElement): Promise<void> {
    const el = element as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (typeof element.requestFullscreen === 'function') {
      await element.requestFullscreen();
      return;
    }
    if (typeof el.webkitRequestFullscreen === 'function') {
      await el.webkitRequestFullscreen();
      return;
    }
    throw new Error('Fullscreen API is not available');
  }

  private async exitFullscreen(): Promise<void> {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen();
      return;
    }
    if (typeof doc.webkitExitFullscreen === 'function') {
      await doc.webkitExitFullscreen();
      return;
    }
  }
}
