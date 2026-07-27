import { Injectable, computed, inject, signal } from '@angular/core';

import type { BoundaryShape, PhotographySubjectDefinition } from '@fpv/location-domain';
import type { MissionDefinition } from '@fpv/mission-domain';
import type {
  PhotographyObjectiveDefinition,
  PhotographyScoringPolicy,
} from '@fpv/photography-domain';

import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import {
  DEFAULT_FIXED_STEP_SECONDS,
  MissionBoundaryRuntime,
  OUT_OF_BOUNDS_GRACE_SECONDS,
  authoredGraceTicksToSeconds,
  type MissionBoundaryWarningState,
} from './mission-boundary-runtime';
import { MissionObjectiveRuntime } from './mission-objective-runtime.service';
import type { MissionResultAircraftContext } from './mission-presentation-image-settlement';
import { MissionResultsFacade } from './mission-results.facade';
import {
  MissionRuntimeCoordinator,
  type MissionRuntimeObservation,
} from './mission-runtime-coordinator.service';
import { MissionSessionFacade } from './mission-session.facade';
import {
  PhotoCaptureCoordinator,
  type PhotoCaptureRequestAck,
} from './photo-capture-coordinator.service';
import type { MissionZoneShape } from './photo-evidence-builder.service';
import {
  PhotoStabilityWindow,
  bodyAngularSpeedMagnitude,
  type PhotoStabilityWindowSnapshot,
} from './photo-stability-window';

export interface PhotographyMissionRuntimeBeginInput {
  readonly mission: MissionDefinition;
  readonly photographyObjectives: readonly PhotographyObjectiveDefinition[];
  readonly scoringPolicy: PhotographyScoringPolicy;
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly locationGeneration: number;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly subjects: readonly PhotographySubjectDefinition[];
  /** Playable/hard boundary the out-of-bounds grace countdown is evaluated against. */
  readonly boundaryShape: BoundaryShape | null;
  readonly zones?: readonly MissionZoneShape[];
  readonly fixedStepSeconds?: number;
}

export type PhotographyMissionRuntimeBeginResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostic: MissionRuntimeDiagnostic };

interface ActiveMissionContext {
  readonly mission: MissionDefinition;
  readonly scoringPolicy: PhotographyScoringPolicy;
  readonly sessionId: string;
  readonly locationGeneration: number;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly subjects: readonly PhotographySubjectDefinition[];
  readonly zones: readonly MissionZoneShape[];
  /** Authored photography-objective versions keyed by mission objective id. */
  readonly objectiveVersions: ReadonlyMap<string, string>;
}

/**
 * Thin orchestrator for the photography mission loop.
 *
 * Attaches exactly one observation listener to `MissionRuntimeCoordinator`
 * and, per authoritative fixed step, drives stability, boundary grace, crash
 * failure, pending-shutter consumption, and objective progression. It owns no
 * loop of its own: no RAF, no second Rapier world, no rendering. Durable
 * persistence is triggered by `MissionResultsFacade` after results are set.
 */
@Injectable({ providedIn: 'root' })
export class PhotographyMissionRuntime {
  private readonly runtimeCoordinator = inject(MissionRuntimeCoordinator);
  private readonly objectiveRuntime = inject(MissionObjectiveRuntime);
  private readonly captureCoordinator = inject(PhotoCaptureCoordinator);
  private readonly results = inject(MissionResultsFacade);
  private readonly sessionFacade = inject(MissionSessionFacade);

  private readonly stabilityWindow = new PhotoStabilityWindow();
  private readonly boundaryRuntime = new MissionBoundaryRuntime();

  private context: ActiveMissionContext | null = null;
  private sessionGeneration: number | null = null;
  private fixedStepSeconds = DEFAULT_FIXED_STEP_SECONDS;
  private listener: ((observation: MissionRuntimeObservation) => void) | null = null;
  private boundStabilityObjectiveId: string | null = null;
  private crashHandled = false;
  private resultsPrepared = false;
  private paused = false;
  private cameraModeFpv = true;
  /**
   * Trusted aircraft metadata from the latest valid authoritative observation
   * for the active session. Never sourced from Hangar/UI selection state.
   */
  private trustedAircraftContext: MissionResultAircraftContext | null = null;

