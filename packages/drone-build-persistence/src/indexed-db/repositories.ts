/**
 * IndexedDB-backed repositories.
 * Implementations are browser-only and intentionally thin — domain never imports IDB.
 * In Node / SSR this module throws if IndexedDB is unavailable.
 */

import { infrastructureError } from '@fpv/engineering-kernel';
import type {
  ComponentCatalogRepository,
  CompiledArtifactRepository,
  DroneBuildRepository,
  UserBuildLibraryRepository,
} from '../ports/repositories';
import { insertImmutableRevision } from '../ports/repositories';
import type { DroneBuild, DroneBuildDraft, DroneBuildRevision } from '@fpv/drone-build-domain';
import type { DroneBuildId, DroneBuildRevisionId } from '@fpv/engineering-kernel';
import {
  createDraftEnvelope,
  parsePersistedCompiledRevision,
  parsePersistedDraft,
  type PersistedCompiledRevisionRecord,
  type PersistedDraftRecord,
  type ValidatedRecordResult,
} from '../records/persisted-records';

export const IDB_NAME = 'fpv-drone-builder-v1';
export const IDB_VERSION = 1;

export const IDB_STORES = {
  builds: 'builds',
  drafts: 'drafts',
  revisions: 'revisions',
  artifacts: 'artifacts',
  catalogRevisions: 'catalogRevisions',
  catalogReleases: 'catalogReleases',
} as const;

function assertBrowser(): IDBFactory {
  const g = globalThis as { indexedDB?: IDBFactory };
  if (!g.indexedDB) {
    throw infrastructureError(
      'IDB_UNAVAILABLE',
      'IndexedDB is not available in this environment',
    );
  }
  return g.indexedDB;
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof (globalThis as { indexedDB?: IDBFactory }).indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

let sharedDb: IDBDatabase | null = null;
let openPromise: Promise<IDBDatabase> | null = null;

export async function openDroneBuilderDb(): Promise<IDBDatabase> {
  if (sharedDb) return sharedDb;
  if (openPromise) return openPromise;

  const indexedDB = assertBrowser();
  openPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORES.builds)) {
        db.createObjectStore(IDB_STORES.builds, { keyPath: 'buildId' });
      }
      if (!db.objectStoreNames.contains(IDB_STORES.drafts)) {
        db.createObjectStore(IDB_STORES.drafts, { keyPath: 'buildId' });
      }
      if (!db.objectStoreNames.contains(IDB_STORES.revisions)) {
        const rev = db.createObjectStore(IDB_STORES.revisions, {
          keyPath: 'revisionId',
        });
        // Index helps list revisions by source build without scanning keys only.
        if (!rev.indexNames.contains('byBuildId')) {
          rev.createIndex('byBuildId', 'buildId', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(IDB_STORES.artifacts)) {
        db.createObjectStore(IDB_STORES.artifacts, { keyPath: 'cacheKey' });
      }
      if (!db.objectStoreNames.contains(IDB_STORES.catalogRevisions)) {
        db.createObjectStore(IDB_STORES.catalogRevisions, {
          keyPath: 'revisionId',
        });
      }
      if (!db.objectStoreNames.contains(IDB_STORES.catalogReleases)) {
        db.createObjectStore(IDB_STORES.catalogReleases, {
          keyPath: 'releaseId',
        });
      }
    };
    req.onsuccess = () => {
      sharedDb = req.result;
      sharedDb.onversionchange = () => {
        sharedDb?.close();
        sharedDb = null;
        openPromise = null;
      };
      resolve(sharedDb);
    };
    req.onerror = () => {
      openPromise = null;
      reject(
        infrastructureError(
          'IDB_OPEN_FAILED',
          String(req.error?.message ?? 'open failed'),
        ),
      );
    };
  });

  try {
    return await openPromise;
  } catch (error) {
    openPromise = null;
    throw error;
  }
}

