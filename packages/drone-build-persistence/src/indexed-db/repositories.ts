/**
 * IndexedDB-backed repositories.
 * Implementations are browser-only and intentionally thin — domain never imports IDB.
 * In Node / SSR this module is a no-op stub that throws if used.
 */

import { infrastructureError } from '@fpv/engineering-kernel';
import type {
  ComponentCatalogRepository,
  CompiledArtifactRepository,
  DroneBuildRepository,
} from '../ports/repositories';
import { insertImmutableRevision } from '../ports/repositories';
import type { DroneBuildRevision } from '@fpv/drone-build-domain';

const IDB_NAME = 'fpv-drone-builder-v1';
const IDB_VERSION = 1;

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

export async function openDroneBuilderDb(): Promise<IDBDatabase> {
  const indexedDB = assertBrowser();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('builds')) {
        db.createObjectStore('builds', { keyPath: 'buildId' });
      }
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'buildId' });
      }
      if (!db.objectStoreNames.contains('revisions')) {
        db.createObjectStore('revisions', { keyPath: 'revisionId' });
      }
      if (!db.objectStoreNames.contains('artifacts')) {
        db.createObjectStore('artifacts', { keyPath: 'cacheKey' });
      }
      if (!db.objectStoreNames.contains('catalogRevisions')) {
        db.createObjectStore('catalogRevisions', { keyPath: 'revisionId' });
      }
      if (!db.objectStoreNames.contains('catalogReleases')) {
        db.createObjectStore('catalogReleases', { keyPath: 'releaseId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(
        infrastructureError('IDB_OPEN_FAILED', String(req.error?.message ?? 'open failed')),
      );
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () =>
      reject(infrastructureError('IDB_GET_FAILED', String(req.error?.message)));
  });
}

async function idbPut(storeName: string, value: unknown): Promise<void> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(infrastructureError('IDB_PUT_FAILED', String(tx.error?.message)));
  });
}

/** Create-only insert — fails if key already exists. */
async function idbAdd(storeName: string, value: unknown): Promise<void> {
  const db = await openDroneBuilderDb();
  return new Promise((resolve, reject) => {
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
  });
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
      return idbGet('drafts', buildId);
    },
    async saveDraft(draft) {
      await idbPut('drafts', draft);
    },
    async getRevision(id) {
      return idbGet('revisions', id);
    },
    async revisionExists(id) {
      return (await idbGet('revisions', id)) != null;
    },
    async insertRevision(revision) {
      await insertImmutableRevision(
        {
          getRevision: (id) => idbGet<DroneBuildRevision>('revisions', id),
          putNew: async (r) => {
            await idbAdd('revisions', r);
          },
        },
        revision,
      );
    },
    async saveRevision(revision) {
      await this.insertRevision(revision);
    },
  };
}

export function createIndexedDbArtifactRepository(): CompiledArtifactRepository {
  return {
    async get(bf, ctx, eng, comp) {
      const cacheKey = `${bf}|${ctx}|${eng}|${comp}`;
      const row = await idbGet<{
        cacheKey: string;
        record: import('../ports/repositories').CompiledArtifactRecord;
      }>('artifacts', cacheKey);
      return row?.record ?? null;
    },
    async save(record) {
      const cacheKey = `${record.buildFingerprint}|${record.compilationContextFingerprint}|${record.engineeringModelVersion}|${record.compilerVersion}`;
      await idbPut('artifacts', { cacheKey, record });
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
        const rev = await idbGet<import('@fpv/component-catalog').ComponentRevision>(
          'catalogRevisions',
          id,
        );
        if (rev) out.push(rev);
      }
      return out;
    },
  };
}
