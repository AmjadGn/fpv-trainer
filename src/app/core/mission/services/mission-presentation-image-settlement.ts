/**
 * Presentation-image settlement for durable Personal Best photo persistence.
 *
 * Scoring and core result saves never wait on these tasks. Persistence may
 * await settled Blob outcomes independently of UI object-URL lifecycle.
 */

export const MISSION_PRESENTATION_SETTLEMENT_TIMEOUT_MS = 8_000;

export type SettledMissionPresentationImageStatus =
  | 'available'
  | 'failed'
  | 'stale';

export interface SettledMissionPresentationImage {
  readonly objectiveId: string;
  readonly captureId: string;
  readonly status: SettledMissionPresentationImageStatus;
  readonly blob: Blob | null;
  readonly mimeType: string | null;
  readonly byteLength: number;
  readonly diagnosticCode?: string;
}

export interface MissionPresentationImageSettlement {
  readonly sessionId: string;
  readonly sessionGeneration: number;
  readonly resultId: string;
  readonly expectedObjectiveIds: readonly string[];

  waitForSettled(): Promise<readonly SettledMissionPresentationImage[]>;
  release(): void;
}

export interface MissionResultAircraftContext {
  readonly aircraftId: string;
  readonly aircraftSourceType: 'factory' | 'user-compiled';
  readonly definitionVersion: string | null;
  readonly physicsProfileVersion: string | null;
  readonly runtimeCompatibilityVersion: string;
}

interface PresentationSettlementTask {
  readonly objectiveId: string;
  readonly captureId: string;
  readonly sessionGeneration: number;
  readonly promise: Promise<SettledMissionPresentationImage>;
  resolve(value: SettledMissionPresentationImage): void;
  settled: SettledMissionPresentationImage | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

function taskKey(sessionGeneration: number, objectiveId: string): string {
  return `${sessionGeneration}:${objectiveId}`;
}

/**
 * Registry of one settlement task per accepted presentation capture.
 * Owned by `PhotoCaptureCoordinator`; persistence awaits independently of UI.
 */
export class MissionPresentationSettlementRegistry {
  private readonly tasks = new Map<string, PresentationSettlementTask>();
  private readonly releasedResultIds = new Set<string>();

  /**
   * Registers (or returns) the settlement task for an accepted objective.
   * Call when presentation capture starts.
   */
  beginTask(input: {
    readonly sessionGeneration: number;
    readonly objectiveId: string;
    readonly captureId: string;
    readonly timeoutMs?: number;
  }): PresentationSettlementTask {
    const key = taskKey(input.sessionGeneration, input.objectiveId);
    const existing = this.tasks.get(key);
    if (existing) {
      return existing;
    }

    let resolveFn!: (value: SettledMissionPresentationImage) => void;
    const promise = new Promise<SettledMissionPresentationImage>((resolve) => {
      resolveFn = resolve;
    });

    const task: PresentationSettlementTask = {
      objectiveId: input.objectiveId,
      captureId: input.captureId,
      sessionGeneration: input.sessionGeneration,
      promise,
      settled: null,
      timeoutId: null,
      resolve: (value) => {
        if (task.settled) {
          return;
        }
        if (task.timeoutId !== null) {
          clearTimeout(task.timeoutId);
          task.timeoutId = null;
        }
        task.settled = value;
        resolveFn(value);
      },
    };

    const timeoutMs = input.timeoutMs ?? MISSION_PRESENTATION_SETTLEMENT_TIMEOUT_MS;
    task.timeoutId = setTimeout(() => {
      task.resolve({
        objectiveId: input.objectiveId,
        captureId: input.captureId,
        status: 'failed',
        blob: null,
        mimeType: null,
        byteLength: 0,
        diagnosticCode: 'PHOTO_PRESENTATION_SETTLEMENT_TIMEOUT',
      });
    }, timeoutMs);

    this.tasks.set(key, task);
    return task;
  }

