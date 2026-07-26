import { Injectable, computed, signal } from '@angular/core';

import {
  aggregateMissionResult,
  allocateRequiredObjectiveMaxPoints,
  applyObjectiveResult,
  asMissionResultId,
  asMissionSessionId,
  createMissionSession,
  isPhotographyObjective,
  scorePointsFromNormalized,
  transitionMissionState,
  type FailureReasonCode,
  type MissionDefinition,
  type MissionResultRecord,
  type MissionSessionState,
  type MissionState,
  type MissionStateEvent,
  type ObjectiveId,
  type ObjectiveProgress,
  type ObjectiveResult,
} from '@fpv/mission-domain';
import type {
  PhotoEvaluationResult,
  PhotographyObjectiveDefinition,
  PhotographyScoringPolicy,
} from '@fpv/photography-domain';
import { asElapsedTicks } from '@fpv/simulation-contracts';

import type { MissionRuntimeDiagnostic } from '../models/mission-runtime-diagnostics';
import type { MissionSessionLifecyclePhase } from './mission-session.facade';

/** Failed attempts retained per objective for HUD feedback (bounded, session-only). */
export const MAX_RETAINED_FAILED_ATTEMPTS_PER_OBJECTIVE = 10;

export interface MissionObjectiveRuntimeBeginInput {
  readonly mission: MissionDefinition;
  /** Keyed by `PhotographyObjectiveDefinition.objectiveId` string value. */
  readonly photographyObjectives: ReadonlyMap<string, PhotographyObjectiveDefinition>;
  readonly scoringPolicy: PhotographyScoringPolicy;
  readonly sessionId: string;
}

export type MissionObjectiveRuntimeBeginResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostic: MissionRuntimeDiagnostic };

export interface ActivePhotographyObjective {
  readonly missionObjectiveId: ObjectiveId;
  readonly displayName: string | null;
  readonly photographyObjectiveId: string;
  readonly definition: PhotographyObjectiveDefinition;
  readonly index: number;
  /** 1-based number the *next* capture attempt will carry. */
  readonly attemptNumber: number;
}

export interface MissionObjectiveAttemptContext {
  readonly missionObjectiveId: ObjectiveId;
  readonly attemptNumber: number;
  readonly capturedAtTick: number;
  readonly evidenceRef: string;
}

export interface MissionObjectiveFailedAttempt {
  readonly missionObjectiveId: string;
  readonly attemptNumber: number;
  readonly capturedAtTick: number;
  readonly evidenceRef: string;
  readonly totalScore: number;
  readonly maxScore: number;
  readonly normalizedScore: number;
  readonly hardFailureReasons: readonly string[];
  readonly feedbackCodes: readonly string[];
}

export type MissionObjectiveAcceptOutcome =
  | { readonly ok: true; readonly missionCompleted: boolean }
  | { readonly ok: false; readonly diagnostic: MissionRuntimeDiagnostic };

export interface MissionObjectivePresentationState {
  readonly missionId: string | null;
  readonly sessionId: string | null;
  readonly missionState: MissionState;
  readonly activeObjectiveId: string | null;
  readonly activeObjectiveDisplayName: string | null;
  readonly activePhotographyObjectiveId: string | null;
  readonly activeObjectiveIndex: number;
  readonly objectiveCount: number;
  readonly completedObjectiveCount: number;
  readonly attemptNumber: number;
  readonly elapsedTicks: number;
  readonly retryCount: number;
  readonly failureReasonCode: FailureReasonCode | null;
  readonly objectiveProgress: readonly ObjectiveProgress[];
  readonly lastAttemptPassed: boolean | null;
  readonly lastAttemptFeedbackCodes: readonly string[];
}

const IDLE_PRESENTATION: MissionObjectivePresentationState = {
  missionId: null,
  sessionId: null,
  missionState: 'unavailable',
  activeObjectiveId: null,
  activeObjectiveDisplayName: null,
  activePhotographyObjectiveId: null,
  activeObjectiveIndex: -1,
  objectiveCount: 0,
  completedObjectiveCount: 0,
  attemptNumber: 1,
  elapsedTicks: 0,
  retryCount: 0,
  failureReasonCode: null,
  objectiveProgress: [],
  lastAttemptPassed: null,
  lastAttemptFeedbackCodes: [],
};

/**
 * Owns mission objective sequencing and mission lifecycle state for a
 * photography mission attempt.
 *
 * Strictly an application-layer reducer host: it never raycasts, renders,
 * touches Three.js / Rapier / physics, nor persists anything. All state
 * changes go through `@fpv/mission-domain` pure functions.
 */
