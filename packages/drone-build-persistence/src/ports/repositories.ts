import type {
  CatalogReleaseId,
  DroneBuildId,
  DroneBuildRevisionId,
  ComponentRevisionId,
  BuildFingerprint,
  ArtifactFingerprint,
} from '@fpv/engineering-kernel';
import type { ComponentRevision, CatalogRelease } from '@fpv/component-catalog';
import type {
  DroneBuild,
  DroneBuildDraft,
  DroneBuildRevision,
} from '@fpv/drone-build-domain';
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
  saveRevision(revision: DroneBuildRevision): Promise<void>;
}

export interface CompiledArtifactRecord {
  readonly buildFingerprint: BuildFingerprint;
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
    engineeringModelVersion: string,
    compilerVersion: string,
  ): Promise<CompiledArtifactRecord | null>;
  save(record: CompiledArtifactRecord): Promise<void>;
}
