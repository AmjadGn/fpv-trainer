import { Injectable, Optional, computed, signal } from '@angular/core';

import type {
  FailureReasonCode,
  MissionDefinition,
  MissionResultRecord,
  MissionScore,
  MissionStatus,
  ObjectiveResultStatus,
} from '@fpv/mission-domain';
import type { PhotoEvaluationResult } from '@fpv/photography-domain';
import type { MissionResultSaveUiStatus } from '@fpv/mission-persistence';

import { DEFAULT_FIXED_STEP_SECONDS } from './mission-boundary-runtime';
import type {
  MissionPresentationImageSettlement,
  MissionResultAircraftContext,
} from './mission-presentation-image-settlement';
import { MissionPersistenceCoordinator } from '../../mission-persistence/mission-persistence.coordinator';

export interface MissionSessionPresentationImage {
  readonly objectiveId: string;
  readonly captureId: string | null;
  readonly blob: Blob | null;
  readonly objectUrl: string | null;
  readonly mimeType: string;
  readonly byteLength: number;
}

export interface MissionResultsObjectiveEntry {
  readonly objectiveId: string;
  readonly displayName: string | null;
  readonly status: ObjectiveResultStatus;
  readonly scorePoints: number;
  readonly maxPoints: number;
  readonly evidenceRef: string | null;
  readonly normalizedScore: number | null;
  readonly photoTotalScore: number | null;
  readonly photoMaxScore: number | null;
  readonly feedbackCodes: readonly string[];
  readonly attemptCount: number;
  /** Session presentation object URL; revoked on retry/exit. */
  readonly presentationImageUrl: string | null;
}

export interface MissionResultsViewModel {
  readonly available: boolean;
  readonly missionId: string | null;
  readonly sessionId: string | null;
  readonly missionTitle: string | null;
  readonly status: MissionStatus | null;
  readonly failureReasonCode: FailureReasonCode | null;
  readonly score: MissionScore | null;
  readonly timeBonusPoints: number;
  readonly elapsedTicks: number;
  readonly elapsedSeconds: number;
  readonly objectives: readonly MissionResultsObjectiveEntry[];
  readonly showObjectiveBreakdown: boolean;
  readonly showTimeBonus: boolean;
  readonly customResultsNote: string | null;
  /**
   * Legacy flag retained for Checkpoint 5 tests: session presentation is still
   * ephemeral. Durable copies may also exist via mission persistence.
   */
  readonly sessionOnly: true;
  readonly persistenceStatus: MissionResultSaveUiStatus;
  readonly persistenceNote: string | null;
  readonly isNewPersonalBest: boolean;
  readonly memoryOnly: boolean;
}

export interface MissionResultsSetInput {
  readonly record: MissionResultRecord;
  readonly mission: MissionDefinition;
  readonly evaluations: ReadonlyMap<string, PhotoEvaluationResult>;
  readonly attemptCounts: ReadonlyMap<string, number>;
  readonly fixedStepSeconds?: number;
  readonly scoringPolicyVersion?: string;
  readonly sessionGeneration?: number;
  readonly locationId?: string;
  readonly locationVersion?: string;
  readonly objectiveVersions?: ReadonlyMap<string, string>;
  readonly aircraftContext?: MissionResultAircraftContext | null;
  readonly presentationSettlement?: MissionPresentationImageSettlement | null;
  /** @deprecated Prefer aircraftContext from the authoritative flight runtime. */
  readonly aircraftId?: string | null;
  readonly aircraftSourceType?: string | null;
  readonly aircraftDefinitionVersion?: string | null;
  readonly aircraftPhysicsProfileVersion?: string | null;
  readonly aircraftRuntimeCompatibilityVersion?: string | null;
}

const EMPTY_VIEW_MODEL: MissionResultsViewModel = {
  available: false,
  missionId: null,
  sessionId: null,
  missionTitle: null,
  status: null,
  failureReasonCode: null,
  score: null,
  timeBonusPoints: 0,
  elapsedTicks: 0,
  elapsedSeconds: 0,
  objectives: [],
  showObjectiveBreakdown: true,
  showTimeBonus: true,
  customResultsNote: null,
  sessionOnly: true,
  persistenceStatus: 'idle',
  persistenceNote: null,
  isNewPersonalBest: false,
  memoryOnly: false,
};

/**
 * Mission results view model with session presentation images.
 *
 * Durable persistence is coordinated separately; this facade owns UI object
 * URLs only. Personal Best image Blobs are retained by presentation settlement
 * independently of revoke/clear.
 */
