import { Injectable, signal } from '@angular/core';
import type { DroneBuild, DroneBuildDraft } from '@fpv/drone-build-domain';
import type { DroneBuildId, DroneBuildRevisionId } from '@fpv/engineering-kernel';
import {
  createIndexedDbArtifactRepository,
  createIndexedDbBuildRepository,
  createIndexedDbUserBuildLibraryRepository,
  createLinkedMemoryPersistence,
  isIndexedDbAvailable,
  openDroneBuilderDb,
  type CompiledArtifactRecord,
  type CompiledArtifactRepository,
  type DroneBuildRepository,
  type PersistedCompiledRevisionRecord,
  type PersistedDraftRecord,
  type UserBuildLibraryRepository,
  type ValidatedRecordResult,
} from '@fpv/drone-build-persistence';

export type PersistenceBackendMode = 'indexeddb' | 'memory-fallback';

export type PersistenceHealth =
  | 'ready'
  | 'unavailable'
  | 'degraded'
  | 'failed';

/**
 * Angular application adapter over persistence ports.
 * Components must not call IndexedDB APIs directly.
 */
@Injectable({ providedIn: 'root' })
export class DroneBuildPersistenceService {
  private builds!: DroneBuildRepository;
  private library!: UserBuildLibraryRepository;
  private artifacts!: CompiledArtifactRepository;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private readonly _backend = signal<PersistenceBackendMode>('memory-fallback');
  private readonly _health = signal<PersistenceHealth>('unavailable');
  private readonly _userMessage = signal<string | null>(null);

  readonly backend = this._backend.asReadonly();
  readonly health = this._health.asReadonly();
  readonly userMessage = this._userMessage.asReadonly();

  readonly isPersistent = () => this._backend() === 'indexeddb';

