import type {
  CatalogReleaseId,
  ComponentRevisionId,
  DroneBuildId,
  DroneBuildRevisionId,
  BuildFingerprint,
  CompilationContextFingerprint,
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
import { insertImmutableRevision } from '../ports/repositories';

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
    async revisionExists(id: DroneBuildRevisionId) {
      return revisions.has(id);
    },
    async insertRevision(revision: DroneBuildRevision) {
      await insertImmutableRevision(
        {
          getRevision: async (id) => revisions.get(id) ?? null,
          putNew: async (r) => {
            revisions.set(r.revisionId, r);
          },
        },
        revision,
      );
    },
    async saveRevision(revision: DroneBuildRevision) {
      await this.insertRevision(revision);
    },
  };
}

export function createMemoryArtifactRepository(): CompiledArtifactRepository {
  const store = new Map<string, CompiledArtifactRecord>();
  const key = (bf: string, ctx: string, eng: string, comp: string) =>
    `${bf}|${ctx}|${eng}|${comp}`;
  return {
    async get(
      bf: BuildFingerprint,
      ctx: CompilationContextFingerprint,
      eng: string,
      comp: string,
    ) {
      return store.get(key(bf, ctx, eng, comp)) ?? null;
    },
    async save(record: CompiledArtifactRecord) {
      store.set(
        key(
          record.buildFingerprint,
          record.compilationContextFingerprint,
          record.engineeringModelVersion,
          record.compilerVersion,
        ),
        record,
      );
    },
  };
}
