/**
 * Thin coordinator: one durable save per immutable session result.
 * Does not score, evaluate evidence, step physics, raycast, or block the flight loop.
 */

import { Injectable, computed, inject, signal } from '@angular/core';

import {
  MISSION_PERSISTENCE_DIAGNOSTICS,
  type MissionBestImagePayload,
  type MissionPersistenceDiagnostic,
  type MissionPersistencePort,
  type MissionPersistenceStorageMode,
  type MissionResultSaveUiStatus,
  type PersistedMissionResultRecord,
  type PersistedMissionSummaryRecord,
} from '@fpv/mission-persistence';
import type { MissionDefinition, MissionResultRecord } from '@fpv/mission-domain';
import type { PhotoEvaluationResult } from '@fpv/photography-domain';

import { buildPersistedMissionResult } from './build-persisted-mission-result';
import { createIndexedDbMissionPersistenceAdapter } from './indexed-db-mission-persistence.adapter';
import { createMemoryMissionPersistenceAdapter } from './memory-mission-persistence.adapter';
import type { MissionSessionPresentationImage } from '../mission/services/mission-results.facade';

export interface MissionPersistenceSaveRequest {
  readonly record: MissionResultRecord;
  readonly mission: MissionDefinition;
  readonly scoringPolicyVersion: string;
  readonly sessionGeneration: number;
  readonly locationId: string;
  readonly locationVersion: string;
  readonly evaluations: ReadonlyMap<string, PhotoEvaluationResult>;
  readonly attemptCounts: ReadonlyMap<string, number>;
  readonly fixedStepSeconds: number;
  readonly aircraftId?: string | null;
  readonly aircraftSourceType?: string | null;
  readonly aircraftDefinitionVersion?: string | null;
  readonly aircraftRuntimeCompatibilityVersion?: string | null;
  readonly presentationImages: readonly MissionSessionPresentationImage[];
}

@Injectable({ providedIn: 'root' })
export class MissionPersistenceCoordinator {
  private port: MissionPersistencePort | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly savedResultIds = new Set<string>();
  private saveGeneration = 0;

  private readonly storageModeSignal = signal<MissionPersistenceStorageMode>('unavailable');
  private readonly saveStatusSignal = signal<MissionResultSaveUiStatus>('idle');
  private readonly diagnosticSignal = signal<MissionPersistenceDiagnostic | null>(null);
  private readonly lastSummarySignal = signal<PersistedMissionSummaryRecord | null>(null);
  private readonly becamePersonalBestSignal = signal(false);
  private readonly readySignal = signal(false);

  readonly storageMode = this.storageModeSignal.asReadonly();
  readonly saveStatus = this.saveStatusSignal.asReadonly();
  readonly diagnostic = this.diagnosticSignal.asReadonly();
  readonly lastSummary = this.lastSummarySignal.asReadonly();
  readonly becamePersonalBest = this.becamePersonalBestSignal.asReadonly();
  readonly ready = this.readySignal.asReadonly();
  readonly isMemoryOnly = computed(() => this.storageModeSignal() === 'memory');

