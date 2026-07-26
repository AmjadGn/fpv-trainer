/**
 * Immutable DTO emitted once per completed authoritative fixed step,
 * after Rapier collision correction has been applied to flight state.
 *
 * Plain readonly data only — no Angular signals, Three.js, Rapier handles,
 * controller axes, mission scores, or wall-clock timestamps.
 */

export type AircraftSourceType = 'factory' | 'user-compiled';

export interface AuthoritativeAircraftPose {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly orientation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
}

export interface AuthoritativeLinearVelocity {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Body-frame angular velocity (pitch / yaw / roll rad/s). */
export interface AuthoritativeBodyAngularVelocity {
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}

export type AuthoritativeCollisionOutcomeSummary =
  | 'none'
  | 'scrape'
  | 'moderate'
  | 'severe'
  | 'catastrophic'
  | 'safeLanding'
  | 'hardLanding'
  | 'waterCrash'
  | 'propStrike'
  | 'unavailable';

export interface AuthoritativeFlightStepSnapshot {
  /** Integer tick after this completed fixed step (1-based after first step; session starts at 0). */
  readonly simulationTick: number;
  /** Fixed-step duration in seconds for this step. */
  readonly fixedStepSeconds: number;
  /** Session generation; rejects stale observers across reset/retry. */
  readonly sessionGeneration: number;
  readonly pose: AuthoritativeAircraftPose;
  readonly linearVelocity: AuthoritativeLinearVelocity;
  readonly bodyAngularVelocity: AuthoritativeBodyAngularVelocity;
  readonly armed: boolean;
  readonly crashed: boolean;
  readonly altitudeMeters: number;
  readonly speedMps: number;
  readonly aircraftId: string;
  readonly aircraftSourceType: AircraftSourceType;
  readonly definitionVersion: string | null;
  readonly physicsProfileVersion: string | null;
  readonly collisionOutcome: AuthoritativeCollisionOutcomeSummary;
  readonly runtimeCompatibilityVersion: string;
}

export const FLIGHT_RUNTIME_COMPATIBILITY_VERSION = '1.3.0-runtime-c3';
