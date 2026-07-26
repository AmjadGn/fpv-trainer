import type { AuthoritativeFlightStepSnapshot } from '../models/authoritative-flight-step-snapshot';

/**
 * Synchronous observer of completed authoritative fixed steps.
 * Observers must not mutate flight state.
 */
export interface AuthoritativeFlightStepObserver {
  readonly id: string;
  onAuthoritativeFixedStep(snapshot: Readonly<AuthoritativeFlightStepSnapshot>): void;
}

/**
 * Port for publishing completed steps and managing observer lifecycle.
 * Deterministic registration order; synchronous notification; no RxJS timing.
 */
export interface FlightRuntimeStepPort {
  subscribe(observer: AuthoritativeFlightStepObserver): void;
  unsubscribe(observerId: string): void;
  clearObservers(): void;
  publish(snapshot: Readonly<AuthoritativeFlightStepSnapshot>): void;
  resetSession(fixedStepSeconds: number): number;
  currentTick(): number;
  currentSessionGeneration(): number;
  fixedStepSeconds(): number;
}
