import { Injectable } from '@angular/core';

import { isFiniteNumber, isFiniteQuat, isFiniteVec3 } from '@fpv/simulation-contracts';

import type {
  AircraftSourceType,
  AuthoritativeCollisionOutcomeSummary,
  AuthoritativeFlightStepSnapshot,
} from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import { FLIGHT_RUNTIME_COMPATIBILITY_VERSION } from '../../flight-runtime/models/authoritative-flight-step-snapshot';

export interface MissionAircraftSnapshotSource {
  readonly simulationTick: number;
  readonly fixedStepSeconds: number;
  readonly sessionGeneration: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly orientation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly linearVelocity: { readonly x: number; readonly y: number; readonly z: number };
  readonly bodyAngularVelocity: {
    readonly pitch: number;
    readonly yaw: number;
    readonly roll: number;
  };
  readonly armed: boolean;
  readonly crashed: boolean;
  readonly altitudeMeters: number;
  readonly speedMps: number;
  readonly aircraftId: string;
  readonly aircraftSourceType: AircraftSourceType;
  readonly definitionVersion: string | null;
  readonly physicsProfileVersion: string | null;
  readonly collisionOutcome: AuthoritativeCollisionOutcomeSummary;
}

export type MissionAircraftSnapshotAdaptResult =
  | { readonly ok: true; readonly snapshot: AuthoritativeFlightStepSnapshot }
  | { readonly ok: false; readonly reason: string };

/**
 * Maps final corrected runtime state into an immutable authoritative snapshot.
 * No Angular signals, Three.js, Rapier, or controller data escapes.
 * Does not build photo evidence or score.
 */
@Injectable({ providedIn: 'root' })
export class MissionAircraftSnapshotAdapter {
  adapt(source: MissionAircraftSnapshotSource): MissionAircraftSnapshotAdaptResult {
    if (!Number.isInteger(source.simulationTick) || source.simulationTick < 0) {
      return { ok: false, reason: 'simulationTick must be a non-negative integer' };
    }
    if (!isFiniteNumber(source.fixedStepSeconds) || source.fixedStepSeconds <= 0) {
      return { ok: false, reason: 'fixedStepSeconds must be finite and > 0' };
    }
    if (!Number.isInteger(source.sessionGeneration) || source.sessionGeneration < 0) {
      return { ok: false, reason: 'sessionGeneration must be a non-negative integer' };
    }
    if (!isFiniteVec3(source.position)) {
      return { ok: false, reason: 'position must be finite' };
    }
    if (!isFiniteQuat(source.orientation)) {
      return { ok: false, reason: 'orientation must be finite' };
    }
    if (!isFiniteVec3(source.linearVelocity)) {
      return { ok: false, reason: 'linearVelocity must be finite' };
    }
    const av = source.bodyAngularVelocity;
    if (
      !isFiniteNumber(av.pitch) ||
      !isFiniteNumber(av.yaw) ||
      !isFiniteNumber(av.roll)
    ) {
      return { ok: false, reason: 'bodyAngularVelocity must be finite' };
    }
    if (!isFiniteNumber(source.altitudeMeters) || !isFiniteNumber(source.speedMps)) {
      return { ok: false, reason: 'altitude/speed must be finite' };
    }
    if (!source.aircraftId) {
      return { ok: false, reason: 'aircraftId required' };
    }

    const snapshot: AuthoritativeFlightStepSnapshot = {
      simulationTick: source.simulationTick,
      fixedStepSeconds: source.fixedStepSeconds,
      sessionGeneration: source.sessionGeneration,
      pose: {
        position: { ...source.position },
        orientation: { ...source.orientation },
      },
      linearVelocity: { ...source.linearVelocity },
      bodyAngularVelocity: { ...source.bodyAngularVelocity },
      armed: source.armed,
      crashed: source.crashed,
      altitudeMeters: source.altitudeMeters,
      speedMps: source.speedMps,
      aircraftId: source.aircraftId,
      aircraftSourceType: source.aircraftSourceType,
      definitionVersion: source.definitionVersion,
      physicsProfileVersion: source.physicsProfileVersion,
      collisionOutcome: source.collisionOutcome,
      runtimeCompatibilityVersion:
        source.physicsProfileVersion ?? FLIGHT_RUNTIME_COMPATIBILITY_VERSION,
    };

    return { ok: true, snapshot };
  }

  isStale(
    snapshot: AuthoritativeFlightStepSnapshot,
    expectedSessionGeneration: number,
  ): boolean {
    return snapshot.sessionGeneration !== expectedSessionGeneration;
  }
}
