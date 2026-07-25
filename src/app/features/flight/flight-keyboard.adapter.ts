import type { FlightInput } from '../../core/flight/models/flight-input.model';

/**
 * Development keyboard fallback. Held keys contribute stick/throttle deltas
 * that are merged with calibrated controller input upstream.
 */
export class FlightKeyboardAdapter {
  private readonly keys = new Set<string>();
  private throttleHold = 0;

  readonly available = true;

  onKeyDown(code: string): void {
    this.keys.add(code);
    if (code === 'KeyW') {
      this.throttleHold = Math.min(1, this.throttleHold + 0.05);
    } else if (code === 'KeyS') {
      this.throttleHold = Math.max(0, this.throttleHold - 0.05);
    }
  }

  onKeyUp(code: string): void {
    this.keys.delete(code);
  }

  clear(): void {
    this.keys.clear();
  }

  resetThrottle(): void {
    this.throttleHold = 0;
  }

  sample(): FlightInput {
    const yaw =
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const pitch =
      (this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('ArrowDown') ? 1 : 0);
    const roll =
      (this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('ArrowLeft') ? 1 : 0);

    // Continuous W/S while held for smoother throttle.
    if (this.keys.has('KeyW')) {
      this.throttleHold = Math.min(1, this.throttleHold + 0.015);
    }
    if (this.keys.has('KeyS')) {
      this.throttleHold = Math.max(0, this.throttleHold - 0.015);
    }

    return {
      throttle: this.throttleHold,
      yaw,
      pitch,
      roll,
    };
  }
}

export function mergeFlightInputs(
  controller: FlightInput | null,
  keyboard: FlightInput,
): FlightInput {
  const base = controller ?? { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
  return {
    throttle: clamp01(Math.max(base.throttle, keyboard.throttle)),
    yaw: clamp(base.yaw + keyboard.yaw, -1, 1),
    pitch: clamp(base.pitch + keyboard.pitch, -1, 1),
    roll: clamp(base.roll + keyboard.roll, -1, 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
