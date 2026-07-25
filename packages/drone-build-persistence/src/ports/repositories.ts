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
