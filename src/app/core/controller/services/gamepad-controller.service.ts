import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';

import {
  AxisState,
  ButtonState,
} from '../models/controller-state.model';

const AXIS_ACTIVE_THRESHOLD = 0.03;

@Injectable({ providedIn: 'root' })
export class GamepadControllerService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly connected = signal(false);
  readonly controllerName = signal<string | null>(null);
  readonly controllerIndex = signal<number | null>(null);
  readonly mapping = signal<string | null>(null);
  readonly axes = signal<AxisState[]>([]);
  readonly buttons = signal<ButtonState[]>([]);
  readonly lastUpdated = signal<number | null>(null);
  /** Defaults to true so SSR/prerender matches the client "waiting" state. */
  readonly apiAvailable = signal(true);

  private selectedIndex: number | null = null;
  private animationFrameId: number | null = null;
  private polling = false;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const available =
      typeof navigator !== 'undefined' &&
      typeof navigator.getGamepads === 'function';

    this.apiAvailable.set(available);

    if (!available) {
      return;
    }

    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener(
      'gamepaddisconnected',
      this.handleGamepadDisconnected,
    );

    this.destroyRef.onDestroy(() => this.teardown());

    this.refreshSelection();
    this.startPolling();
  }

  /** Rescan pads after a user gesture (Chrome often needs this). */
  scanControllers(): void {
    if (!this.apiAvailable()) {
      return;
    }

    this.selectedIndex = null;
    this.refreshSelection();
  }

  private readonly handleGamepadConnected = (): void => {
    this.selectedIndex = null;
    this.refreshSelection();
  };

  private readonly handleGamepadDisconnected = (): void => {
    this.selectedIndex = null;
    this.refreshSelection();
  };

  private startPolling(): void {
    if (this.polling) {
      return;
    }

    this.polling = true;

    const tick = (): void => {
      this.readActiveGamepad();
      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  private refreshSelection(): void {
    this.readActiveGamepad();
  }

  private readActiveGamepad(): void {
    if (!this.apiAvailable()) {
      return;
    }

    const pads = navigator.getGamepads();
    const pad = this.resolveGamepad(pads);

    if (!pad) {
      this.clearState();
      return;
    }

    this.selectedIndex = pad.index;
    this.applyGamepad(pad);
  }

  private resolveGamepad(
    pads: (Gamepad | null)[],
  ): Gamepad | null {
    if (this.selectedIndex !== null) {
      const current = pads[this.selectedIndex];
      if (current) {
        return current;
      }
    }

    return this.pickPreferredGamepad(pads);
  }

  private pickPreferredGamepad(
    pads: (Gamepad | null)[],
  ): Gamepad | null {
    const connected: Gamepad[] = [];

    for (const pad of pads) {
      if (pad) {
        connected.push(pad);
      }
    }

    if (connected.length === 0) {
      return null;
    }

    const dji = connected.find((pad) =>
      pad.id.toUpperCase().includes('DJI'),
    );

    return dji ?? connected[0];
  }

  private applyGamepad(pad: Gamepad): void {
    this.connected.set(true);
    this.controllerName.set(pad.id);
    this.controllerIndex.set(pad.index);
    this.mapping.set(pad.mapping || 'none');
    this.axes.set(this.mapAxes(pad.axes));
    this.buttons.set(this.mapButtons(pad.buttons));
    this.lastUpdated.set(typeof pad.timestamp === 'number' ? pad.timestamp : Date.now());
  }

  private mapAxes(rawAxes: ReadonlyArray<number>): AxisState[] {
    return rawAxes.map((rawValue, index) => {
      const active = Math.abs(rawValue) > AXIS_ACTIVE_THRESHOLD;

      return {
        index,
        rawValue,
        normalizedValue: rawValue,
        active,
      };
    });
  }

  private mapButtons(
    rawButtons: ReadonlyArray<GamepadButton>,
  ): ButtonState[] {
    return rawButtons.map((button, index) => ({
      index,
      value: button.value,
      pressed: button.pressed,
      touched: button.touched,
    }));
  }

  private clearState(): void {
    this.selectedIndex = null;
    this.connected.set(false);
    this.controllerName.set(null);
    this.controllerIndex.set(null);
    this.mapping.set(null);
    this.axes.set([]);
    this.buttons.set([]);
    this.lastUpdated.set(null);
  }

  private teardown(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.polling = false;

    if (isPlatformBrowser(this.platformId) && this.apiAvailable()) {
      window.removeEventListener(
        'gamepadconnected',
        this.handleGamepadConnected,
      );
      window.removeEventListener(
        'gamepaddisconnected',
        this.handleGamepadDisconnected,
      );
    }
  }
}