@Injectable({ providedIn: 'root' })
export class MissionObjectiveRuntime {
  private mission: MissionDefinition | null = null;
  private photographyObjectives: ReadonlyMap<string, PhotographyObjectiveDefinition> = new Map();
  private scoringPolicyValue: PhotographyScoringPolicy | null = null;
  private session: MissionSessionState | null = null;
  private orderedObjectiveIds: readonly ObjectiveId[] = [];
  private activeIndex = -1;
  private readonly attemptCounts = new Map<string, number>();
  private readonly acceptedResults = new Map<string, ObjectiveResult>();
  private readonly failedAttempts = new Map<string, MissionObjectiveFailedAttempt[]>();
  private readonly acceptedEvaluations = new Map<string, PhotoEvaluationResult>();
  /** Authored max points per mission objective id (from score allocation policy). */
  private objectiveMaxPoints = new Map<string, number>();
  private failureReasonCode: FailureReasonCode | null = null;
  private resultRecord: MissionResultRecord | null = null;
  private sessionIdValue: string | null = null;

  private readonly presentationSignal = signal<MissionObjectivePresentationState>(
    IDLE_PRESENTATION,
  );
  private readonly diagnosticsSignal = signal<readonly MissionRuntimeDiagnostic[]>([]);

  readonly presentation = this.presentationSignal.asReadonly();
  readonly diagnostics = this.diagnosticsSignal.asReadonly();
  readonly missionState = computed<MissionState>(() => this.presentationSignal().missionState);
  readonly activeObjectiveId = computed<string | null>(
    () => this.presentationSignal().activeObjectiveId,
  );

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  beginSession(input: MissionObjectiveRuntimeBeginInput): MissionObjectiveRuntimeBeginResult {
    const ordered = resolveOrderedObjectiveIds(input.mission);
    if (ordered.length === 0) {
      return {
        ok: false,
        diagnostic: {
          code: 'MISSION_CONTENT_INVALID',
          message: 'Mission has no ordered objectives to run',
          details: { missionId: String(input.mission.missionId) },
        },
      };
    }

    const missingPhotographyIds = ordered
      .map((objectiveId) => findPhotographyObjectiveRef(input.mission, objectiveId))
      .filter((ref): ref is string => ref !== null)
      .filter((ref) => !input.photographyObjectives.has(ref));
    if (missingPhotographyIds.length > 0) {
      return {
        ok: false,
        diagnostic: {
          code: 'MISSION_CONTENT_INVALID',
          message: 'Mission references photography objectives that are not installed',
          details: { missingPhotographyObjectiveIds: missingPhotographyIds },
        },
      };
    }

    const allocation = resolveObjectiveMaxPoints(input.mission, ordered);
    if (!allocation.ok) {
      return {
        ok: false,
        diagnostic: {
          code: 'MISSION_CONTENT_INVALID',
          message: allocation.reason,
          details: { missionId: String(input.mission.missionId) },
        },
      };
    }

    this.mission = input.mission;
    this.photographyObjectives = input.photographyObjectives;
    this.scoringPolicyValue = input.scoringPolicy;
    this.orderedObjectiveIds = ordered;
    this.sessionIdValue = input.sessionId;
    this.objectiveMaxPoints = allocation.maxPointsByObjectiveId;
    this.clearAttemptState();
    this.diagnosticsSignal.set([]);

    const created = createMissionSession(asMissionSessionId(input.sessionId), input.mission);
    this.session = created;
    this.activeIndex = 0;

    const activated = this.applyEvents([
      { type: 'missionSelected', missionId: input.mission.missionId },
      { type: 'briefingAccepted' },
      { type: 'contentLoaded' },
      { type: 'runtimePrepared' },
      { type: 'startRequested' },
    ]);
    if (!activated.ok) {
      return activated;
    }

    this.publish();
    return { ok: true };
  }

  /** Advances mission elapsed ticks from an authoritative fixed step. */
  onAuthoritativeTick(elapsedTicks: number): void {
    const session = this.session;
    if (!session || session.state !== 'active') {
      return;
    }
    if (!Number.isFinite(elapsedTicks) || elapsedTicks < 0) {
      return;
    }
    this.session = { ...session, elapsedTicks: asElapsedTicks(Math.trunc(elapsedTicks)) };
    this.publish();
  }

  isActive(): boolean {
    return this.session?.state === 'active';
  }

