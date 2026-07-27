/**
 * Read-only history facade for Expeditions progress and Personal Best display.
 * Never exposes IndexedDB objects.
 */

import { Injectable, computed, inject, signal } from '@angular/core';

import {
  buildMissionScopeKey,
  type MissionBestImageStatus,
  type MissionPersistenceDiagnostic,
  type MissionPersistenceStorageMode,
  type PersistedMissionResultRecord,
  type PersistedMissionSummaryRecord,
} from '@fpv/mission-persistence';

import { MissionPersistenceCoordinator } from './mission-persistence.coordinator';
import { revokeObjectUrl } from '../mission/services/mission-results.facade';

export interface MissionHistoryBestImageView {
  readonly objectiveId: string;
  readonly objectUrl: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly personalBestResultId: string;
}

export interface MissionHistoryViewModel {
  readonly loading: boolean;
  readonly storageMode: MissionPersistenceStorageMode;
  readonly missionScopeKey: string | null;
  readonly summary: PersistedMissionSummaryRecord | null;
  readonly personalBest: PersistedMissionResultRecord | null;
  readonly latestResult: PersistedMissionResultRecord | null;
  readonly recentResults: readonly PersistedMissionResultRecord[];
  readonly completed: boolean;
  readonly completionCount: number;
  readonly lastPlayedAtIso: string | null;
  readonly imageStatus: MissionBestImageStatus;
  readonly bestImages: readonly MissionHistoryBestImageView[];
  readonly diagnostic: MissionPersistenceDiagnostic | null;
  readonly memoryOnly: boolean;
}

const EMPTY: MissionHistoryViewModel = {
  loading: false,
  storageMode: 'unavailable',
  missionScopeKey: null,
  summary: null,
  personalBest: null,
  latestResult: null,
  recentResults: [],
  completed: false,
  completionCount: 0,
  lastPlayedAtIso: null,
  imageStatus: 'none',
  bestImages: [],
  diagnostic: null,
  memoryOnly: false,
};

@Injectable({ providedIn: 'root' })
export class MissionHistoryFacade {
  private readonly coordinator = inject(MissionPersistenceCoordinator);
  private readonly viewModelSignal = signal<MissionHistoryViewModel>(EMPTY);
  private refreshGeneration = 0;
  private readonly imageUrls: string[] = [];

  readonly viewModel = this.viewModelSignal.asReadonly();
  readonly loading = computed(() => this.viewModelSignal().loading);
  readonly storageMode = computed(() => this.viewModelSignal().storageMode);

  async refreshForMission(input: {
    readonly missionId: string;
    readonly missionVersion: string;
    readonly scoringPolicyVersion: string;
    readonly recentLimit?: number;
  }): Promise<void> {
    const generation = ++this.refreshGeneration;
    const scopeKey = String(
      buildMissionScopeKey({
        missionId: input.missionId,
        missionVersion: input.missionVersion,
        scoringPolicyVersion: input.scoringPolicyVersion,
      }),
    );

    this.revokeImages();
    this.viewModelSignal.set({
      ...EMPTY,
      loading: true,
      missionScopeKey: scopeKey,
      storageMode: this.coordinator.storageMode(),
      memoryOnly: this.coordinator.storageMode() === 'memory',
    });

    await this.coordinator.ensureReady();
    if (generation !== this.refreshGeneration) {
      return;
    }

    const port = this.coordinator.getPort();
    const [summaryResult, recentResult, pbResult] = await Promise.all([
      port.getMissionSummary(scopeKey),
      port.listRecentResults(scopeKey, input.recentLimit ?? 5),
      port.getPersonalBest(scopeKey),
    ]);

    if (generation !== this.refreshGeneration) {
      return;
    }

    const summary = summaryResult.summary;
    const personalBest = pbResult.result;
    const recent = recentResult.results;
    const latestResult = recent[0] ?? null;

    let bestImages: MissionHistoryBestImageView[] = [];
    if (personalBest && summary?.personalBestResultId === personalBest.resultId) {
      const imagesResult = await port.getBestImages(scopeKey, personalBest.resultId);
      if (generation !== this.refreshGeneration) {
        return;
      }
      if (imagesResult.ok) {
        bestImages = imagesResult.images.map((image) => {
          const blob = new Blob([new Uint8Array(image.data)], {
            type: image.manifest.mimeType,
          });
          const objectUrl =
            typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
              ? URL.createObjectURL(blob)
              : '';
          if (objectUrl) {
            this.imageUrls.push(objectUrl);
          }
          return {
            objectiveId: image.manifest.objectiveId,
            objectUrl,
            mimeType: image.manifest.mimeType,
            byteLength: image.manifest.byteLength,
            personalBestResultId: image.manifest.personalBestResultId,
          };
        });
      }
    }

    const diagnostic =
      summaryResult.diagnostic ??
      recentResult.diagnostic ??
      pbResult.diagnostic ??
      this.coordinator.diagnostic();

    this.viewModelSignal.set({
      loading: false,
      storageMode: this.coordinator.storageMode(),
      missionScopeKey: scopeKey,
      summary,
      personalBest,
      latestResult,
      recentResults: recent,
      completed: summary?.completed ?? false,
      completionCount: summary?.completionCount ?? 0,
      lastPlayedAtIso: summary?.lastPlayedAtIso ?? null,
      imageStatus: summary?.personalBestImageStatus ?? 'none',
      bestImages,
      diagnostic,
      memoryOnly: this.coordinator.storageMode() === 'memory',
    });
  }

  async clearMissionScope(missionScopeKey: string): Promise<boolean> {
    await this.coordinator.ensureReady();
    const result = await this.coordinator.getPort().clearMissionScope(missionScopeKey);
    this.revokeImages();
    return result.ok;
  }

  async clearAllMissionData(): Promise<boolean> {
    await this.coordinator.ensureReady();
    const result = await this.coordinator.getPort().clearAllMissionData();
    this.revokeImages();
    this.viewModelSignal.set(EMPTY);
    return result.ok;
  }

  release(): void {
    this.refreshGeneration += 1;
    this.revokeImages();
    this.viewModelSignal.set(EMPTY);
  }

  private revokeImages(): void {
    for (const url of this.imageUrls) {
      revokeObjectUrl(url);
    }
    this.imageUrls.length = 0;
  }
}
