import { Injectable, inject } from '@angular/core';

import type { CameraSnapshot } from '@fpv/simulation-contracts';

import type { AuthoritativeFlightStepSnapshot } from '../../flight-runtime/models/authoritative-flight-step-snapshot';
import type { AuthoritativeFlightStepObserver } from '../../flight-runtime/ports/flight-runtime-step.port';
import { AuthoritativeFlightStepPublisher } from '../../flight-runtime/services/authoritative-flight-step-publisher.service';
import { FlightCameraSnapshotAdapter } from '../../camera/services/flight-camera-snapshot-adapter.service';
import type { ResolvedFlightCameraRig } from '../../camera/models/resolved-flight-camera-rig';
import { UnavailableMissionSpatialQueryAdapter } from '../adapters/unavailable-mission-spatial-query.adapter';
import { MISSION_SPATIAL_QUERY } from '../ports/mission-spatial-query.token';
import type { MissionSpatialQueryPort } from '../ports/mission-spatial-query.port';
import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import { MissionSessionFacade } from './mission-session.facade';
import { LocationLoadCoordinator } from './location-load-coordinator.service';
import type { PhotoEvidenceCameraRigContext } from './photo-evidence-builder.service';

export const MISSION_RUNTIME_OBSERVER_ID = 'mission-runtime-coordinator';

export interface MissionRuntimeObservation {
  readonly flight: AuthoritativeFlightStepSnapshot;
  readonly camera: CameraSnapshot | null;
  /** Canonical resolved-rig provenance for the same fixed step (null when no rig). */
  readonly cameraRig: PhotoEvidenceCameraRigContext | null;
  readonly missionElapsedTicks: number;
}

function cameraRigContextFromResolved(
  rig: ResolvedFlightCameraRig,
): PhotoEvidenceCameraRigContext {
  return {
    rigId: rig.rigId,
    rigVersion: rig.rigVersion,
    resolutionStrategy: rig.resolutionStrategy,
    cameraTiltRad: rig.localCameraTiltRad,
    templateDerivedCamera: rig.templateDerivedCamera,
  };
}

/**
 * Subscribes synchronously to authoritative completed fixed steps and forwards
 * immutable observations. Does not score photography, create screenshots,
 * persist results, or own the simulation loop.
 */
@Injectable({ providedIn: 'root' })
export class MissionRuntimeCoordinator implements AuthoritativeFlightStepObserver {
  readonly id = MISSION_RUNTIME_OBSERVER_ID;

  private readonly publisher = inject(AuthoritativeFlightStepPublisher);
  private readonly facade = inject(MissionSessionFacade);
  private readonly cameraSnapshots = inject(FlightCameraSnapshotAdapter);
  private readonly spatial = inject(MISSION_SPATIAL_QUERY, {
    optional: true,
  }) as MissionSpatialQueryPort | null;
  private readonly spatialFallback = inject(UnavailableMissionSpatialQueryAdapter);
  private readonly locationLoad = inject(LocationLoadCoordinator);

  private get spatialPort(): MissionSpatialQueryPort {
    return this.spatial ?? this.spatialFallback;
  }

  private subscribed = false;
  private expectedSessionGeneration: number | null = null;
  private lastObservation: MissionRuntimeObservation | null = null;
  private readonly observationListeners: Array<(obs: MissionRuntimeObservation) => void> =
    [];

  attach(sessionGeneration: number): void {
    this.detach();
    this.expectedSessionGeneration = sessionGeneration;
    this.publisher.subscribe(this);
    this.subscribed = true;
    this.facade.markActive();
  }

  detach(): void {
    if (this.subscribed) {
      this.publisher.unsubscribe(this.id);
      this.subscribed = false;
    }
    this.expectedSessionGeneration = null;
    this.lastObservation = null;
  }

  /**
   * Retry preparation: detach then attach under a new session generation so
   * observers are never duplicated.
   */
  prepareRetry(sessionGeneration: number): void {
    this.attach(sessionGeneration);
  }

  onAuthoritativeFixedStep(snapshot: Readonly<AuthoritativeFlightStepSnapshot>): void {
    if (
      this.expectedSessionGeneration !== null &&
      snapshot.sessionGeneration !== this.expectedSessionGeneration
    ) {
      this.facade.reportFailure({
        code: 'STALE_RUNTIME_SESSION',
        message: 'Rejected stale authoritative step for prior mission session',
        details: {
          expected: this.expectedSessionGeneration,
          received: snapshot.sessionGeneration,
        },
      });
      return;
    }

    let camera: CameraSnapshot | null = null;
    let cameraRig: PhotoEvidenceCameraRigContext | null = null;
    try {
      const rig = this.cameraSnapshots.getActiveRig();
      if (rig) {
        camera = this.cameraSnapshots.buildSnapshot(
          snapshot.pose.position,
          snapshot.pose.orientation,
          rig,
        );
        cameraRig = cameraRigContextFromResolved(rig);
      }
    } catch (error) {
      this.facade.reportFailure({
        code: 'CAMERA_RIG_RESOLUTION_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const observation: MissionRuntimeObservation = {
      flight: snapshot,
      camera,
      cameraRig,
      missionElapsedTicks: snapshot.simulationTick,
    };
    this.lastObservation = observation;
    for (const listener of this.observationListeners) {
      try {
        listener(observation);
      } catch (error) {
        this.facade.reportFailure({
          code: 'AUTHORITATIVE_STEP_OBSERVER_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  addObservationListener(listener: (obs: MissionRuntimeObservation) => void): void {
    this.observationListeners.push(listener);
  }

  clearObservationListeners(): void {
    this.observationListeners.length = 0;
  }

  last(): MissionRuntimeObservation | null {
    return this.lastObservation;
  }

  probeSpatialQuery(): MissionRuntimeDiagnostic | null {
    if (this.spatialPort.isAvailable()) {
      return null;
    }
    const probe = this.spatialPort.queryLineOfSight({
      startWorld: { x: 0, y: 0, z: 0 },
      endWorld: { x: 0, y: 0, z: -1 },
    });
    return {
      code: 'SPATIAL_QUERY_UNAVAILABLE',
      message: probe.diagnosticMessage ?? 'Spatial query unavailable',
    };
  }

  async exitAndTeardown(): Promise<void> {
    this.facade.beginExit();
    this.detach();
    this.clearObservationListeners();
    this.cameraSnapshots.clearActiveRig();
    await this.locationLoad.unload();
    this.facade.reset();
  }

  isSubscribed(): boolean {
    return this.subscribed;
  }
}