  scoringPolicy(): PhotographyScoringPolicy | null {
    return this.scoringPolicyValue;
  }

  sessionId(): string | null {
    return this.sessionIdValue;
  }

  elapsedTicks(): number {
    return this.session ? (this.session.elapsedTicks as unknown as number) : 0;
  }

  // -------------------------------------------------------------------------
  // Objectives
  // -------------------------------------------------------------------------

  getActivePhotographyObjective(): ActivePhotographyObjective | null {
    const mission = this.mission;
    const session = this.session;
    if (!mission || !session || session.state !== 'active') {
      return null;
    }
    const missionObjectiveId = this.orderedObjectiveIds[this.activeIndex];
    if (missionObjectiveId === undefined) {
      return null;
    }
    if (this.acceptedResults.has(String(missionObjectiveId))) {
      return null;
    }
    const photographyObjectiveId = findPhotographyObjectiveRef(mission, missionObjectiveId);
    if (photographyObjectiveId === null) {
      return null;
    }
    const definition = this.photographyObjectives.get(photographyObjectiveId);
    if (!definition) {
      return null;
    }
    const declared = mission.objectives.find((o) => o.objectiveId === missionObjectiveId);
    return {
      missionObjectiveId,
      displayName: declared?.displayName ?? null,
      photographyObjectiveId,
      definition,
      index: this.activeIndex,
      attemptNumber: this.getAttemptNumber(missionObjectiveId),
    };
  }

  /** 1-based number the next attempt on `objectiveId` will carry. */
  getAttemptNumber(objectiveId: ObjectiveId | string): number {
    return (this.attemptCounts.get(String(objectiveId)) ?? 0) + 1;
  }

  isObjectiveCompleted(objectiveId: ObjectiveId | string): boolean {
    return this.acceptedResults.has(String(objectiveId));
  }

  /** Same as `isObjectiveCompleted`, keyed by the photography objective ref. */
  isPhotographyObjectiveCompleted(photographyObjectiveId: string): boolean {
    const mission = this.mission;
    if (!mission) {
      return false;
    }
    const declared = mission.objectives.find(
      (objective) =>
        isPhotographyObjective(objective) &&
        objective.photographyObjectiveId === photographyObjectiveId,
    );
    return declared !== undefined && this.acceptedResults.has(String(declared.objectiveId));
  }

  failedAttemptsFor(objectiveId: ObjectiveId | string): readonly MissionObjectiveFailedAttempt[] {
    return this.failedAttempts.get(String(objectiveId)) ?? [];
  }

  /**
   * Converts a photo evaluation into a mission `ObjectiveResult`.
   *
   * Point mapping uses the mission's authored `objectiveScoreAllocation`
   * budgets (see `@fpv/mission-domain` score-allocation). Photography
   * evaluation max scores (e.g. 120) are never treated as mission points.
   */
  createObjectiveResult(
    missionObjectiveId: ObjectiveId,
    evaluation: PhotoEvaluationResult,
    evidenceRef: string,
  ): ObjectiveResult {
    const maxPoints = this.objectiveMaxPoints.get(String(missionObjectiveId)) ?? 0;
    return {
      objectiveId: missionObjectiveId,
      status: evaluation.passed ? 'completed' : 'failed',
      scorePoints: scorePointsFromNormalized(evaluation.normalizedScore, maxPoints),
      maxPoints,
      photographyEvaluationRef: evidenceRef,
    };
  }

  recordFailedAttempt(
    evaluation: PhotoEvaluationResult,
    attempt: MissionObjectiveAttemptContext,
  ): void {
    const key = String(attempt.missionObjectiveId);
    this.attemptCounts.set(key, attempt.attemptNumber);

    const history = this.failedAttempts.get(key) ?? [];
    history.push({
      missionObjectiveId: key,
      attemptNumber: attempt.attemptNumber,
      capturedAtTick: attempt.capturedAtTick,
      evidenceRef: attempt.evidenceRef,
      totalScore: evaluation.totalScore,
      maxScore: evaluation.maxScore,
      normalizedScore: evaluation.normalizedScore,
      hardFailureReasons: evaluation.hardFailureReasons,
      feedbackCodes: evaluation.feedbackCodes,
    });
    while (history.length > MAX_RETAINED_FAILED_ATTEMPTS_PER_OBJECTIVE) {
      history.shift();
    }
    this.failedAttempts.set(key, history);

    this.publish({ lastAttemptPassed: false, lastAttemptFeedbackCodes: evaluation.feedbackCodes });
  }

