/**
 * Thin coordinator: one durable save per immutable session result.
 * Does not score, evaluate evidence, step physics, raycast, or block the flight loop.
 *
 * Core result persistence never waits on presentation rendering. Personal Best
 * image persistence may await settlement Blobs independently of UI object URLs.
 *
 * Storage failure policy (Checkpoint 6):
 * - IndexedDB open failure → memory fallback for the page lifetime
 * - Core transaction failure after a successful open → report save-failed and
 *   allow explicit retry with the same immutable result ID (do not auto-switch
 *   an already-open IndexedDB database to memory)
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
import type { MissionPresentationImageSettlement } from '../mission/services/mission-presentation-image-settlement';

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
  readonly objectiveVersions?: ReadonlyMap<string, string>;
  readonly aircraftId?: string | null;
  readonly aircraftSourceType?: string | null;
  readonly aircraftDefinitionVersion?: string | null;
  readonly aircraftPhysicsProfileVersion?: string | null;
  readonly aircraftRuntimeCompatibilityVersion?: string | null;
  readonly presentationSettlement?: MissionPresentationImageSettlement | null;
}

interface PendingFailedSave {
  readonly request: MissionPersistenceSaveRequest;
  readonly dto: PersistedMissionResultRecord;
}

@Injectable({ providedIn: 'root' })
export class MissionPersistenceCoordinator {
  private port: MissionPersistencePort | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly inFlightResultIds = new Set<string>();
  private readonly successfullySavedResultIds = new Set<string>();
  private lastFailedSave: PendingFailedSave | null = null;
  /** Bumped only to ignore stale UI status updates after retry/exit. */
  private uiGeneration = 0;

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

    if (this.successfullySavedResultIds.has(resultId)) {
      return;
    }
    if (this.inFlightResultIds.has(resultId)) {
      return;
    }
    this.inFlightResultIds.add(resultId);

    const uiGeneration = this.uiGeneration;
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
      objectiveVersions: request.objectiveVersions,
      aircraftId: request.aircraftId,
      aircraftSourceType: request.aircraftSourceType,
      aircraftDefinitionVersion: request.aircraftDefinitionVersion,
      aircraftPhysicsProfileVersion: request.aircraftPhysicsProfileVersion,
      aircraftRuntimeCompatibilityVersion: request.aircraftRuntimeCompatibilityVersion,
    });

    const missingVersion = dto.objectives.find(
      (o) => o.status === 'completed' && o.acceptedImageExpected && !o.objectiveVersion,
    );
    if (missingVersion) {
      this.inFlightResultIds.delete(resultId);
      this.lastFailedSave = null;
      if (uiGeneration === this.uiGeneration) {
        this.saveStatusSignal.set('save-failed');
        this.diagnosticSignal.set({
          code: MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID,
          message: `Missing authored objectiveVersion for ${missingVersion.objectiveId}`,
          details: { objectiveId: missingVersion.objectiveId },
        });
      }
      request.presentationSettlement?.release();
      return;
    }

    if (
      dto.status === 'completed' &&
      (!dto.aircraftId || !dto.aircraftSourceType || !dto.aircraftRuntimeCompatibilityVersion)
    ) {
      this.diagnosticSignal.set({
        code: MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID,
        message:
          'Trusted aircraft metadata missing from authoritative runtime; saving gameplay result without fabricated aircraft identity.',
        details: {
          aircraftId: dto.aircraftId,
          aircraftSourceType: dto.aircraftSourceType,
          aircraftRuntimeCompatibilityVersion: dto.aircraftRuntimeCompatibilityVersion,
        },
      });
    }

    let saveOutcome;
    try {
      saveOutcome = await port.saveMissionResult(dto);
    } catch (error) {
      this.inFlightResultIds.delete(resultId);
      this.lastFailedSave = { request, dto };
      if (uiGeneration === this.uiGeneration) {
        this.saveStatusSignal.set('save-failed');
        this.diagnosticSignal.set({
          code: MISSION_PERSISTENCE_DIAGNOSTICS.WRITE_FAILED,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (!saveOutcome.ok) {
      this.inFlightResultIds.delete(resultId);
      const validationFailed =
        saveOutcome.diagnostic?.code === MISSION_PERSISTENCE_DIAGNOSTICS.RECORD_INVALID;
      this.lastFailedSave = validationFailed ? null : { request, dto };
      if (uiGeneration === this.uiGeneration) {
        this.saveStatusSignal.set('save-failed');
        this.diagnosticSignal.set(
          saveOutcome.diagnostic ?? {
            code: MISSION_PERSISTENCE_DIAGNOSTICS.WRITE_FAILED,
            message: 'Mission result save failed',
          },
        );
      }
      return;
    }

    // Successful or idempotent duplicate — core result is committed.
    this.inFlightResultIds.delete(resultId);
    this.successfullySavedResultIds.add(resultId);
    this.lastFailedSave = null;

    if (uiGeneration === this.uiGeneration) {
      this.lastSummarySignal.set(saveOutcome.summary);
      this.becamePersonalBestSignal.set(saveOutcome.becamePersonalBest);
    }

    if (saveOutcome.becamePersonalBest) {
      if (uiGeneration === this.uiGeneration) {
        this.applyUiStatus({
          completed: dto.status === 'completed',
          becamePersonalBest: true,
          imageStatus: 'pending',
        });
      }

      const imageStatus = await this.persistPersonalBestImages(
        port,
        dto,
        request.presentationSettlement ?? null,
      );

      if (uiGeneration === this.uiGeneration) {
        this.applyUiStatus({
          completed: dto.status === 'completed',
          becamePersonalBest: true,
          imageStatus,
        });
      }
      return;
    }

    request.presentationSettlement?.release();
    if (uiGeneration === this.uiGeneration) {
      this.applyUiStatus({
        completed: dto.status === 'completed',
        becamePersonalBest: false,
        imageStatus: 'none',
      });
    }
  }

  /**
   * Explicit UI/action seam to retry a failed core write with the same
   * immutable persisted result and stable result ID.
   */
  async retryLastFailedSave(): Promise<void> {
    const failed = this.lastFailedSave;
    if (!failed) {
      return;
    }
    if (this.successfullySavedResultIds.has(failed.dto.resultId)) {
      this.lastFailedSave = null;
      return;
    }
    await this.saveSessionResult(failed.request);
  }

  /**
   * Call on retry / exit so stale async callbacks cannot update the results UI.
   * Does not cancel in-flight core or image persistence.
   */
  invalidatePendingUi(): void {
    this.uiGeneration += 1;
  }

  /** @deprecated Use invalidatePendingUi — persistence continues after retry/exit. */
  invalidatePending(): void {
    this.invalidatePendingUi();
  }

  resetSaveStatus(): void {
    this.saveStatusSignal.set('idle');
    this.becamePersonalBestSignal.set(false);
    // Keep diagnostic for failed-save retry context unless explicitly cleared later.
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
    settlement: MissionPresentationImageSettlement | null,
  ): Promise<'complete' | 'partial' | 'failed' | 'none' | 'saved-without-images' | 'pending'> {
    const expectedObjectiveIds = dto.objectives
      .filter((o) => o.status === 'completed' && o.acceptedImageExpected)
      .map((o) => o.objectiveId);

    if (expectedObjectiveIds.length === 0) {
      settlement?.release();
      return 'none';
    }

    if (!settlement) {
      return 'saved-without-images';
    }

    let settled;
    try {
      settled = await settlement.waitForSettled();
    } catch (error) {
      settlement.release();
      this.diagnosticSignal.set({
        code: MISSION_PERSISTENCE_DIAGNOSTICS.BEST_IMAGES_PERSIST_FAILED,
        message: error instanceof Error ? error.message : String(error),
      });
      return 'saved-without-images';
    }

    const payloads: MissionBestImagePayload[] = [];
    for (const image of settled) {
      if (image.status !== 'available' || !image.blob) {
        continue;
      }
      if (!expectedObjectiveIds.includes(image.objectiveId)) {
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

    try {
      const outcome = await port.saveBestImages(
        String(dto.missionScopeKey),
        dto.resultId,
        payloads,
        expectedObjectiveIds,
      );
      settlement.release();
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
      settlement.release();
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
      if (!input.completed) {
        this.saveStatusSignal.set('attempt-saved');
        return;
      }
      this.saveStatusSignal.set('memory-only');
      return;
    }

    if (!input.completed) {
      this.saveStatusSignal.set('attempt-saved');
      return;
    }

    if (input.becamePersonalBest) {
      if (input.imageStatus === 'pending') {
        this.saveStatusSignal.set('saved-new-personal-best-images-pending');
        return;
      }
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