@Injectable({ providedIn: 'root' })
export class MissionResultsFacade {
  private readonly viewModelSignal = signal<MissionResultsViewModel>(EMPTY_VIEW_MODEL);
  private readonly images = new Map<string, MissionSessionPresentationImage>();
  private lastSetInput: MissionResultsSetInput | null = null;

  readonly viewModel = this.viewModelSignal.asReadonly();
  readonly available = computed(() => this.viewModelSignal().available);

  constructor(
    @Optional() private readonly persistence: MissionPersistenceCoordinator | null = null,
  ) {}

  setResult(input: MissionResultsSetInput): void {
    const { record, mission } = input;
    this.lastSetInput = input;
    const fixedStepSeconds = input.fixedStepSeconds ?? DEFAULT_FIXED_STEP_SECONDS;
    const elapsedTicks = record.elapsedTicks as unknown as number;

    const objectives = record.objectiveResults.map((result): MissionResultsObjectiveEntry => {
      const objectiveId = String(result.objectiveId);
      const declared = mission.objectives.find((o) => o.objectiveId === result.objectiveId);
      const evaluation = input.evaluations.get(objectiveId) ?? null;
      return {
        objectiveId,
        displayName: declared?.displayName ?? null,
        status: result.status,
        scorePoints: result.scorePoints,
        maxPoints: result.maxPoints,
        evidenceRef: result.photographyEvaluationRef ?? null,
        normalizedScore: evaluation?.normalizedScore ?? null,
        photoTotalScore: evaluation?.totalScore ?? null,
        photoMaxScore: evaluation?.maxScore ?? null,
        feedbackCodes: evaluation?.feedbackCodes ?? [],
        attemptCount: input.attemptCounts.get(objectiveId) ?? 0,
        presentationImageUrl: this.images.get(objectiveId)?.objectUrl ?? null,
      };
    });

    this.viewModelSignal.set({
      available: true,
      missionId: String(record.missionId),
      sessionId: String(record.sessionId),
      missionTitle: mission.metadata.title,
      status: record.status,
      failureReasonCode: record.failureReasonCode ?? null,
      score: record.score,
      timeBonusPoints: record.score.timeBonusPoints,
      elapsedTicks,
      elapsedSeconds: elapsedTicks * fixedStepSeconds,
      objectives,
      showObjectiveBreakdown: mission.resultsMetadata?.showObjectiveBreakdown ?? true,
      showTimeBonus: mission.resultsMetadata?.showTimeBonus ?? true,
      customResultsNote: mission.resultsMetadata?.customResultsNote ?? null,
      sessionOnly: true,
      persistenceStatus: 'saving',
      persistenceNote: null,
      isNewPersonalBest: false,
      memoryOnly: false,
    });

    void this.persistAfterSet(input);
  }

  /**
   * Attaches (or replaces) the presentation image for an objective.
   * Prefer passing the Blob so persistence can snapshot it without refetching.
   */
  attachPresentationImage(
    objectiveId: string,
    objectUrl: string,
    options: {
      readonly blob?: Blob | null;
      readonly captureId?: string | null;
      readonly mimeType?: string;
      readonly byteLength?: number;
    } = {},
  ): void {
    const previous = this.images.get(objectiveId);
    if (previous?.objectUrl && previous.objectUrl !== objectUrl) {
      revokeObjectUrl(previous.objectUrl);
    }
    const blob = options.blob ?? previous?.blob ?? null;
    const mimeType =
      options.mimeType ?? blob?.type ?? previous?.mimeType ?? 'image/jpeg';
    const byteLength =
      options.byteLength ?? blob?.size ?? previous?.byteLength ?? 0;
    this.images.set(objectiveId, {
      objectiveId,
      captureId: options.captureId ?? previous?.captureId ?? null,
      blob,
      objectUrl,
      mimeType,
      byteLength,
    });

    const current = this.viewModelSignal();
    if (!current.available) {
      return;
    }
    this.viewModelSignal.set({
      ...current,
      objectives: current.objectives.map((entry) =>
        entry.objectiveId === objectiveId
          ? { ...entry, presentationImageUrl: objectUrl }
          : entry,
      ),
    });
  }

  presentationImageUrl(objectiveId: string): string | null {
    return this.images.get(objectiveId)?.objectUrl ?? null;
  }

  presentationImageUrls(): readonly string[] {
    return [...this.images.values()]
      .map((image) => image.objectUrl)
      .filter((url): url is string => Boolean(url));
  }