/** Test helper — closes and forgets the shared connection. */
export async function resetDroneBuilderDbConnection(): Promise<void> {
  if (sharedDb) {
    sharedDb.close();
    sharedDb = null;
  }
  openPromise = null;
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () =>
        reject(
          infrastructureError('IDB_GET_FAILED', String(req.error?.message)),
        );
      tx.onerror = () =>
        reject(
          infrastructureError('IDB_TX_FAILED', String(tx.error?.message)),
        );
    } catch (error) {
      reject(
        infrastructureError(
          'IDB_TX_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
}

async function idbPut(storeName: string, value: unknown): Promise<void> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          infrastructureError('IDB_PUT_FAILED', String(tx.error?.message)),
        );
      tx.onabort = () =>
        reject(
          infrastructureError(
            'IDB_TX_ABORTED',
            String(tx.error?.message ?? 'transaction aborted'),
          ),
        );
    } catch (error) {
      reject(
        infrastructureError(
          'IDB_PUT_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
}

/** Create-only insert — fails if key already exists. */
async function idbAdd(storeName: string, value: unknown): Promise<void> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).add(value);
      req.onsuccess = () => resolve();
      req.onerror = () =>
        reject(
          infrastructureError(
            'IDB_ADD_FAILED',
            String(req.error?.message ?? 'add failed'),
            { name: req.error?.name },
          ),
        );
      tx.onerror = () =>
        reject(
          infrastructureError('IDB_TX_FAILED', String(tx.error?.message)),
        );
    } catch (error) {
      reject(
        infrastructureError(
          'IDB_ADD_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          infrastructureError('IDB_DELETE_FAILED', String(tx.error?.message)),
        );
    } catch (error) {
      reject(
        infrastructureError(
          'IDB_DELETE_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () =>
        reject(
          infrastructureError('IDB_GETALL_FAILED', String(req.error?.message)),
        );
    } catch (error) {
      reject(
        infrastructureError(
          'IDB_GETALL_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
}

async function idbGetAllKeys(storeName: string): Promise<string[]> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAllKeys();
      req.onsuccess = () =>
        resolve(((req.result as IDBValidKey[]) ?? []).map(String));
      req.onerror = () =>
        reject(
          infrastructureError(
            'IDB_GETALLKEYS_FAILED',
            String(req.error?.message),
          ),
        );
    } catch (error) {
      reject(
        infrastructureError(
          'IDB_GETALLKEYS_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  });
}

function unwrapDraft(raw: unknown): DroneBuildDraft | null {
  const parsed = parsePersistedDraft(raw);
  if (parsed.ok) return parsed.record.draft;
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { mutable?: boolean }).mutable === true
  ) {
    return raw as DroneBuildDraft;
  }
  return null;
}

function unwrapRevision(raw: unknown): DroneBuildRevision | null {
  const parsed = parsePersistedCompiledRevision(raw);
  if (parsed.ok) return parsed.record.revision;
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { immutable?: boolean }).immutable === true
  ) {
    return raw as DroneBuildRevision;
  }
  return null;
}

function revisionStorageKey(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj['revisionId'] === 'string') return obj['revisionId'];
  const nested = obj['revision'];
  if (
    nested &&
    typeof nested === 'object' &&
    typeof (nested as Record<string, unknown>)['revisionId'] === 'string'
  ) {
    return (nested as Record<string, unknown>)['revisionId'] as string;
  }
  return null;
}

function buildIdFromRevisionRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj['buildId'] === 'string') return obj['buildId'];
  const nested = obj['revision'];
  if (
    nested &&
    typeof nested === 'object' &&
    typeof (nested as Record<string, unknown>)['buildId'] === 'string'
  ) {
    return (nested as Record<string, unknown>)['buildId'] as string;
  }
  return null;
}

