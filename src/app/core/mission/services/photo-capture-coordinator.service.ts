import { Injectable, inject, signal } from '@angular/core';

import type { PhotographySubjectDefinition } from '@fpv/location-domain';
import {
  evaluatePhotoCapture,
  type PhotoEvaluationResult,
  type PhotographyScoringPolicy,
} from '@fpv/photography-domain';

import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import {
  MISSION_PHOTO_PRESENTATION_CAPTURE,
  MISSION_PHOTO_PRESENTATION_HEIGHT,
  MISSION_PHOTO_PRESENTATION_WIDTH,
  type MissionPhotoPresentationCapturePort,
} from '../ports/mission-photo-presentation-capture.port';
import type { MissionRuntimeObservation } from './mission-runtime-coordinator.service';
import { MissionObjectiveRuntime } from './mission-objective-runtime.service';
import { MissionResultsFacade } from './mission-results.facade';
import { PhotoEvidenceBuilder, type MissionZoneShape } from './photo-evidence-builder.service';
import type { PhotoStabilityWindowSnapshot } from './photo-stability-window';

export interface PhotoCaptureRequest {
  readonly sessionGeneration: number;
  /** Photography objective id the shutter was pressed for. */
  readonly objectiveId: string;
  readonly sessionId: string;
}

export interface PhotoCaptureRequestAck {
  readonly accepted: boolean;
  readonly diagnostic?: MissionRuntimeDiagnostic;
}

/** Everything the consume step needs that the coordinator does not own. */
export interface PhotoCaptureConsumeContext {
  readonly paused: boolean;
  readonly cameraModeFpv: boolean;
  readonly sessionGeneration: number;
  readonly locationGeneration: number;
  readonly sessionId: string;
  readonly missionId: string;
  readonly missionVersion: string;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly subjects: readonly PhotographySubjectDefinition[];
  readonly zones: readonly MissionZoneShape[];
  readonly stability: PhotoStabilityWindowSnapshot;
  readonly scoringPolicy: PhotographyScoringPolicy;
}

export interface PhotoCaptureOutcome {
  readonly captureId: string | null;
  readonly missionObjectiveId: string | null;
  readonly photographyObjectiveId: string;
  readonly attemptNumber: number;
  readonly capturedAtTick: number;
  readonly passed: boolean;
  readonly evaluation: PhotoEvaluationResult | null;
  readonly diagnostic: MissionRuntimeDiagnostic | null;
}

interface PendingCapture extends PhotoCaptureRequest {
  readonly requestedAtTick: number | null;
}

/**
 * Queues at most one pending shutter and consumes it on the next
 * authoritative fixed step.
 *
 * Scoring is fully deterministic and independent of rendering: evidence is
 * built from the fixed-step observation, evaluated by
 * `@fpv/photography-domain`, and dispatched to `MissionObjectiveRuntime`.
 * The presentation image is requested afterwards and never gates the score.
 */
@Injectable({ providedIn: 'root' })
export class PhotoCaptureCoordinator {
  private readonly evidenceBuilder = inject(PhotoEvidenceBuilder);
  private readonly objectiveRuntime = inject(MissionObjectiveRuntime);
  private readonly results = inject(MissionResultsFacade);
  private readonly presentationCapture = inject(MISSION_PHOTO_PRESENTATION_CAPTURE, {
    optional: true,
  }) as MissionPhotoPresentationCapturePort | null;

  private pending: PendingCapture | null = null;
  /** Bumped on reset/clear so in-flight presentation promises cannot attach stale URLs. */
  private presentationEpoch = 0;

  private readonly lastOutcomeSignal = signal<PhotoCaptureOutcome | null>(null);
  private readonly pendingSignal = signal(false);

  readonly lastOutcome = this.lastOutcomeSignal.asReadonly();
  readonly capturePending = this.pendingSignal.asReadonly();

