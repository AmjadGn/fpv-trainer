import type {
  CatalogReleaseId,
  ComponentRevisionId,
  DroneBuildId,
  DroneBuildRevisionId,
  BuildFingerprint,
} from '@fpv/engineering-kernel';
import type { CatalogRelease, ComponentRevision } from '@fpv/component-catalog';
import type {
  DroneBuild,
  DroneBuildDraft,
  DroneBuildRevision,
} from '@fpv/drone-build-domain';
import type {
  ComponentCatalogRepository,
  CompiledArtifactRecord,
  CompiledArtifactRepository,
  DroneBuildRepository,
} from '../ports/repositories';

export function createMemoryCatalogRepository(
  releases: CatalogRelease[],
  revisions: ComponentRevision[],
): ComponentCatalogRepository {
  const releaseMap = new Map(releases.map((r) => [r.releaseId, r]));
  const revisionMap = new Map(revisions.map((r) => [r.revisionId, r]));
  return {
    async getRelease(id: CatalogReleaseId) {
      return releaseMap.get(id) ?? null;
    },
    async getRevision(id: ComponentRevisionId) {
      return revisionMap.get(id) ?? null;
    },
    async listRevisionsForRelease(releaseId: CatalogReleaseId) {
      const release = releaseMap.get(releaseId);
      if (!release) return [];
      return release.componentRevisionIds
        .map((id) => revisionMap.get(id))
        .filter((r): r is ComponentRevision => !!r);
    },
  };
}

export function createMemoryBuildRepository(): DroneBuildRepository {
  const builds = new Map<string, DroneBuild>();
  const drafts = new Map<string, DroneBuildDraft>();
  const revisions = new Map<string, DroneBuildRevision>();
  return {
    async getBuild(id: DroneBuildId) {
      return builds.get(id) ?? null;
    },
    async saveBuild(build: DroneBuild) {
      builds.set(build.buildId, build);
    },
    async getDraft(buildId: DroneBuildId) {
      return drafts.get(buildId) ?? null;
    },
    async saveDraft(draft: DroneBuildDraft) {
      drafts.set(draft.buildId, draft);
    },
    async getRevision(id: DroneBuildRevisionId) {
      return revisions.get(id) ?? null;
    },
    async saveRevision(revision: DroneBuildRevision) {
      revisions.set(revision.revisionId, revision);
    },
  };
}

export function createMemoryArtifactRepository(): CompiledArtifactRepository {
  const store = new Map<string, CompiledArtifactRecord>();
  const key = (bf: string, eng: string, comp: string) =>
    `${bf}|${eng}|${comp}`;
  return {
    async get(bf: BuildFingerprint, eng: string, comp: string) {
      return store.get(key(bf, eng, comp)) ?? null;
    },
    async save(record: CompiledArtifactRecord) {
      store.set(
        key(
          record.buildFingerprint,
          record.engineeringModelVersion,
          record.compilerVersion,
        ),
        record,
      );
    },
  };
}