/** Factory for IndexedDB build repository — call only in browser. */
export function createIndexedDbBuildRepository(): DroneBuildRepository {
  return {
    async getBuild(id) {
      return idbGet('builds', id);
    },
    async saveBuild(build) {
      await idbPut('builds', build);
    },
    async getDraft(buildId) {
      const raw = await idbGet<unknown>('drafts', buildId);
      if (!raw) return null;
      return unwrapDraft(raw);
    },
    async saveDraft(draft) {
      const existing = await idbGet<unknown>('drafts', draft.buildId);
      const parsed = existing ? parsePersistedDraft(existing) : null;
      const envelope = createDraftEnvelope({
        draft,
        intentId: parsed?.ok ? parsed.record.intentId : null,
        sourceType: parsed?.ok ? parsed.record.sourceType : 'user-draft',
        createdAtIso: parsed?.ok
          ? parsed.record.createdAtIso
          : new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
        compileStatus: parsed?.ok
          ? parsed.record.compileStatus
          : 'never-compiled',
        attentionStatus: parsed?.ok ? parsed.record.attentionStatus : 'ok',
      });
      await idbPut('drafts', envelope);
    },
    async getRevision(id) {
      const raw = await idbGet<unknown>('revisions', id);
      if (!raw) return null;
      return unwrapRevision(raw);
    },
    async revisionExists(id) {
      return (await idbGet('revisions', id)) != null;
    },
    async insertRevision(revision) {
      await insertImmutableRevision(
        {
          getRevision: async (id) => {
            const raw = await idbGet<unknown>('revisions', id);
            return raw ? unwrapRevision(raw) : null;
          },
          putNew: async (r) => {
            // Store bare domain revision only when called via domain port;
            // library port stores envelopes.
            await idbAdd('revisions', r);
          },
        },
        revision,
      );
    },
    async saveRevision(revision) {
      await this.insertRevision(revision);
    },
    async listBuildIds() {
      return (await idbGetAllKeys('builds')) as DroneBuildId[];
    },
    async listDraftIds() {
      return (await idbGetAllKeys('drafts')) as DroneBuildId[];
    },
    async listRevisionIds() {
      const all = await idbGetAll<unknown>('revisions');
      return all
        .map(revisionStorageKey)
        .filter((id): id is string => !!id) as DroneBuildRevisionId[];
    },
    async listRevisionsForBuild(buildId) {
      const all = await idbGetAll<unknown>('revisions');
      const out: DroneBuildRevision[] = [];
      for (const raw of all) {
        if (buildIdFromRevisionRaw(raw) !== buildId) continue;
        const rev = unwrapRevision(raw);
        if (rev) out.push(rev);
      }
      return out;
    },
    async deleteDraft(buildId) {
      await idbDelete('drafts', buildId);
    },
    async deleteBuild(buildId) {
      await idbDelete('builds', buildId);
    },
    async deleteRevision(revisionId) {
      await idbDelete('revisions', revisionId);
    },
  };
}

