import type {
  CatalogReleaseId,
  ComponentRevisionId,
  DroneBuildId,
  DroneBuildRevisionId,
  BuildFingerprint,
  ArtifactFingerprint,
  CompilationContextFingerprint,
  RuntimeCompatibilitySignature,
} from '@fpv/engineering-kernel';
import { domainError, hashCanonical } from '@fpv/engineering-kernel';
import type { ComponentRevision, CatalogRelease } from '@fpv/component-catalog';
import type {
  DroneBuild,
  DroneBuildDraft,
  DroneBuildRevision,
} from '@fpv/drone-build-domain';
import { revisionCanonicalContent } from '@fpv/drone-build-domain';
import type { CompiledAircraftSpecification } from '@fpv/aircraft-compiler';
import type {
  PersistedCompiledRevisionRecord,
  PersistedDraftRecord,
  ValidatedRecordResult,
} from '../records/persisted-records';

export type {
  PropulsionDatasetRepository,
  PropulsionCalibrationRepository,
} from '@fpv/propulsion-data';

export {
  createMemoryPropulsionDatasetRepository,
  createMemoryPropulsionCalibrationRepository,
} from '@fpv/propulsion-data';

export interface ComponentCatalogRepository {
  getRelease(id: CatalogReleaseId): Promise<CatalogRelease | null>;
  getRevision(id: ComponentRevisionId): Promise<ComponentRevision | null>;
  listRevisionsForRelease(
    releaseId: CatalogReleaseId,
  ): Promise<readonly ComponentRevision[]>;
}

export interface DroneBuildRepository {
  getBuild(id: DroneBuildId): Promise<DroneBuild | null>;
  saveBuild(build: DroneBuild): Promise<void>;
  getDraft(buildId: DroneBuildId): Promise<DroneBuildDraft | null>;
  saveDraft(draft: DroneBuildDraft): Promise<void>;
  getRevision(id: DroneBuildRevisionId): Promise<DroneBuildRevision | null>;
  revisionExists(id: DroneBuildRevisionId): Promise<boolean>;
  /**
   * Create-only insert for immutable published revisions.
   * Identical canonical content is idempotent; conflicting content throws.
   */
  insertRevision(revision: DroneBuildRevision): Promise<void>;
  /**
   * @deprecated Use insertRevision. Delegates with immutable conflict semantics.
   */
  saveRevision(revision: DroneBuildRevision): Promise<void>;
  listBuildIds(): Promise<readonly DroneBuildId[]>;
  listDraftIds(): Promise<readonly DroneBuildId[]>;
  listRevisionIds(): Promise<readonly DroneBuildRevisionId[]>;
  listRevisionsForBuild(
    buildId: DroneBuildId,
  ): Promise<readonly DroneBuildRevision[]>;
  /** Deletes the editable draft only — never cascades to compiled revisions. */
  deleteDraft(buildId: DroneBuildId): Promise<void>;
  deleteBuild(buildId: DroneBuildId): Promise<void>;
  /** Deletes one immutable compiled revision only. */
  deleteRevision(revisionId: DroneBuildRevisionId): Promise<void>;
}

/**
 * Envelope-aware library port for Hangar / Builder lifecycle metadata.
 * Stores use the same IndexedDB object stores as {@link DroneBuildRepository}.
 */
export interface UserBuildLibraryRepository {
  saveDraftRecord(record: PersistedDraftRecord): Promise<void>;
  getDraftRecord(
    buildId: DroneBuildId,
  ): Promise<ValidatedRecordResult<PersistedDraftRecord> | null>;
  listDraftRecords(): Promise<{
    readonly valid: readonly PersistedDraftRecord[];
    readonly invalid: readonly ValidatedRecordResult<PersistedDraftRecord>[];
  }>;
  deleteDraftRecord(buildId: DroneBuildId): Promise<void>;

  saveCompiledRevisionRecord(
    record: PersistedCompiledRevisionRecord,
  ): Promise<void>;
  getCompiledRevisionRecord(
    revisionId: DroneBuildRevisionId,
  ): Promise<ValidatedRecordResult<PersistedCompiledRevisionRecord> | null>;
  listCompiledRevisionRecords(): Promise<{
    readonly valid: readonly PersistedCompiledRevisionRecord[];
    readonly invalid: readonly ValidatedRecordResult<PersistedCompiledRevisionRecord>[];
  }>;
  listCompiledRevisionRecordsForBuild(buildId: DroneBuildId): Promise<{
    readonly valid: readonly PersistedCompiledRevisionRecord[];
    readonly invalid: readonly ValidatedRecordResult<PersistedCompiledRevisionRecord>[];
  }>;
  deleteCompiledRevisionRecord(revisionId: DroneBuildRevisionId): Promise<void>;

  saveBuild(build: DroneBuild): Promise<void>;
  getBuild(id: DroneBuildId): Promise<DroneBuild | null>;
  deleteBuild(buildId: DroneBuildId): Promise<void>;
}

export interface CompiledArtifactRecord {
  readonly buildFingerprint: BuildFingerprint;
  readonly compilationContextFingerprint: CompilationContextFingerprint;
  readonly runtimeCompatibilitySignature: RuntimeCompatibilitySignature;
  readonly artifactFingerprint: ArtifactFingerprint;
  readonly engineeringModelVersion: string;
  readonly compilerVersion: string;
  readonly specification: CompiledAircraftSpecification;
  readonly createdAtIso: string | null;
  readonly trustStatus: 'local' | 'trusted' | 'untrusted';
}

export interface CompiledArtifactRepository {
  get(
    buildFingerprint: BuildFingerprint,
    compilationContextFingerprint: CompilationContextFingerprint,
    runtimeCompatibilitySignature: RuntimeCompatibilitySignature,
    engineeringModelVersion: string,
    compilerVersion: string,
  ): Promise<CompiledArtifactRecord | null>;
  save(record: CompiledArtifactRecord): Promise<void>;
  list(): Promise<readonly CompiledArtifactRecord[]>;
}

export async function insertImmutableRevision(
  store: {
    getRevision(id: DroneBuildRevisionId): Promise<DroneBuildRevision | null>;
    putNew(revision: DroneBuildRevision): Promise<void>;
  },
  revision: DroneBuildRevision,
): Promise<void> {
  const existing = await store.getRevision(revision.revisionId);
  if (!existing) {
    await store.putNew(revision);
    return;
  }
  const same =
    hashCanonical(revisionCanonicalContent(existing)) ===
    hashCanonical(revisionCanonicalContent(revision));
  if (same) {
    return; // idempotent identical write
  }
  throw domainError(
    'REVISION_IMMUTABLE_CONFLICT',
    `Cannot overwrite published revision ${revision.revisionId}`,
    { revisionId: revision.revisionId },
  );
}