  async ensureReady(): Promise<void> {
    if (this.readySignal()) {
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  /** Test seam — inject a custom port before ensureReady. */
  usePortForTests(port: MissionPersistencePort): void {
    this.port = port;
    this.readySignal.set(false);
    this.initPromise = null;
  }

  async saveSessionResult(request: MissionPersistenceSaveRequest): Promise<void> {
    await this.ensureReady();
    const port = this.requirePort();
    const resultId = String(request.record.resultId);
    if (this.savedResultIds.has(resultId)) {
      return;
    }
    this.savedResultIds.add(resultId);

    const generation = ++this.saveGeneration;
    this.saveStatusSignal.set('saving');
    this.becamePersonalBestSignal.set(false);

    const dto = buildPersistedMissionResult({
      record: request.record,
      mission: request.mission,
      scoringPolicyVersion: request.scoringPolicyVersion,
      sessionGeneration: request.sessionGeneration,
      locationId: request.locationId,
      locationVersion: request.locationVersion,
      evaluations: request.evaluations,
      attemptCounts: request.attemptCounts,
      fixedStepSeconds: request.fixedStepSeconds,
      aircraftId: request.aircraftId,
      aircraftSourceType: request.aircraftSourceType,
      aircraftDefinitionVersion: request.aircraftDefinitionVersion,
      aircraftRuntimeCompatibilityVersion: request.aircraftRuntimeCompatibilityVersion,
      presentationImages: request.presentationImages.map((image) => ({
        objectiveId: image.objectiveId,
        captureId: image.captureId,
        mimeType: image.mimeType,
        byteLength: image.byteLength,
        hasBlob: Boolean(image.blob),
      })),
    });

    let saveOutcome;
    try {
      saveOutcome = await port.saveMissionResult(dto);
    } catch (error) {
      if (generation !== this.saveGeneration) {
        return;
      }
      this.saveStatusSignal.set('save-failed');
      this.diagnosticSignal.set({
        code: MISSION_PERSISTENCE_DIAGNOSTICS.WRITE_FAILED,
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (generation !== this.saveGeneration) {
      return;
    }

    if (!saveOutcome.ok) {
      this.saveStatusSignal.set('save-failed');
      this.diagnosticSignal.set(saveOutcome.diagnostic ?? {
        code: MISSION_PERSISTENCE_DIAGNOSTICS.WRITE_FAILED,
        message: 'Mission result save failed',
      });
      return;
    }

    this.lastSummarySignal.set(saveOutcome.summary);
    this.becamePersonalBestSignal.set(saveOutcome.becamePersonalBest);

    if (saveOutcome.becamePersonalBest) {
      const imageStatus = await this.persistPersonalBestImages(
        port,
        dto,
        request.presentationImages,
        generation,
      );
      if (generation !== this.saveGeneration) {
        return;
      }
      this.applyUiStatus({
        completed: dto.status === 'completed',
        becamePersonalBest: true,
        imageStatus,
      });
      return;
    }

    this.applyUiStatus({
      completed: dto.status === 'completed',
      becamePersonalBest: false,
      imageStatus: 'none',
    });
  }

  /** Call on retry / exit so stale async callbacks are ignored. */
  invalidatePending(): void {
    this.saveGeneration += 1;
  }

  resetSaveStatus(): void {
    this.saveStatusSignal.set('idle');
    this.becamePersonalBestSignal.set(false);
    this.diagnosticSignal.set(null);
  }

  getPort(): MissionPersistencePort {
    return this.requirePort();
  }

  private async initialize(): Promise<void> {
    if (this.port) {
      const opened = await this.port.open();
      this.storageModeSignal.set(opened.storageMode);
      if (opened.diagnostic) {
        this.diagnosticSignal.set(opened.diagnostic);
      }
      this.readySignal.set(opened.ok || opened.storageMode === 'memory');
      return;
    }

    const indexed = createIndexedDbMissionPersistenceAdapter();
    const opened = await indexed.open();
    if (opened.ok && opened.storageMode === 'indexeddb') {
      this.port = indexed;
      this.storageModeSignal.set('indexeddb');
      this.readySignal.set(true);
      return;
    }

    await indexed.close().catch(() => undefined);
    const memory = createMemoryMissionPersistenceAdapter();
    const memoryOpen = await memory.open();
    this.port = memory;
    this.storageModeSignal.set('memory');
    this.diagnosticSignal.set(
      memoryOpen.diagnostic ?? {
        code: MISSION_PERSISTENCE_DIAGNOSTICS.FALLBACK_MEMORY,
        message:
          'Mission results are stored in memory only for this session and will not survive reload.',
      },
    );
    this.readySignal.set(true);
  }

  private async persistPersonalBestImages(
    port: MissionPersistencePort,
    dto: PersistedMissionResultRecord,
    presentationImages: readonly MissionSessionPresentationImage[],
    generation: number,
  ): Promise<'complete' | 'partial' | 'failed' | 'none' | 'saved-without-images'> {
    const expectedObjectiveIds = dto.objectives
      .filter((o) => o.status === 'completed' && o.acceptedImageAvailable)
      .map((o) => o.objectiveId);

    if (expectedObjectiveIds.length === 0) {
      return 'none';
    }

    const payloads: MissionBestImagePayload[] = [];
    for (const image of presentationImages) {
      if (!expectedObjectiveIds.includes(image.objectiveId) || !image.blob) {
        continue;
      }
      try {
        const data = await image.blob.arrayBuffer();
        payloads.push({
          objectiveId: image.objectiveId,
          mimeType: image.mimeType || image.blob.type || 'image/jpeg',
          byteLength: image.byteLength || data.byteLength,
          data,
        });
      } catch {
        // Skip unreadable blobs; image failure must not invalidate the result.
      }
    }

    if (generation !== this.saveGeneration) {
      return 'none';
    }

    try {
      const outcome = await port.saveBestImages(
        String(dto.missionScopeKey),
        dto.resultId,
        payloads,
        expectedObjectiveIds,
      );
      if (outcome.diagnostic) {
        this.diagnosticSignal.set(outcome.diagnostic);
      }
      if (outcome.status === 'complete') {
        return 'complete';
      }
      if (outcome.status === 'partial') {
        return 'partial';
      }
      if (outcome.status === 'none') {
        return 'none';
      }
      return 'saved-without-images';
    } catch (error) {
      this.diagnosticSignal.set({
        code: MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
        message: error instanceof Error ? error.message : String(error),
      });
      return 'saved-without-images';
    }
  }

  private applyUiStatus(input: {
    readonly completed: boolean;
    readonly becamePersonalBest: boolean;
    readonly imageStatus: string;
  }): void {
    if (this.storageModeSignal() === 'memory') {
      this.saveStatusSignal.set(
        input.completed && input.becamePersonalBest ? 'memory-only' : 'memory-only',
      );
      // Failed attempts in memory still report attempt-saved semantics via note.
      if (!input.completed) {
        this.saveStatusSignal.set('attempt-saved');
      }
      return;
    }

    if (!input.completed) {
      this.saveStatusSignal.set('attempt-saved');
      return;
    }

    if (input.becamePersonalBest) {
      if (input.imageStatus === 'complete' || input.imageStatus === 'none') {
        this.saveStatusSignal.set('saved-new-personal-best');
        return;
      }
      this.saveStatusSignal.set('saved-without-images');
      return;
    }

    this.saveStatusSignal.set('saved');
  }

  private requirePort(): MissionPersistencePort {
    if (!this.port) {
      throw new Error('Mission persistence port is not ready');
    }
    return this.port;
  }
}
