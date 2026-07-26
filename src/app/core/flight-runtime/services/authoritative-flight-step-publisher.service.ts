import { Injectable, inject } from '@angular/core';

import { FLIGHT_CONFIG } from '../../flight/config/flight-config';
import type { AuthoritativeFlightStepSnapshot } from '../models/authoritative-flight-step-snapshot';
import type {
  AuthoritativeFlightStepObserver,
  FlightRuntimeStepPort,
} from '../ports/flight-runtime-step.port';
import { FlightSimulationClock } from './flight-simulation-clock.service';

export type AuthoritativeStepObserverFailureHandler = (
  observerId: string,
  error: unknown,
  snapshot: Readonly<AuthoritativeFlightStepSnapshot>,
) => void;

/**
 * Synchronous publisher for completed authoritative fixed steps.
 *
 * Failure policy:
 * - Each observer is invoked in registration order inside a try/catch.
 * - One observer failure is reported via the failure handler (default: console.error)
 *   and does not prevent subsequent observers from running.
 * - The flight loop must not silently corrupt state; failures are diagnostic only.
 * - Mission infrastructure may later transition to an infrastructure-failure state.
 */
@Injectable({ providedIn: 'root' })
export class AuthoritativeFlightStepPublisher implements FlightRuntimeStepPort {
  private readonly clock = inject(FlightSimulationClock);
  private readonly observers: AuthoritativeFlightStepObserver[] = [];
  private failureHandler: AuthoritativeStepObserverFailureHandler = (
    observerId,
    error,
  ) => {
    console.error(
      `[AuthoritativeFlightStepPublisher] observer "${observerId}" failed`,
      error,
    );
  };

  setFailureHandler(handler: AuthoritativeStepObserverFailureHandler | null): void {
    this.failureHandler =
      handler ??
      ((observerId, error) => {
        console.error(
          `[AuthoritativeFlightStepPublisher] observer "${observerId}" failed`,
          error,
        );
      });
  }

  subscribe(observer: AuthoritativeFlightStepObserver): void {
    if (!observer?.id) {
      throw new Error('AuthoritativeFlightStepObserver.id is required');
    }
    if (this.observers.some((o) => o.id === observer.id)) {
      throw new Error(
        `AuthoritativeFlightStepObserver "${observer.id}" is already registered`,
      );
    }
    this.observers.push(observer);
  }

  unsubscribe(observerId: string): void {
    const index = this.observers.findIndex((o) => o.id === observerId);
    if (index >= 0) {
      this.observers.splice(index, 1);
    }
  }

  clearObservers(): void {
    this.observers.length = 0;
  }

  observerIds(): readonly string[] {
    return this.observers.map((o) => o.id);
  }

  publish(snapshot: Readonly<AuthoritativeFlightStepSnapshot>): void {
    // Copy the list so teardown during notification cannot skip peers.
    const list = this.observers.slice();
    for (const observer of list) {
      try {
        observer.onAuthoritativeFixedStep(snapshot);
      } catch (error) {
        this.failureHandler(observer.id, error, snapshot);
      }
    }
  }

  resetSession(fixedStepSeconds: number = FLIGHT_CONFIG.physicsStep): number {
    return this.clock.resetSession(fixedStepSeconds);
  }

  currentTick(): number {
    return this.clock.currentTick();
  }

  currentSessionGeneration(): number {
    return this.clock.sessionGeneration();
  }

  fixedStepSeconds(): number {
    return this.clock.fixedStepSeconds();
  }

  /**
   * Increments the clock and returns the tick after increment.
   * Call after collision correction, before publish.
   */
  completeFixedStep(): number {
    return this.clock.completeFixedStep();
  }
}