  /** Queues a shutter press. At most one capture may be pending at a time. */
  requestPhotoCapture(request: PhotoCaptureRequest): PhotoCaptureRequestAck {
    if (this.pending) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'PHOTO_CAPTURE_ALREADY_PENDING',
        message: 'A photo capture is already queued for the next authoritative step',
        details: { objectiveId: this.pending.objectiveId },
      };
      this.publishRejection(request, diagnostic);
      return { accepted: false, diagnostic };
    }

    const active = this.objectiveRuntime.getActivePhotographyObjective();
    if (!active) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'PHOTO_CAPTURE_NOT_ACTIVE',
        message: 'No photography objective is currently active',
      };
      this.publishRejection(request, diagnostic);
      return { accepted: false, diagnostic };
    }
    if (active.photographyObjectiveId !== request.objectiveId) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'PHOTO_CAPTURE_OBJECTIVE_STALE',
        message: 'Requested objective is not the active photography objective',
        details: { requested: request.objectiveId, active: active.photographyObjectiveId },
      };
      this.publishRejection(request, diagnostic);
      return { accepted: false, diagnostic };
    }

    this.pending = { ...request, requestedAtTick: null };
    this.pendingSignal.set(true);
    return { accepted: true };
  }

  hasPendingCapture(): boolean {
    return this.pending !== null;
  }

  /** Drops any queued shutter (pause-exit, retry, mission end, teardown). */
  clearPending(): void {
    this.pending = null;
    this.pendingSignal.set(false);
  }

  reset(): void {
    this.clearPending();
    this.presentationEpoch += 1;
    this.lastOutcomeSignal.set(null);
  }

  /**
   * Consumes at most one pending shutter against an authoritative fixed step.
   * While paused nothing is consumed and the request stays queued.
   */
  onAuthoritativeObservation(
    observation: MissionRuntimeObservation,
    context: PhotoCaptureConsumeContext,
  ): PhotoCaptureOutcome | null {
    const pending = this.pending;
    if (!pending || context.paused) {
      return null;
    }

    const active = this.objectiveRuntime.getActivePhotographyObjective();
    if (!active) {
      const alreadyCompleted = this.objectiveRuntime.isPhotographyObjectiveCompleted(
        pending.objectiveId,
      );
      return this.reject(pending, observation, {
        code: alreadyCompleted
          ? 'PHOTO_OBJECTIVE_ALREADY_COMPLETED'
          : 'PHOTO_CAPTURE_NOT_ACTIVE',
        message: alreadyCompleted
          ? 'Objective already has an accepted capture'
          : 'Mission is not in an active photography objective',
        details: { objectiveId: pending.objectiveId },
      });
    }
    if (!context.cameraModeFpv) {
      return this.reject(pending, observation, {
        code: 'PHOTO_CAPTURE_WRONG_CAMERA_MODE',
        message: 'Photo capture requires the FPV camera mode',
      });
    }
    if (
      pending.sessionGeneration !== context.sessionGeneration ||
      observation.flight.sessionGeneration !== context.sessionGeneration ||
      pending.sessionId !== context.sessionId
    ) {
      return this.reject(pending, observation, {
        code: 'PHOTO_CAPTURE_SESSION_STALE',
        message: 'Photo capture belongs to a previous flight session',
        details: {
          requested: pending.sessionGeneration,
          active: context.sessionGeneration,
          observed: observation.flight.sessionGeneration,
        },
      });
    }
    if (pending.objectiveId !== active.photographyObjectiveId) {
      return this.reject(pending, observation, {
        code: 'PHOTO_CAPTURE_OBJECTIVE_STALE',
        message: 'Active photography objective changed before the shutter was consumed',
        details: { requested: pending.objectiveId, active: active.photographyObjectiveId },
      });
    }
    if (observation.camera === null || observation.cameraRig === null) {
      return this.reject(pending, observation, {
        code: 'PHOTO_CAPTURE_EVIDENCE_INVALID',
        message: 'No canonical camera snapshot was available for this fixed step',
      });
    }

    const attemptNumber = active.attemptNumber;
    const built = this.evidenceBuilder.build({
      sessionId: context.sessionId,
      sessionGeneration: context.sessionGeneration,
      locationGeneration: context.locationGeneration,
      attemptNumber,
      missionId: context.missionId,
      missionVersion: context.missionVersion,
      locationId: context.locationId,
      locationVersion: context.locationVersion,
      scoringPolicyVersion: context.scoringPolicy.policyVersion,
      missionElapsedTicks: observation.missionElapsedTicks,
      flight: observation.flight,
      camera: observation.camera,
      cameraRig: observation.cameraRig,
      objective: active.definition,
      subjects: context.subjects,
      stability: context.stability,
      zones: context.zones,
    });
    if (!built.ok) {
      return this.reject(pending, observation, built.diagnostic);
    }

    let evaluation: PhotoEvaluationResult;
    try {
      evaluation = evaluatePhotoCapture(built.evidence, active.definition, context.scoringPolicy);
    } catch (error) {
      return this.reject(pending, observation, {
        code: 'PHOTO_CAPTURE_SCORING_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: { captureId: built.evidenceId },
      });
    }

    this.clearPending();

    const attempt = {
      missionObjectiveId: active.missionObjectiveId,
      attemptNumber,
      capturedAtTick: observation.flight.simulationTick,
      evidenceRef: built.evidenceId,
    };

    let diagnostic: MissionRuntimeDiagnostic | null = null;
    if (evaluation.passed) {
      const result = this.objectiveRuntime.createObjectiveResult(
        active.missionObjectiveId,
        evaluation,
        built.evidenceId,
      );
      const accepted = this.objectiveRuntime.acceptObjective(result, evaluation, attempt);
      if (!accepted.ok) {
        diagnostic = accepted.diagnostic;
      } else {
        void this.capturePresentationFrame(
          built.evidenceId,
          String(active.missionObjectiveId),
          observation,
        );
      }
    } else {
      this.objectiveRuntime.recordFailedAttempt(evaluation, attempt);
    }

    const outcome: PhotoCaptureOutcome = {
      captureId: built.evidenceId,
      missionObjectiveId: String(active.missionObjectiveId),
      photographyObjectiveId: active.photographyObjectiveId,
      attemptNumber,
      capturedAtTick: observation.flight.simulationTick,
      passed: evaluation.passed && diagnostic === null,
      evaluation,
      diagnostic,
    };
    this.lastOutcomeSignal.set(outcome);
    return outcome;
  }

  private async capturePresentationFrame(
    captureId: string,
    missionObjectiveId: string,
    observation: MissionRuntimeObservation,
  ): Promise<void> {
    const port = this.presentationCapture;
    const camera = observation.camera;
    if (!port || !camera) {
      return;
    }
    const epoch = this.presentationEpoch;
    try {
      const result = await port.capturePresentationFrame({
        captureId,
        cameraSnapshot: camera,
        width: MISSION_PHOTO_PRESENTATION_WIDTH,
        height: MISSION_PHOTO_PRESENTATION_HEIGHT,
      });
      if (epoch !== this.presentationEpoch) {
        // Retry/exit invalidated this request — revoke any URL we were given.
        if (result.ok && result.objectUrl) {
          revokePresentationUrl(result.objectUrl);
        }
        return;
      }
      if (result.ok && result.objectUrl) {
        this.results.attachPresentationImage(missionObjectiveId, result.objectUrl);
        return;
      }
      this.noteDiagnostic({
        code: 'PHOTO_PRESENTATION_CAPTURE_FAILED',
        message: result.diagnosticMessage ?? 'Presentation frame capture failed',
        details: { captureId, presentationDiagnosticCode: result.diagnosticCode ?? null },
      });
    } catch (error) {
      if (epoch !== this.presentationEpoch) {
        return;
      }
      this.noteDiagnostic({
        code: 'PHOTO_PRESENTATION_CAPTURE_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: { captureId },
      });
    }
  }

  private reject(
    pending: PendingCapture,
    observation: MissionRuntimeObservation,
    diagnostic: MissionRuntimeDiagnostic,
  ): PhotoCaptureOutcome {
    this.clearPending();
    const outcome: PhotoCaptureOutcome = {
      captureId: null,
      missionObjectiveId: null,
      photographyObjectiveId: pending.objectiveId,
      attemptNumber: 0,
      capturedAtTick: observation.flight.simulationTick,
      passed: false,
      evaluation: null,
      diagnostic,
    };
    this.lastOutcomeSignal.set(outcome);
    return outcome;
  }

  private publishRejection(
    request: PhotoCaptureRequest,
    diagnostic: MissionRuntimeDiagnostic,
  ): void {
    this.lastOutcomeSignal.set({
      captureId: null,
      missionObjectiveId: null,
      photographyObjectiveId: request.objectiveId,
      attemptNumber: 0,
      capturedAtTick: -1,
      passed: false,
      evaluation: null,
      diagnostic,
    });
  }

  /** Records a non-scoring diagnostic (presentation capture) on the last outcome. */
  private noteDiagnostic(diagnostic: MissionRuntimeDiagnostic): void {
    const current = this.lastOutcomeSignal();
    if (!current) {
      return;
    }
    this.lastOutcomeSignal.set({ ...current, diagnostic });
  }
}

function revokePresentationUrl(objectUrl: string): void {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Already-revoked URLs are not an error.
  }
}