  acceptObjective(
    result: ObjectiveResult,
    evaluation: PhotoEvaluationResult,
    attempt: MissionObjectiveAttemptContext,
  ): MissionObjectiveAcceptOutcome {
    const session = this.session;
    if (!session || session.state !== 'active') {
      return {
        ok: false,
        diagnostic: {
          code: 'PHOTO_CAPTURE_NOT_ACTIVE',
          message: 'Cannot accept an objective result while the mission is not active',
          details: { missionState: session?.state ?? 'unavailable' },
        },
      };
    }
    const key = String(result.objectiveId);
    if (this.acceptedResults.has(key)) {
      return {
        ok: false,
        diagnostic: {
          code: 'PHOTO_OBJECTIVE_ALREADY_COMPLETED',
          message: `Objective "${key}" already has an accepted result`,
          details: { objectiveId: key },
        },
      };
    }

    this.attemptCounts.set(key, attempt.attemptNumber);
    this.acceptedResults.set(key, result);
    this.acceptedEvaluations.set(key, evaluation);
    this.session = applyObjectiveResult(session, result);

    const transitioned = this.applyEvents([
      { type: 'objectiveCompleted', objectiveId: result.objectiveId },
    ]);
    if (!transitioned.ok) {
      return transitioned;
    }

    this.activeIndex = this.orderedObjectiveIds.findIndex(
      (objectiveId) => !this.acceptedResults.has(String(objectiveId)),
    );

    const missionCompleted = this.activeIndex === -1;
    if (missionCompleted) {
      const completion = this.applyEvents([{ type: 'missionCompletionDetected' }]);
      if (!completion.ok) {
        return completion;
      }
    }

    this.publish({ lastAttemptPassed: true, lastAttemptFeedbackCodes: evaluation.feedbackCodes });
    return { ok: true, missionCompleted };
  }

  acceptedEvaluationFor(objectiveId: ObjectiveId | string): PhotoEvaluationResult | null {
    return this.acceptedEvaluations.get(String(objectiveId)) ?? null;
  }

  acceptedEvaluationsSnapshot(): ReadonlyMap<string, PhotoEvaluationResult> {
    return new Map(this.acceptedEvaluations);
  }

  attemptCountsSnapshot(): ReadonlyMap<string, number> {
    return new Map(this.attemptCounts);
  }

  missionDefinition(): MissionDefinition | null {
    return this.mission;
  }

  // -------------------------------------------------------------------------
  // Failure / completion / retry
  // -------------------------------------------------------------------------

  failMission(reason: FailureReasonCode): boolean {
    const session = this.session;
    if (!session) {
      return false;
    }
    if (session.state === 'failed' || session.state === 'missionCompleted') {
      return false;
    }
    const transitioned = this.applyEvents([
      { type: 'missionFailureDetected', reasonCode: reason },
    ]);
    if (!transitioned.ok) {
      return false;
    }
    this.failureReasonCode = reason;
    this.publish();
    return true;
  }

  /**
   * Aggregates the attempt into a session-only `MissionResultRecord` and
   * moves the lifecycle into `results`. Never persists.
   */
  completeMissionAndPrepareResults(): MissionResultRecord | null {
    const mission = this.mission;
    const session = this.session;
    if (!mission || !session) {
      this.pushDiagnostic({
        code: 'MISSION_RESULT_AGGREGATION_FAILED',
        message: 'No mission session available to aggregate',
      });
      return null;
    }
    if (this.resultRecord) {
      return this.resultRecord;
    }

    const objectiveResults = this.orderedObjectiveIds.map((objectiveId): ObjectiveResult => {
      const accepted = this.acceptedResults.get(String(objectiveId));
      if (accepted) {
        return accepted;
      }
      return {
        objectiveId,
        status: 'incomplete',
        scorePoints: 0,
        maxPoints: this.objectiveMaxPoints.get(String(objectiveId)) ?? 0,
      };
    });

    const aggregation = aggregateMissionResult({
      objectiveResults,
      requiredObjectiveIds: mission.grouping.requiredObjectiveIds,
      scoreAggregationPolicy: mission.scoreAggregationPolicy,
      timePolicy: mission.timePolicy,
      elapsedTicks: session.elapsedTicks,
    });

    const record: MissionResultRecord = {
      resultId: asMissionResultId(`${session.sessionId}:result`),
      missionId: mission.missionId,
      sessionId: session.sessionId,
      status: aggregation.status,
      ...(aggregation.status === 'failed' && this.failureReasonCode !== null
        ? { failureReasonCode: this.failureReasonCode }
        : {}),
      objectiveResults,
      score: aggregation.score,
      elapsedTicks: session.elapsedTicks,
    };
    this.resultRecord = record;

    const transitioned = this.applyEvents([{ type: 'resultsPrepared' }]);
    if (!transitioned.ok) {
      this.pushDiagnostic(transitioned.diagnostic);
    }
    this.publish();
    return record;
  }

