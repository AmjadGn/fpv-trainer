import { Injectable } from '@angular/core';

import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import type { FlightRuntimeSession } from '../models/flight-runtime-session';
import { createIdleFlightRuntimeSession } from '../models/flight-runtime-session';

/**
 * Owns the integer simulation tick for live flight runtime sessions.
 *
 * Ownership point: application flight-runtime boundary (not mission-domain,
 * not photography-domain, not FlightControllerService physics integration).
 *
 * Lifecycle:
 * - beginSession / resetSession → tick = 0, new generation
 * - completeFixedStep → tick += 1 exactly once per corrected fixed step
 * - independent of render frames and wall-clock time
 */
@Injectable({ providedIn: 'root' })
export class FlightSimulationClock {
  private session: FlightRuntimeSession = createIdleFlightRuntimeSession(
    FLIGHT_CONFIG.physicsStep,
  );

  /**
   * Begins or resets a runtime session. Returns the new session generation.
   * Tick is always 0 after begin/reset.
   */
  beginSession(fixedStepSeconds: number = FLIGHT_CONFIG.physicsStep): number {
    if (!Number.isFinite(fixedStepSeconds) || fixedStepSeconds <= 0) {
      throw new Error(
        `FlightSimulationClock.beginSession: fixedStepSeconds must be > 0, got ${fixedStepSeconds}`,
      );
    }
    const nextGeneration = this.session.sessionGeneration + 1;
    this.session = {
      sessionGeneration: nextGeneration,
      started: true,
      tick: 0,
      fixedStepSeconds,
    };
    return nextGeneration;
  }

  /** Alias of beginSession for explicit retry/reset call sites. */
  resetSession(fixedStepSeconds: number = FLIGHT_CONFIG.physicsStep): number {
    return this.beginSession(fixedStepSeconds);
  }

  /**
   * Increments the tick exactly once after a completed authoritative fixed
   * step (post-collision). Returns the new tick value.
   */
  completeFixedStep(): number {
    if (!this.session.started) {
      this.beginSession(this.session.fixedStepSeconds);
    }
    const next = this.session.tick + 1;
    if (!Number.isInteger(next) || next < 0) {
      throw new Error(`FlightSimulationClock: invalid tick ${next}`);
    }
    this.session = {
      ...this.session,
      tick: next,
    };
    return next;
  }

  currentTick(): number {
    return this.session.tick;
  }

  elapsedTicks(): number {
    return this.session.tick;
  }

  fixedStepSeconds(): number {
    return this.session.fixedStepSeconds;
  }

  sessionGeneration(): number {
    return this.session.sessionGeneration;
  }

  isStarted(): boolean {
    return this.session.started;
  }

  snapshot(): Readonly<FlightRuntimeSession> {
    return { ...this.session };
  }
}
