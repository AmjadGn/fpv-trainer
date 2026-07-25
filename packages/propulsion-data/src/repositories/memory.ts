import { domainError, hashCanonical } from '@fpv/engineering-kernel';
import type {
  PropulsionCalibrationRevisionId,
  PropulsionDatasetRevisionId,
} from '../domain/ids';
import type { PropulsionPerformanceDatasetRevision } from '../domain/models';
import type { PropulsionCalibrationProfileRevision } from '../domain/calibration';
import { physicalDatasetPayload } from '../fingerprinting/fingerprint';
import { physicalCalibrationPayload } from '../fingerprinting/fingerprint';

export interface PropulsionDatasetRepository {
  insertDatasetRevision(
    revision: PropulsionPerformanceDatasetRevision,
  ): Promise<void>;
  getDatasetRevision(
    id: PropulsionDatasetRevisionId,
  ): Promise<PropulsionPerformanceDatasetRevision | null>;
  listCompatibleDatasetRevisions(query: {
    readonly motorRevisionId: string;
    readonly propellerRevisionId: string;
  }): Promise<readonly PropulsionPerformanceDatasetRevision[]>;
  listAllDatasetRevisions(): Promise<readonly PropulsionPerformanceDatasetRevision[]>;
}

export interface PropulsionCalibrationRepository {
  insertCalibrationRevision(
    revision: PropulsionCalibrationProfileRevision,
  ): Promise<void>;
  getCalibrationRevision(
    id: PropulsionCalibrationRevisionId,
  ): Promise<PropulsionCalibrationProfileRevision | null>;
}

async function insertImmutableDataset(
  store: {
    get(
      id: PropulsionDatasetRevisionId,
    ): Promise<PropulsionPerformanceDatasetRevision | null>;
    putNew(revision: PropulsionPerformanceDatasetRevision): Promise<void>;
  },
  revision: PropulsionPerformanceDatasetRevision,
): Promise<void> {
  const existing = await store.get(revision.revisionId);
  if (!existing) {
    await store.putNew(revision);
    return;
  }
  const same =
    hashCanonical(physicalDatasetPayload(existing)) ===
    hashCanonical(physicalDatasetPayload(revision));
  if (same) return;
  throw domainError(
    'DATASET_REVISION_IMMUTABLE_CONFLICT',
    `Cannot overwrite propulsion dataset revision ${revision.revisionId}`,
    { revisionId: revision.revisionId },
  );
}

async function insertImmutableCalibration(
  store: {
    get(
      id: PropulsionCalibrationRevisionId,
    ): Promise<PropulsionCalibrationProfileRevision | null>;
    putNew(revision: PropulsionCalibrationProfileRevision): Promise<void>;
  },
  revision: PropulsionCalibrationProfileRevision,
): Promise<void> {
  const existing = await store.get(revision.revisionId);
  if (!existing) {
    await store.putNew(revision);
    return;
  }
  const same =
    hashCanonical(physicalCalibrationPayload(existing)) ===
    hashCanonical(physicalCalibrationPayload(revision));
  if (same) return;
  throw domainError(
    'CALIBRATION_REVISION_IMMUTABLE_CONFLICT',
    `Cannot overwrite calibration revision ${revision.revisionId}`,
    { revisionId: revision.revisionId },
  );
}

export function createMemoryPropulsionDatasetRepository(
  initial: readonly PropulsionPerformanceDatasetRevision[] = [],
): PropulsionDatasetRepository {
  const map = new Map<string, PropulsionPerformanceDatasetRevision>();
  for (const r of initial) {
    map.set(r.revisionId, deepFreeze(structuredClone(r)));
  }
  return {
    async insertDatasetRevision(revision) {
      await insertImmutableDataset(
        {
          get: async (id) => map.get(id) ?? null,
          putNew: async (r) => {
            map.set(r.revisionId, deepFreeze(structuredClone(r)));
          },
        },
        revision,
      );
    },
    async getDatasetRevision(id) {
      return map.get(id) ?? null;
    },
    async listCompatibleDatasetRevisions(query) {
      return [...map.values()]
        .filter(
          (d) =>
            d.motorRevisionId === query.motorRevisionId &&
            d.propellerRevisionId === query.propellerRevisionId &&
            d.status === 'published',
        )
        .sort((a, b) =>
          a.revisionId < b.revisionId ? -1 : a.revisionId > b.revisionId ? 1 : 0,
        );
    },
    async listAllDatasetRevisions() {
      return [...map.values()].sort((a, b) =>
        a.revisionId < b.revisionId ? -1 : a.revisionId > b.revisionId ? 1 : 0,
      );
    },
  };
}

export function createMemoryPropulsionCalibrationRepository(
  initial: readonly PropulsionCalibrationProfileRevision[] = [],
): PropulsionCalibrationRepository {
  const map = new Map<string, PropulsionCalibrationProfileRevision>();
  for (const r of initial) {
    map.set(r.revisionId, deepFreeze(structuredClone(r)));
  }
  return {
    async insertCalibrationRevision(revision) {
      await insertImmutableCalibration(
        {
          get: async (id) => map.get(id) ?? null,
          putNew: async (r) => {
            map.set(r.revisionId, deepFreeze(structuredClone(r)));
          },
        },
        revision,
      );
    },
    async getCalibrationRevision(id) {
      return map.get(id) ?? null;
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const v of Object.values(value as object)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  }
  return value;
}