  resultRecordSnapshot(): MissionResultRecord | null {
    return this.resultRecord;
  }

  /** Full mission retry — same mission content, fresh attempt state. */
  retryFullMission(): MissionObjectiveRuntimeBeginResult {
    const mission = this.mission;
    const session = this.session;
    if (!mission || !session || this.sessionIdValue === null) {
      const diagnostic: MissionRuntimeDiagnostic = {
        code: 'MISSION_RETRY_RUNTIME_UNAVAILABLE',
        message: 'No mission session is available to retry',
      };
      this.pushDiagnostic(diagnostic);
      return { ok: false, diagnostic };
    }

    const retryRequested = this.applyEvents([
      { type: 'retryRequested', scope: 'entire_mission' },
    ]);
    if (!retryRequested.ok) {
      this.pushDiagnostic(retryRequested.diagnostic);
      return retryRequested;
    }

    const retryCount = session.retryCount + 1;
    const fresh = createMissionSession(session.sessionId, mission);
    this.session = { ...fresh, state: 'retrying', retryCount };
    this.clearAttemptState();
    this.activeIndex = 0;

    const prepared = this.applyEvents([{ type: 'retryPrepared' }]);
    if (!prepared.ok) {
      this.pushDiagnostic(prepared.diagnostic);
      return prepared;
    }

    this.publish();
    return { ok: true };
  }

  /** Clears all mission state (exit to menu / free flight). */
  reset(): void {
    this.mission = null;
    this.photographyObjectives = new Map();
    this.scoringPolicyValue = null;
    this.session = null;
    this.orderedObjectiveIds = [];
    this.activeIndex = -1;
    this.objectiveMaxPoints = new Map();
    this.sessionIdValue = null;
    this.clearAttemptState();
    this.diagnosticsSignal.set([]);
    this.presentationSignal.set(IDLE_PRESENTATION);
  }

  // -------------------------------------------------------------------------
  // Predicates
  // -------------------------------------------------------------------------