  private readonly boundaryStateSignal = signal<MissionBoundaryWarningState>(
    this.boundaryRuntime.state(),
  );
  private readonly stabilitySignal = signal<PhotoStabilityWindowSnapshot | null>(null);
  private readonly diagnosticsSignal = signal<readonly MissionRuntimeDiagnostic[]>([]);
  private readonly photographyObjectiveActiveSignal = signal(false);

  readonly boundaryState = this.boundaryStateSignal.asReadonly();
  readonly stability = this.stabilitySignal.asReadonly();
  readonly diagnostics = this.diagnosticsSignal.asReadonly();
  readonly photographyObjectiveActive = this.photographyObjectiveActiveSignal.asReadonly();
  readonly capturePending = this.captureCoordinator.capturePending;
  readonly lastCaptureOutcome = this.captureCoordinator.lastOutcome;
  readonly objectivePresentation = this.objectiveRuntime.presentation;
  readonly stableForCapture = computed(() => this.stabilitySignal()?.isStable === true);

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Begins the mission loop after `MissionLaunchCoordinator` has prepared the session. */
  begin(input: PhotographyMissionRuntimeBeginInput): PhotographyMissionRuntimeBeginResult {
    const photographyObjectives = new Map(
      input.photographyObjectives.map((objective) => [String(objective.objectiveId), objective]),
    );

    const started = this.objectiveRuntime.beginSession({
      mission: input.mission,
      photographyObjectives,
      scoringPolicy: input.scoringPolicy,
      sessionId: input.sessionId,
    });
    if (!started.ok) {
      this.pushDiagnostic(started.diagnostic);
      return started;
    }

    this.context = {
      mission: input.mission,
      scoringPolicy: input.scoringPolicy,
      sessionId: input.sessionId,
      locationGeneration: input.locationGeneration,
      locationId: input.locationId,
      locationVersion: input.locationVersion,
      subjects: input.subjects,
      zones: input.zones ?? [],
      objectiveVersions: buildObjectiveVersionMap(input.mission, photographyObjectives),
    };
    this.sessionGeneration = input.sessionGeneration;
    this.fixedStepSeconds = input.fixedStepSeconds ?? DEFAULT_FIXED_STEP_SECONDS;
    this.crashHandled = false;
    this.resultsPrepared = false;
    this.paused = false;
    this.trustedAircraftContext = null;
    this.captureCoordinator.reset();
    this.results.clear();
    this.diagnosticsSignal.set([]);

    this.configureBoundary(input.mission, input.boundaryShape, input.sessionGeneration);
    this.rebindStabilityWindow();
    this.attachListener();
    this.refreshPredicates();
    return { ok: true };
  }