  completeTask(input: {
    readonly sessionGeneration: number;
    readonly objectiveId: string;
    readonly captureId: string;
    readonly status: SettledMissionPresentationImageStatus;
    readonly blob: Blob | null;
    readonly mimeType: string | null;
    readonly byteLength: number;
    readonly diagnosticCode?: string;
  }): void {
    const key = taskKey(input.sessionGeneration, input.objectiveId);
    const task = this.tasks.get(key) ?? this.beginTask({
      sessionGeneration: input.sessionGeneration,
      objectiveId: input.objectiveId,
      captureId: input.captureId,
    });
    task.resolve({
      objectiveId: input.objectiveId,
      captureId: input.captureId,
      status: input.status,
      blob: input.blob,
      mimeType: input.mimeType,
      byteLength: input.byteLength,
      diagnosticCode: input.diagnosticCode,
    });
  }

  createSettlement(input: {
    readonly sessionId: string;
    readonly sessionGeneration: number;
    readonly resultId: string;
    readonly expectedObjectiveIds: readonly string[];
  }): MissionPresentationImageSettlement {
    const expectedObjectiveIds = [...input.expectedObjectiveIds];
    for (const objectiveId of expectedObjectiveIds) {
      const key = taskKey(input.sessionGeneration, objectiveId);
      if (!this.tasks.has(key)) {
        // Presentation never started (missing port / early exit) — fail closed.
        this.beginTask({
          sessionGeneration: input.sessionGeneration,
          objectiveId,
          captureId: `missing:${objectiveId}`,
        });
        this.completeTask({
          sessionGeneration: input.sessionGeneration,
          objectiveId,
          captureId: `missing:${objectiveId}`,
          status: 'failed',
          blob: null,
          mimeType: null,
          byteLength: 0,
          diagnosticCode: 'PHOTO_PRESENTATION_TASK_MISSING',
        });
      }
    }

    let released = false;
    return {
      sessionId: input.sessionId,
      sessionGeneration: input.sessionGeneration,
      resultId: input.resultId,
      expectedObjectiveIds,
      waitForSettled: async () => {
        const settled = await Promise.all(
          expectedObjectiveIds.map(async (objectiveId) => {
            const key = taskKey(input.sessionGeneration, objectiveId);
            const task = this.tasks.get(key);
            if (!task) {
              return {
                objectiveId,
                captureId: `missing:${objectiveId}`,
                status: 'failed' as const,
                blob: null,
                mimeType: null,
                byteLength: 0,
                diagnosticCode: 'PHOTO_PRESENTATION_TASK_MISSING',
              };
            }
            const value = await task.promise;
            if (released || this.releasedResultIds.has(input.resultId)) {
              return {
                ...value,
                status: value.status === 'available' ? ('stale' as const) : value.status,
              };
            }
            return value;
          }),
        );
        return settled;
      },
      release: () => {
        released = true;
        this.releasedResultIds.add(input.resultId);
        for (const objectiveId of expectedObjectiveIds) {
          const key = taskKey(input.sessionGeneration, objectiveId);
          const task = this.tasks.get(key);
          if (task?.settled) {
            // Drop Blob references after persistence finishes.
            this.tasks.delete(key);
          }
        }
      },
    };
  }

  /** Test seam — clear all tasks and release markers. */
  resetForTests(): void {
    for (const task of this.tasks.values()) {
      if (task.timeoutId !== null) {
        clearTimeout(task.timeoutId);
      }
      if (!task.settled) {
        task.resolve({
          objectiveId: task.objectiveId,
          captureId: task.captureId,
          status: 'stale',
          blob: null,
          mimeType: null,
          byteLength: 0,
          diagnosticCode: 'PHOTO_PRESENTATION_REGISTRY_RESET',
        });
      }
    }
    this.tasks.clear();
    this.releasedResultIds.clear();
  }
}