export function createIndexedDbUserBuildLibraryRepository(): UserBuildLibraryRepository {
  const builds = createIndexedDbBuildRepository();
  return {
    async saveDraftRecord(record: PersistedDraftRecord) {
      await idbPut('drafts', record);
    },
    async getDraftRecord(buildId) {
      const raw = await idbGet<unknown>('drafts', buildId);
      if (raw == null) return null;
      return parsePersistedDraft(raw);
    },
    async listDraftRecords() {
      const all = await idbGetAll<unknown>('drafts');
      const valid: PersistedDraftRecord[] = [];
      const invalid: ValidatedRecordResult<PersistedDraftRecord>[] = [];
      for (const raw of all) {
        const parsed = parsePersistedDraft(raw);
        if (parsed.ok) valid.push(parsed.record);
        else invalid.push(parsed);
      }
      valid.sort((a, b) => a.updatedAtIso.localeCompare(b.updatedAtIso));
      return { valid, invalid };
    },
    async deleteDraftRecord(buildId) {
      await idbDelete('drafts', buildId);
    },
    async saveCompiledRevisionRecord(record: PersistedCompiledRevisionRecord) {
      const existing = await idbGet<unknown>('revisions', record.revisionId);
      if (!existing) {
        await idbAdd('revisions', record);
        return;
      }
      const parsed = parsePersistedCompiledRevision(existing);
      if (parsed.ok) {
        // Idempotent when same artifact fingerprint / same domain revision
        if (
          parsed.record.artifactFingerprint === record.artifactFingerprint &&
          parsed.record.revisionId === record.revisionId
        ) {
          return;
        }
      }
      // Domain immutability: conflicting content must not overwrite
      const existingRev = unwrapRevision(existing);
      if (existingRev) {
        await insertImmutableRevision(
          {
            getRevision: async () => existingRev,
            putNew: async () => {
              /* unreachable when existing */
            },
          },
          record.revision,
        );
      }
    },
    async getCompiledRevisionRecord(revisionId) {
      const raw = await idbGet<unknown>('revisions', revisionId);
      if (raw == null) return null;
      return parsePersistedCompiledRevision(raw);
    },
    async listCompiledRevisionRecords() {
      const all = await idbGetAll<unknown>('revisions');
      const valid: PersistedCompiledRevisionRecord[] = [];
      const invalid: ValidatedRecordResult<PersistedCompiledRevisionRecord>[] =
        [];
      for (const raw of all) {
        const parsed = parsePersistedCompiledRevision(raw);
        if (parsed.ok) valid.push(parsed.record);
        else invalid.push(parsed);
      }
      valid.sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
      return { valid, invalid };
    },
    async listCompiledRevisionRecordsForBuild(buildId) {
      const listed = await this.listCompiledRevisionRecords();
      return {
        valid: listed.valid.filter((r) => r.buildId === buildId),
        invalid: listed.invalid,
      };
    },
    async deleteCompiledRevisionRecord(revisionId) {
      await idbDelete('revisions', revisionId);
    },
    async saveBuild(build: DroneBuild) {
      await builds.saveBuild(build);
    },
    async getBuild(id) {
      return builds.getBuild(id);
    },
    async deleteBuild(buildId) {
      await builds.deleteBuild(buildId);
    },
  };
}

export function createIndexedDbArtifactRepository(): CompiledArtifactRepository {
  return {
    async get(bf, ctx, runtime, eng, comp) {
      const cacheKey = `${bf}|${ctx}|${runtime}|${eng}|${comp}`;
      const row = await idbGet<{
        cacheKey: string;
        record: import('../ports/repositories').CompiledArtifactRecord;
      }>('artifacts', cacheKey);
      return row?.record ?? null;
    },
    async save(record) {
      const cacheKey = `${record.buildFingerprint}|${record.compilationContextFingerprint}|${record.runtimeCompatibilitySignature}|${record.engineeringModelVersion}|${record.compilerVersion}`;
      await idbPut('artifacts', { cacheKey, record });
    },
    async list() {
      const rows = await idbGetAll<{
        cacheKey: string;
        record: import('../ports/repositories').CompiledArtifactRecord;
      }>('artifacts');
      return rows.map((r) => r.record);
    },
  };
}

export function createIndexedDbCatalogRepository(): ComponentCatalogRepository {
  return {
    async getRelease(id) {
      return idbGet('catalogReleases', id);
    },
    async getRevision(id) {
      return idbGet('catalogRevisions', id);
    },
    async listRevisionsForRelease(releaseId) {
      const release = await idbGet<{
        releaseId: string;
        componentRevisionIds: string[];
      }>('catalogReleases', releaseId);
      if (!release) return [];
      const out: import('@fpv/component-catalog').ComponentRevision[] = [];
      for (const id of release.componentRevisionIds) {
        const rev = await idbGet<
          import('@fpv/component-catalog').ComponentRevision
        >('catalogRevisions', id);
        if (rev) out.push(rev);
      }
      return out;
    },
  };
}
