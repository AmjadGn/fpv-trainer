import { Injectable, computed, signal } from '@angular/core';

import type {
  FailureReasonCode,
  MissionDefinition,
  MissionResultRecord,
  MissionScore,
  MissionStatus,
  ObjectiveResultStatus,
} from '@fpv/mission-domain';
import type { PhotoEvaluationResult } from '@fpv/photography-domain';

import { DEFAULT_FIXED_STEP_SECONDS } from './mission-boundary-runtime';

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
  /** Session-only object URL; revoked on retry/exit. */
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
  /** Always true: results exist for the current session only. */
  readonly sessionOnly: true;
}

export interface MissionResultsSetInput {
  readonly record: MissionResultRecord;
  readonly mission: MissionDefinition;
  readonly evaluations: ReadonlyMap<string, PhotoEvaluationResult>;
  readonly attemptCounts: ReadonlyMap<string, number>;
  readonly fixedStepSeconds?: number;
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
};

/**
 * Session-only mission results view model.
 *
 * Deliberately has NO persistence and NO personal-best tracking: results
 * live for the current session and are cleared (with their object URLs
 * revoked) on retry or exit. Nothing here touches IndexedDB or localStorage.
 */
@Injectable({ providedIn: 'root' })
export class MissionResultsFacade {
  private readonly viewModelSignal = signal<MissionResultsViewModel>(EMPTY_VIEW_MODEL);
  private readonly imageUrls = new Map<string, string>();

  readonly viewModel = this.viewModelSignal.asReadonly();
  readonly available = computed(() => this.viewModelSignal().available);

  setResult(input: MissionResultsSetInput): void {
    const { record, mission } = input;
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
        presentationImageUrl: this.imageUrls.get(objectiveId) ?? null,
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
    });
  }

  /**
   * Attaches (or replaces) the presentation image for an objective. Replacing
   * an existing URL revokes the previous one so a retry cannot leak blobs.
   */
  attachPresentationImage(objectiveId: string, objectUrl: string): void {
    const previous = this.imageUrls.get(objectiveId);
    if (previous && previous !== objectUrl) {
      revokeObjectUrl(previous);
    }
    this.imageUrls.set(objectiveId, objectUrl);

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
    return this.imageUrls.get(objectiveId) ?? null;
  }

  presentationImageUrls(): readonly string[] {
    return [...this.imageUrls.values()];
  }

  /** Revokes every retained object URL. Safe to call repeatedly. */
  revokeAllPresentationImages(): void {
    for (const url of this.imageUrls.values()) {
      revokeObjectUrl(url);
    }
    this.imageUrls.clear();
  }

  /** Clears results and revokes images — call on retry and on exit. */
  clear(): void {
    this.revokeAllPresentationImages();
    this.viewModelSignal.set(EMPTY_VIEW_MODEL);
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