  presentationImages(): readonly MissionSessionPresentationImage[] {
    return [...this.images.values()];
  }

  /** Revokes every retained object URL. Safe to call repeatedly. */
  revokeAllPresentationImages(): void {
    for (const image of this.images.values()) {
      if (image.objectUrl) {
        revokeObjectUrl(image.objectUrl);
      }
    }
    this.images.clear();
  }

  /**
   * Clears results UI and revokes object URLs — call on retry and on exit.
   * Does not cancel in-flight core/image persistence or settlement Blobs.
   */
  clear(): void {
    this.persistence?.invalidatePendingUi();
    this.persistence?.resetSaveStatus();
    this.revokeAllPresentationImages();
    this.lastSetInput = null;
    this.viewModelSignal.set(EMPTY_VIEW_MODEL);
  }

  /** Explicit UI seam for retrying a failed durable core save. */
  retryLastFailedSave(): void {
    void this.persistence?.retryLastFailedSave();
  }

  private async persistAfterSet(input: MissionResultsSetInput): Promise<void> {
    if (!this.persistence) {
      const current = this.viewModelSignal();
      if (current.available) {
        this.viewModelSignal.set({
          ...current,
          persistenceStatus: 'idle',
          persistenceNote: 'Results are kept for this session only.',
        });
      }
      return;
    }

    const scoringPolicyVersion = input.scoringPolicyVersion ?? '1.0.0';
    const sessionGeneration = input.sessionGeneration ?? 0;
    const locationId = input.locationId ?? input.mission.requiredLocationId;
    const locationVersion = input.locationVersion ?? '1.0.0';
    const aircraft = input.aircraftContext;

    await this.persistence.saveSessionResult({
      record: input.record,
      mission: input.mission,
      scoringPolicyVersion,
      sessionGeneration,
      locationId,
      locationVersion,
      evaluations: input.evaluations,
      attemptCounts: input.attemptCounts,
      fixedStepSeconds: input.fixedStepSeconds ?? DEFAULT_FIXED_STEP_SECONDS,
      objectiveVersions: input.objectiveVersions,
      aircraftId: aircraft?.aircraftId ?? input.aircraftId ?? null,
      aircraftSourceType: aircraft?.aircraftSourceType ?? input.aircraftSourceType ?? null,
      aircraftDefinitionVersion:
        aircraft?.definitionVersion ?? input.aircraftDefinitionVersion ?? null,
      aircraftPhysicsProfileVersion:
        aircraft?.physicsProfileVersion ?? input.aircraftPhysicsProfileVersion ?? null,
      aircraftRuntimeCompatibilityVersion:
        aircraft?.runtimeCompatibilityVersion ??
        input.aircraftRuntimeCompatibilityVersion ??
        null,
      presentationSettlement: input.presentationSettlement ?? null,
    });

    const current = this.viewModelSignal();
    if (!current.available || String(current.sessionId) !== String(input.record.sessionId)) {
      return;
    }

    this.syncPersistenceView(current);
  }

  private syncPersistenceView(current: MissionResultsViewModel): void {
    if (!this.persistence) {
      return;
    }
    const status = this.persistence.saveStatus();
    const memoryOnly = this.persistence.isMemoryOnly();
    this.viewModelSignal.set({
      ...current,
      persistenceStatus: status,
      isNewPersonalBest: this.persistence.becamePersonalBest(),
      memoryOnly,
      persistenceNote: persistenceNoteFor(status, memoryOnly),
    });
  }
}

function persistenceNoteFor(
  status: MissionResultSaveUiStatus,
  memoryOnly: boolean,
): string | null {
  switch (status) {
    case 'saving':
      return 'Saving result…';
    case 'saved-new-personal-best-images-pending':
      return 'New Personal Best — saving photos…';
    case 'saved-new-personal-best':
      return 'New Personal Best';
    case 'saved-without-images':
      return 'Personal Best saved. Photo storage incomplete.';
    case 'memory-only':
      return 'Saved for this session only — durable storage is unavailable.';
    case 'attempt-saved':
      return memoryOnly
        ? 'Attempt saved for this session only.'
        : 'Attempt saved';
    case 'saved':
      return 'Result saved';
    case 'save-failed':
      return 'Could not save this result. Retry save to try again.';
    default:
      return null;
  }
}

/** Revokes a session-only object URL, tolerating non-browser environments. */
export function revokeObjectUrl(objectUrl: string): void {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Revocation of an already-released URL is not an error worth surfacing.
  }
}