  /**
   * Full mission retry on the same loaded location. The caller supplies the
   * new flight session generation (the flight clock owns generations).
   */
  retry(sessionGeneration: number): PhotographyMissionRuntimeBeginResult {
    if (!this.context) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'MISSION_RETRY_RUNTIME_UNAVAILABLE',
        message: 'No photography mission runtime is attached to retry',
      };
      this.pushDiagnostic(diagnostic);
      return { ok: false, diagnostic };
    }

    const retried = this.objectiveRuntime.retryFullMission();
    if (!retried.ok) {
      this.pushDiagnostic(retried.diagnostic);
      return retried;
    }

    this.sessionGeneration = sessionGeneration;
    this.crashHandled = false;
    this.resultsPrepared = false;
    this.paused = false;
    this.trustedAircraftContext = null;
    this.captureCoordinator.reset();
    this.results.clear();
    this.boundaryRuntime.rebindSession(sessionGeneration);
    this.boundaryStateSignal.set(this.boundaryRuntime.state());
    this.boundStabilityObjectiveId = null;
    this.stabilityWindow.reset();
    this.rebindStabilityWindow();
    this.attachListener();
    this.refreshPredicates();
    return { ok: true };
  }

  /** Clears pending captures, revokes presentation images, detaches once. */
  exit(): void {
    this.captureCoordinator.reset();
    this.results.clear();
    this.detachListener();
    this.stabilityWindow.reset();
    this.boundaryRuntime.clear();
    this.boundaryStateSignal.set(this.boundaryRuntime.state());
    this.stabilitySignal.set(null);
    this.objectiveRuntime.reset();
    this.context = null;
    this.sessionGeneration = null;
    this.fixedStepSeconds = DEFAULT_FIXED_STEP_SECONDS;
    this.boundStabilityObjectiveId = null;
    this.crashHandled = false;
    this.resultsPrepared = false;
    this.trustedAircraftContext = null;
    this.photographyObjectiveActiveSignal.set(false);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.refreshPredicates();
  }

  setCameraModeFpv(cameraModeFpv: boolean): void {
    this.cameraModeFpv = cameraModeFpv;
    this.refreshPredicates();
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  /** Shutter entry point for the Angular UI. */
  requestPhotoCapture(): PhotoCaptureRequestAck {
    const context = this.context;
    const sessionGeneration = this.sessionGeneration;
    if (!context || sessionGeneration === null) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'PHOTO_CAPTURE_NOT_ACTIVE',
        message: 'No photography mission runtime is attached',
      };
      return { accepted: false, diagnostic };
    }
    if (this.paused) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'PHOTO_CAPTURE_NOT_ACTIVE',
        message: 'Photo capture is unavailable while the mission is paused',
      };
      return { accepted: false, diagnostic };
    }
    if (!this.cameraModeFpv) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'PHOTO_CAPTURE_WRONG_CAMERA_MODE',
        message: 'Photo capture requires the FPV camera mode',
      };
      return { accepted: false, diagnostic };
    }
    const active = this.objectiveRuntime.getActivePhotographyObjective();
    if (!active) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'PHOTO_CAPTURE_NOT_ACTIVE',
        message: 'No photography objective is currently active',
      };
      return { accepted: false, diagnostic };
    }

    return this.captureCoordinator.requestPhotoCapture({
      sessionGeneration,
      objectiveId: active.photographyObjectiveId,
      sessionId: context.sessionId,
    });
  }

  // -------------------------------------------------------------------------
  // Fixed-step driving
  // -------------------------------------------------------------------------

  private onObservation(observation: MissionRuntimeObservation): void {
    const context = this.context;
    const sessionGeneration = this.sessionGeneration;
    if (!context || sessionGeneration === null) {
      return;
    }
    if (observation.flight.sessionGeneration !== sessionGeneration) {
      return;
    }
    this.cacheTrustedAircraftContext(observation);
    if (this.paused) {
      // Paused steps must not accumulate stability or boundary grace.
      return;
    }
    if (!this.objectiveRuntime.isActive()) {
      return;
    }

    this.syncFixedStepSeconds(observation.flight.fixedStepSeconds);
    this.objectiveRuntime.onAuthoritativeTick(observation.flight.simulationTick);

    if (observation.flight.crashed) {
      this.handleMissionFailure('AIRCRAFT_CRASHED');
      return;
    }

    const boundaryOutcome = this.boundaryRuntime.observe(
      observation.flight.simulationTick,
      observation.flight.pose.position,
      sessionGeneration,
    );
    this.boundaryStateSignal.set(this.boundaryRuntime.state());
    if (boundaryOutcome === 'expired') {
      this.handleMissionFailure('OUT_OF_BOUNDS');
      return;
    }

    const active = this.rebindStabilityWindow();
    if (active) {
      this.stabilityWindow.observe(
        observation.flight.simulationTick,
        observation.flight.speedMps,
        bodyAngularSpeedMagnitude(observation.flight.bodyAngularVelocity),
        sessionGeneration,
        active.photographyObjectiveId,
      );
      this.stabilitySignal.set(
        this.stabilityWindow.snapshot(
          active.definition.stabilityDurationTicks as unknown as number,
        ),
      );
    } else {
      this.stabilitySignal.set(null);
    }

    // A queued shutter is always consumed — either scored, or rejected with a
    // stable diagnostic — so it can never survive into a later objective.
    if (this.captureCoordinator.hasPendingCapture()) {
      this.captureCoordinator.onAuthoritativeObservation(observation, {
        paused: this.paused,
        cameraModeFpv: this.cameraModeFpv,
        sessionGeneration,
        locationGeneration: context.locationGeneration,
        sessionId: context.sessionId,
        missionId: String(context.mission.missionId),
        missionVersion: String(context.mission.versions.version),
        locationId: context.locationId,
        locationVersion: context.locationVersion,
        subjects: context.subjects,
        zones: context.zones,
        stability: this.stabilitySignal() ?? this.stabilityWindow.snapshot(0),
        scoringPolicy: context.scoringPolicy,
      });
    }

    if (this.objectiveRuntime.missionState() === 'missionCompleted') {
      this.prepareResults();
    }
    this.refreshPredicates();
  }

  private handleMissionFailure(reason: 'AIRCRAFT_CRASHED' | 'OUT_OF_BOUNDS'): void {
    if (reason === 'AIRCRAFT_CRASHED') {
      if (this.crashHandled) {
        return;
      }
      this.crashHandled = true;
    }
    this.captureCoordinator.clearPending();
    if (this.objectiveRuntime.failMission(reason)) {
      this.prepareResults();
    }
    this.refreshPredicates();
  }

  private prepareResults(): void {
    const context = this.context;
    if (!context || this.resultsPrepared) {
      return;
    }
    const record = this.objectiveRuntime.completeMissionAndPrepareResults();
    if (!record) {
      this.pushDiagnostic({
        code: 'MISSION_RESULT_AGGREGATION_FAILED',
        message: 'Mission results could not be aggregated',
      });
      return;
    }
    this.resultsPrepared = true;

    const sessionGeneration = this.sessionGeneration ?? 0;
    const expectedObjectiveIds = record.objectiveResults
      .filter(
        (objective) =>
          objective.status === 'completed' && Boolean(objective.photographyEvaluationRef),
      )
      .map((objective) => String(objective.objectiveId));

    const settlement = this.captureCoordinator.createPresentationSettlement({
      sessionId: context.sessionId,
      sessionGeneration,
      resultId: String(record.resultId),
      expectedObjectiveIds,
    });

    const aircraft = this.trustedAircraftContext;
    if (!aircraft) {
      this.pushDiagnostic({
        code: 'MISSION_PERSISTENCE_RECORD_INVALID',
        message:
          'Trusted aircraft metadata was unavailable from the authoritative flight runtime; gameplay result will save without fabricated aircraft identity.',
      });
    }

    this.results.setResult({
      record,
      mission: context.mission,
      evaluations: this.objectiveRuntime.acceptedEvaluationsSnapshot(),
      attemptCounts: this.objectiveRuntime.attemptCountsSnapshot(),
      fixedStepSeconds: this.fixedStepSeconds,
      scoringPolicyVersion: context.scoringPolicy.policyVersion,
      sessionGeneration,
      locationId: context.locationId,
      locationVersion: context.locationVersion,
      objectiveVersions: context.objectiveVersions,
      aircraftContext: aircraft,
      presentationSettlement: settlement,
    });
  }

  /**
   * Caches immutable trusted aircraft metadata from the authoritative fixed-step
   * observation. Never reads Hangar, controller, or renderer selection state.
   */
  private cacheTrustedAircraftContext(observation: MissionRuntimeObservation): void {
    const flight = observation.flight;
    if (!flight.aircraftId || !flight.aircraftSourceType || !flight.runtimeCompatibilityVersion) {
      return;
    }
    if (
      flight.aircraftSourceType !== 'factory' &&
      flight.aircraftSourceType !== 'user-compiled'
    ) {
      return;
    }
    this.trustedAircraftContext = {
      aircraftId: flight.aircraftId,
      aircraftSourceType: flight.aircraftSourceType,
      definitionVersion: flight.definitionVersion,
      physicsProfileVersion: flight.physicsProfileVersion,
      runtimeCompatibilityVersion: flight.runtimeCompatibilityVersion,
    };
  }

  /** The authoritative step rate is owned by the flight clock, not by us. */
  private syncFixedStepSeconds(fixedStepSeconds: number): void {
    if (!Number.isFinite(fixedStepSeconds) || fixedStepSeconds <= 0) {
      return;
    }
    if (fixedStepSeconds === this.fixedStepSeconds) {
      return;
    }
    this.fixedStepSeconds = fixedStepSeconds;
    this.boundaryRuntime.updateFixedStepSeconds(fixedStepSeconds);
    this.boundaryStateSignal.set(this.boundaryRuntime.state());
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private attachListener(): void {
    if (this.listener) {
      return;
    }
    const listener = (observation: MissionRuntimeObservation): void => {
      this.onObservation(observation);
    };
    this.listener = listener;
    this.runtimeCoordinator.addObservationListener(listener);
  }

  private detachListener(): void {
    if (!this.listener) {
      return;
    }
    this.listener = null;
    this.runtimeCoordinator.clearObservationListeners();
  }

  private configureBoundary(
    mission: MissionDefinition,
    boundaryShape: BoundaryShape | null,
    sessionGeneration: number,
  ): void {
    if (!boundaryShape || !mission.failurePolicy.outOfBoundsAfterGrace.enabled) {
      this.boundaryRuntime.clear();
      this.boundaryStateSignal.set(this.boundaryRuntime.state());
      return;
    }
    const graceSeconds = authoredGraceTicksToSeconds(
      mission.failurePolicy.outOfBoundsAfterGrace.graceTicks as unknown as number,
    );
    this.boundaryRuntime.configure({
      shape: boundaryShape,
      graceSeconds: graceSeconds > 0 ? graceSeconds : OUT_OF_BOUNDS_GRACE_SECONDS,
      fixedStepSeconds: this.fixedStepSeconds,
      sessionGeneration,
    });
    this.boundaryStateSignal.set(this.boundaryRuntime.state());
  }

  /** Re-binds the stability window whenever the active objective changes. */
  private rebindStabilityWindow(): ReturnType<
    MissionObjectiveRuntime['getActivePhotographyObjective']
  > {
    const active = this.objectiveRuntime.getActivePhotographyObjective();
    const sessionGeneration = this.sessionGeneration;
    if (!active || sessionGeneration === null) {
      this.boundStabilityObjectiveId = null;
      return active;
    }
    if (this.boundStabilityObjectiveId !== active.photographyObjectiveId) {
      this.boundStabilityObjectiveId = active.photographyObjectiveId;
      this.stabilityWindow.beginObjective(sessionGeneration, active.photographyObjectiveId, {
        maxLinearSpeedMps: active.definition.maxLinearSpeedMps,
        maxBodyAngularSpeedRadps: active.definition.maxBodyAngularSpeedRadps,
      });
      this.stabilitySignal.set(
        this.stabilityWindow.snapshot(
          active.definition.stabilityDurationTicks as unknown as number,
        ),
      );
    }
    return active;
  }

  private refreshPredicates(): void {
    this.photographyObjectiveActiveSignal.set(
      this.objectiveRuntime.isPhotographyObjectiveActive(
        this.paused,
        this.cameraModeFpv,
        this.sessionFacade.snapshot().phase,
      ),
    );
  }

  private pushDiagnostic(diagnostic: MissionRuntimeDiagnostic): void {
    this.diagnosticsSignal.set([...this.diagnosticsSignal(), diagnostic]);
  }
}

/**
 * Maps mission objective ids → authored PhotographyObjectiveDefinition.version.
 * Persistence must not infer versions from index or objective count.
 */
function buildObjectiveVersionMap(
  mission: MissionDefinition,
  photographyObjectives: ReadonlyMap<string, PhotographyObjectiveDefinition>,
): ReadonlyMap<string, string> {
  const versions = new Map<string, string>();
  for (const declared of mission.objectives) {
    if (declared.kind !== 'photography') {
      continue;
    }
    const photo = photographyObjectives.get(declared.photographyObjectiveId);
    if (photo?.version) {
      versions.set(String(declared.objectiveId), photo.version);
    }
  }
  return versions;
}