  /**
   * Whether a photography capture is currently legal: an active photography
   * objective, unpaused mission, FPV camera, live session phase, and results
   * not yet open.
   */
  isPhotographyObjectiveActive(
    paused: boolean,
    cameraModeFpv: boolean,
    phase: MissionSessionLifecyclePhase,
  ): boolean {
    if (paused || !cameraModeFpv) {
      return false;
    }
    if (phase !== 'active') {
      return false;
    }
    if (this.resultRecord !== null) {
      return false;
    }
    const state = this.session?.state;
    if (state === 'failed' || state === 'missionCompleted' || state === 'results') {
      return false;
    }
    return this.getActivePhotographyObjective() !== null;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private applyEvents(
    events: readonly MissionStateEvent[],
  ): MissionObjectiveRuntimeBeginResult {
    let session = this.session;
    if (!session) {
      return {
        ok: false,
        diagnostic: {
          code: 'MISSION_RETRY_RUNTIME_UNAVAILABLE',
          message: 'No mission session available for state transition',
        },
      };
    }
    for (const event of events) {
      const transition = transitionMissionState(session.state, event);
      if (!transition.ok) {
        const diagnostic: MissionRuntimeDiagnostic = {
          code: 'MISSION_CONTENT_INVALID',
          message: transition.message,
          details: { from: transition.from, event: transition.event },
        };
        this.pushDiagnostic(diagnostic);
        this.session = session;
        return { ok: false, diagnostic };
      }
      session = { ...session, state: transition.state };
    }
    this.session = session;
    return { ok: true };
  }

  private clearAttemptState(): void {
    this.attemptCounts.clear();
    this.acceptedResults.clear();
    this.acceptedEvaluations.clear();
    this.failedAttempts.clear();
    this.failureReasonCode = null;
    this.resultRecord = null;
  }

  private pushDiagnostic(diagnostic: MissionRuntimeDiagnostic): void {
    this.diagnosticsSignal.set([...this.diagnosticsSignal(), diagnostic]);
  }

  private publish(
    attempt?: {
      readonly lastAttemptPassed: boolean;
      readonly lastAttemptFeedbackCodes: readonly string[];
    },
  ): void {
    const mission = this.mission;
    const session = this.session;
    if (!mission || !session) {
      this.presentationSignal.set(IDLE_PRESENTATION);
      return;
    }
    const active = this.getActivePhotographyObjective();
    const previous = this.presentationSignal();
    this.presentationSignal.set({
      missionId: String(mission.missionId),
      sessionId: String(session.sessionId),
      missionState: session.state,
      activeObjectiveId: active ? String(active.missionObjectiveId) : null,
      activeObjectiveDisplayName: active?.displayName ?? null,
      activePhotographyObjectiveId: active?.photographyObjectiveId ?? null,
      activeObjectiveIndex: this.activeIndex,
      objectiveCount: this.orderedObjectiveIds.length,
      completedObjectiveCount: this.acceptedResults.size,
      attemptNumber: active?.attemptNumber ?? 1,
      elapsedTicks: session.elapsedTicks as unknown as number,
      retryCount: session.retryCount,
      failureReasonCode: this.failureReasonCode,
      objectiveProgress: session.objectiveProgress,
      lastAttemptPassed: attempt ? attempt.lastAttemptPassed : previous.lastAttemptPassed,
      lastAttemptFeedbackCodes: attempt
        ? attempt.lastAttemptFeedbackCodes
        : previous.lastAttemptFeedbackCodes,
    });
  }
}

/**
 * Sequential missions run `grouping.requiredObjectiveIds` in authored order;
 * `all_of` missions fall back to declaration order.
 */
function resolveOrderedObjectiveIds(mission: MissionDefinition): readonly ObjectiveId[] {
  if (mission.grouping.mode === 'sequential') {
    return mission.grouping.requiredObjectiveIds;
  }
  return mission.objectives.map((objective) => objective.objectiveId);
}

function findPhotographyObjectiveRef(
  mission: MissionDefinition,
  objectiveId: ObjectiveId,
): string | null {
  const declared = mission.objectives.find((o) => o.objectiveId === objectiveId);
  if (!declared || !isPhotographyObjective(declared)) {
    return null;
  }
  return declared.photographyObjectiveId;
}

/**
 * Resolves authored max points for every ordered objective.
 * Requires an explicit `objectiveScoreAllocation` on the mission — there is
 * no silent equal-split fallback in the general runtime.
 */
function resolveObjectiveMaxPoints(
  mission: MissionDefinition,
  orderedObjectiveIds: readonly ObjectiveId[],
):
  | { readonly ok: true; readonly maxPointsByObjectiveId: Map<string, number> }
  | { readonly ok: false; readonly reason: string } {
  const allocation = mission.scoreAggregationPolicy.objectiveScoreAllocation;
  if (!allocation) {
    return {
      ok: false,
      reason:
        'Mission scoreAggregationPolicy.objectiveScoreAllocation is required so point budgets are authored, not inferred',
    };
  }

  const reservedTimeBonus = mission.scoreAggregationPolicy.timeBonusEnabled
    ? (mission.timePolicy.timeBonus?.maxBonusPoints ?? 0)
    : 0;

  const allocated = allocateRequiredObjectiveMaxPoints({
    allocation,
    maxScore: mission.scoreAggregationPolicy.maxScore,
    reservedTimeBonusPoints: reservedTimeBonus,
  });
  if (!allocated.ok) {
    return allocated;
  }

  const requiredIds = new Set(
    mission.grouping.requiredObjectiveIds.map((objectiveId) => String(objectiveId)),
  );
  for (const objectiveId of requiredIds) {
    if (!allocated.maxPointsByObjectiveId.has(objectiveId)) {
      return {
        ok: false,
        reason: `objectiveScoreAllocation is missing required objective "${objectiveId}"`,
      };
    }
  }
  for (const objectiveId of allocated.maxPointsByObjectiveId.keys()) {
    if (!requiredIds.has(objectiveId)) {
      return {
        ok: false,
        reason: `objectiveScoreAllocation references non-required objective "${objectiveId}"`,
      };
    }
  }

  // Optional / non-required ordered objectives contribute 0 max points unless
  // they later carry their own authored budget (not used by Coastal Ruins).
  const maxPointsByObjectiveId = new Map<string, number>();
  for (const objectiveId of orderedObjectiveIds) {
    const key = String(objectiveId);
    maxPointsByObjectiveId.set(key, allocated.maxPointsByObjectiveId.get(key) ?? 0);
  }
  return { ok: true, maxPointsByObjectiveId };
}
