/**
 * Opaque runtime session identity for stale-callback rejection and
 * mission/free-flight isolation.
 */

export interface FlightRuntimeSession {
  readonly sessionGeneration: number;
  readonly started: boolean;
  readonly tick: number;
  readonly fixedStepSeconds: number;
}

export function createIdleFlightRuntimeSession(
  fixedStepSeconds: number,
): FlightRuntimeSession {
  return {
    sessionGeneration: 0,
    started: false,
    tick: 0,
    fixedStepSeconds,
  };
}
