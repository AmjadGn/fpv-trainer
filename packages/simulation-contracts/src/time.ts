/**
 * Deterministic simulation time contracts.
 *
 * The simulation clock is defined purely in terms of a fixed-step tick
 * counter — there is no wall-clock time here. Callers that need wall-clock
 * time (e.g. for telemetry timestamps) own that conversion themselves;
 * this module intentionally has no `Date` / `performance.now` dependency
 * so it stays deterministic and replayable.
 */

import { brandNumber, type Brand } from './ids';

/** A non-negative integer tick count identifying a simulation frame. */
export type SimulationTick = Brand<number, 'SimulationTick'>;

/** A non-negative integer count of ticks elapsed between two instants. */
export type ElapsedTicks = Brand<number, 'ElapsedTicks'>;

/** Seconds represented by a single fixed simulation step. Always > 0. */
export type FixedStepDuration = Brand<number, 'FixedStepDuration'>;

function isNonNegativeInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/**
 * Brands `value` as a `SimulationTick`.
 * Throws if `value` is not a finite non-negative integer — ticks are a
 * structural invariant of the simulation loop, not ordinary user input.
 */
export function asSimulationTick(value: number): SimulationTick {
  if (!isNonNegativeInteger(value)) {
    throw new Error(`SimulationTick must be a non-negative integer, got: ${value}`);
  }
  return brandNumber<'SimulationTick'>(value);
}

/**
 * Brands `value` as `ElapsedTicks`.
 * Throws if `value` is not a finite non-negative integer.
 */
export function asElapsedTicks(value: number): ElapsedTicks {
  if (!isNonNegativeInteger(value)) {
    throw new Error(`ElapsedTicks must be a non-negative integer, got: ${value}`);
  }
  return brandNumber<'ElapsedTicks'>(value);
}

/**
 * Creates a `FixedStepDuration` (seconds per simulation tick).
 * Throws if `secondsPerTick` is not a finite, strictly positive number.
 */
export function createFixedStepDuration(secondsPerTick: number): FixedStepDuration {
  if (!Number.isFinite(secondsPerTick) || secondsPerTick <= 0) {
    throw new Error(
      `FixedStepDuration must be a positive finite number of seconds, got: ${secondsPerTick}`,
    );
  }
  return brandNumber<'FixedStepDuration'>(secondsPerTick);
}

/** Converts an elapsed tick count to seconds under a fixed step duration. */
export function ticksToSeconds(
  ticks: ElapsedTicks | SimulationTick,
  step: FixedStepDuration,
): number {
  return (ticks as number) * (step as number);
}

/**
 * Converts a duration in seconds to a whole tick count under a fixed step
 * duration.
 *
 * Policy: floor. Seconds-to-ticks conversion always rounds *down* so that
 * simulating forward by a given wall-clock budget never advances the
 * simulation clock past that budget (avoids time travel / skipped input
 * windows). Callers that need "nearest tick" behavior should round the
 * seconds value themselves before calling this function.
 */
export function secondsToTicks(seconds: number, step: FixedStepDuration): ElapsedTicks {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`secondsToTicks requires a finite non-negative seconds value, got: ${seconds}`);
  }
  const ticks = Math.floor(seconds / (step as number));
  return asElapsedTicks(ticks);
}