  async ensureReady(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  getBuildRepository(): DroneBuildRepository {
    this.assertInitialized();
    return this.builds;
  }

  getLibraryRepository(): UserBuildLibraryRepository {
    this.assertInitialized();
    return this.library;
  }

  getArtifactRepository(): CompiledArtifactRepository {
    this.assertInitialized();
    return this.artifacts;
  }

  async saveDraftRecord(record: PersistedDraftRecord): Promise<void> {
    await this.ensureReady();
    try {
      await this.library.saveDraftRecord(record);
      if (this._backend() === 'memory-fallback') {
        this._userMessage.set(
          'Persistent storage is unavailable. Your changes are currently saved only for this session.',
        );
      } else {
        this._userMessage.set(null);
      }
    } catch (error) {
      this.handleWriteFailure(error);
      throw error;
    }
  }

  async getDraftRecord(
    buildId: DroneBuildId | string,
  ): Promise<ValidatedRecordResult<PersistedDraftRecord> | null> {
    await this.ensureReady();
    return this.library.getDraftRecord(buildId as DroneBuildId);
  }

  async listDraftRecords(): Promise<{
    valid: readonly PersistedDraftRecord[];
    invalid: readonly ValidatedRecordResult<PersistedDraftRecord>[];
  }> {
    await this.ensureReady();
    try {
      return await this.library.listDraftRecords();
    } catch (error) {
      this.handleReadFailure(error);
      return { valid: [], invalid: [] };
    }
  }

  async deleteDraftRecord(buildId: DroneBuildId | string): Promise<void> {
    await this.ensureReady();
    await this.library.deleteDraftRecord(buildId as DroneBuildId);
  }

  async saveCompiledRevisionRecord(
    record: PersistedCompiledRevisionRecord,
  ): Promise<void> {
    await this.ensureReady();
    try {
      await this.library.saveCompiledRevisionRecord(record);
      if (record.artifact) {
        await this.artifacts.save(record.artifact);
      }
    } catch (error) {
      this.handleWriteFailure(error);
      throw error;
    }
  }

  async listCompiledRevisionRecords(): Promise<{
    valid: readonly PersistedCompiledRevisionRecord[];
    invalid: readonly ValidatedRecordResult<PersistedCompiledRevisionRecord>[];
  }> {
    await this.ensureReady();
    try {
      return await this.library.listCompiledRevisionRecords();
    } catch (error) {
      this.handleReadFailure(error);
      return { valid: [], invalid: [] };
    }
  }

  async listCompiledRevisionRecordsForBuild(
    buildId: DroneBuildId | string,
  ): Promise<{
    valid: readonly PersistedCompiledRevisionRecord[];
    invalid: readonly ValidatedRecordResult<PersistedCompiledRevisionRecord>[];
  }> {
    await this.ensureReady();
    return this.library.listCompiledRevisionRecordsForBuild(
      buildId as DroneBuildId,
    );
  }

  async getCompiledRevisionRecord(
    revisionId: DroneBuildRevisionId | string,
  ): Promise<ValidatedRecordResult<PersistedCompiledRevisionRecord> | null> {
    await this.ensureReady();
    return this.library.getCompiledRevisionRecord(
      revisionId as DroneBuildRevisionId,
    );
  }

  async deleteCompiledRevisionRecord(
    revisionId: DroneBuildRevisionId | string,
  ): Promise<void> {
    await this.ensureReady();
    await this.library.deleteCompiledRevisionRecord(
      revisionId as DroneBuildRevisionId,
    );
  }

  async saveBuild(build: DroneBuild): Promise<void> {
    await this.ensureReady();
    await this.library.saveBuild(build);
  }

  async getBuild(id: DroneBuildId | string): Promise<DroneBuild | null> {
    await this.ensureReady();
    return this.library.getBuild(id as DroneBuildId);
  }

  async deleteBuild(buildId: DroneBuildId | string): Promise<void> {
    await this.ensureReady();
    await this.library.deleteBuild(buildId as DroneBuildId);
  }

  async saveDomainDraft(draft: DroneBuildDraft): Promise<void> {
    await this.ensureReady();
    await this.builds.saveDraft(draft);
  }

  /** Test override — swaps in linked memory backends. */
  replaceWithMemoryForTests(): void {
    const linked = createLinkedMemoryPersistence();
    this.builds = linked.builds;
    this.library = linked.library;
    this.artifacts = linked.artifacts;
    this._backend.set('memory-fallback');
    this._health.set('unavailable');
    this._userMessage.set(
      'Persistent storage is unavailable. Your changes are currently saved only for this session.',
    );
    this.initialized = true;
  }

  replaceRepositoriesForTests(input: {
    builds: DroneBuildRepository;
    library: UserBuildLibraryRepository;
    artifacts?: CompiledArtifactRepository;
    backend?: PersistenceBackendMode;
  }): void {
    this.builds = input.builds;
    this.library = input.library;
    this.artifacts =
      input.artifacts ?? createLinkedMemoryPersistence().artifacts;
    this._backend.set(input.backend ?? 'memory-fallback');
    this._health.set(
      input.backend === 'indexeddb' ? 'ready' : 'unavailable',
    );
    this.initialized = true;
  }

  private async initialize(): Promise<void> {
    if (!isIndexedDbAvailable()) {
      this.useMemoryFallback(
        'Persistent storage is unavailable. Your changes are currently saved only for this session.',
      );
      this.initialized = true;
      return;
    }

    try {
      await openDroneBuilderDb();
      this.builds = createIndexedDbBuildRepository();
      this.library = createIndexedDbUserBuildLibraryRepository();
      this.artifacts = createIndexedDbArtifactRepository();
      // Probe a read to confirm transactions work.
      await this.library.listDraftRecords();
      this._backend.set('indexeddb');
      this._health.set('ready');
      this._userMessage.set(null);
      this.initialized = true;
    } catch (error) {
      this.useMemoryFallback(
        'Persistent storage is unavailable. Your changes are currently saved only for this session.',
      );
      this._health.set('failed');
      this.initialized = true;
      console.warn('[drone-build-persistence] IndexedDB init failed', error);
    }
  }

  private useMemoryFallback(message: string): void {
    const linked = createLinkedMemoryPersistence();
    this.builds = linked.builds;
    this.library = linked.library;
    this.artifacts = linked.artifacts;
    this._backend.set('memory-fallback');
    this._health.set('unavailable');
    this._userMessage.set(message);
  }

  private handleWriteFailure(error: unknown): void {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        /quota/i.test(error.message ?? ''));
    this._health.set(quota ? 'degraded' : 'failed');
    this._userMessage.set(
      quota
        ? 'Storage quota exceeded. Your latest changes may not be saved permanently.'
        : 'Saving failed — persistent storage encountered an error. Retry or continue in this session only.',
    );
  }

  private handleReadFailure(error: unknown): void {
    this._health.set('degraded');
    this._userMessage.set(
      'Saved builds cannot be loaded from this device right now.',
    );
    console.warn('[drone-build-persistence] read failed', error);
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'DroneBuildPersistenceService used before ensureReady()',
      );
    }
  }
}
