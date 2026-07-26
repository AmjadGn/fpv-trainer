import type {
  CatalogReleaseId,
  ComponentRevisionId,
  DroneBuildId,
  DroneBuildRevisionId,
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
  UserBuildLibraryRepository,
} from '../ports/repositories';
import { insertImmutableRevision } from '../ports/repositories';
import {
  createDraftEnvelope,
  parsePersistedCompiledRevision,
  parsePersistedDraft,
  type PersistedCompiledRevisionRecord,
  type PersistedDraftRecord,
  type ValidatedRecordResult,
} from '../records/persisted-records';

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
  const drafts = new Map<string, unknown>();
  const revisions = new Map<string, unknown>();

  const unwrapDraft = (raw: unknown): DroneBuildDraft | null => {
    const parsed = parsePersistedDraft(raw);
    if (parsed.ok) return parsed.record.draft;
    return null;
  };

  const unwrapRevision = (raw: unknown): DroneBuildRevision | null => {
    const parsed = parsePersistedCompiledRevision(raw);
    if (parsed.ok) return parsed.record.revision;
    return null;
  };

  return {
    async getBuild(id: DroneBuildId) {
      return builds.get(id) ?? null;
    },
    async saveBuild(build: DroneBuild) {
      builds.set(build.buildId, build);
    },
    async getDraft(buildId: DroneBuildId) {
      const raw = drafts.get(buildId);
      return raw ? unwrapDraft(raw) : null;
    },
    async saveDraft(draft: DroneBuildDraft) {
      const existing = drafts.get(draft.buildId);
      const parsed = existing ? parsePersistedDraft(existing) : null;
      drafts.set(
        draft.buildId,
        createDraftEnvelope({
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
        }),
      );
    },
    async getRevision(id: DroneBuildRevisionId) {
      const raw = revisions.get(id);
      return raw ? unwrapRevision(raw) : null;
    },
    async revisionExists(id: DroneBuildRevisionId) {
      return revisions.has(id);
    },
    async insertRevision(revision: DroneBuildRevision) {
      await insertImmutableRevision(
        {
          getRevision: async (id) => {
            const raw = revisions.get(id);
            return raw ? unwrapRevision(raw) : null;
          },
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
    async listBuildIds() {
      return [...builds.keys()] as DroneBuildId[];
    },
    async listDraftIds() {
      return [...drafts.keys()] as DroneBuildId[];
    },
    async listRevisionIds() {
      return [...revisions.keys()] as DroneBuildRevisionId[];
    },
    async listRevisionsForBuild(buildId: DroneBuildId) {
      const out: DroneBuildRevision[] = [];
      for (const raw of revisions.values()) {
        const rev = unwrapRevision(raw);
        if (rev && rev.buildId === buildId) out.push(rev);
      }
      return out;
    },
    async deleteDraft(buildId: DroneBuildId) {
      drafts.delete(buildId);
    },
    async deleteBuild(buildId: DroneBuildId) {
      builds.delete(buildId);
    },
    async deleteRevision(revisionId: DroneBuildRevisionId) {
      revisions.delete(revisionId);
    },
  };
}

export function createMemoryUserBuildLibraryRepository(): UserBuildLibraryRepository {
  const builds = new Map<string, DroneBuild>();
  const drafts = new Map<string, unknown>();
  const revisions = new Map<string, unknown>();

  return {
    async saveDraftRecord(record: PersistedDraftRecord) {
      drafts.set(record.buildId, record);
    },
    async getDraftRecord(buildId) {
      const raw = drafts.get(buildId);
      if (raw == null) return null;
      return parsePersistedDraft(raw);
    },
    async listDraftRecords() {
      const valid: PersistedDraftRecord[] = [];
      const invalid: ValidatedRecordResult<PersistedDraftRecord>[] = [];
      for (const raw of drafts.values()) {
        const parsed = parsePersistedDraft(raw);
        if (parsed.ok) valid.push(parsed.record);
        else invalid.push(parsed);
      }
      valid.sort((a, b) => a.updatedAtIso.localeCompare(b.updatedAtIso));
      return { valid, invalid };
    },
    async deleteDraftRecord(buildId) {
      drafts.delete(buildId);
    },
    async saveCompiledRevisionRecord(record: PersistedCompiledRevisionRecord) {
      const existing = revisions.get(record.revisionId);
      if (!existing) {
        revisions.set(record.revisionId, record);
        return;
      }
      const parsed = parsePersistedCompiledRevision(existing);
      if (
        parsed.ok &&
        parsed.record.artifactFingerprint === record.artifactFingerprint
      ) {
        return;
      }
      await insertImmutableRevision(
        {
          getRevision: async () =>
            parsed.ok ? parsed.record.revision : null,
          putNew: async () => {
            revisions.set(record.revisionId, record);
          },
        },
        record.revision,
      );
    },
    async getCompiledRevisionRecord(revisionId) {
      const raw = revisions.get(revisionId);
      if (raw == null) return null;
      return parsePersistedCompiledRevision(raw);
    },
    async listCompiledRevisionRecords() {
      const valid: PersistedCompiledRevisionRecord[] = [];
      const invalid: ValidatedRecordResult<PersistedCompiledRevisionRecord>[] =
        [];
      for (const raw of revisions.values()) {
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
      revisions.delete(revisionId);
    },
    async saveBuild(build) {
      builds.set(build.buildId, build);
    },
    async getBuild(id) {
      return builds.get(id) ?? null;
    },
    async deleteBuild(buildId) {
      builds.delete(buildId);
    },
  };
}

export function createMemoryArtifactRepository(): CompiledArtifactRepository {
  const store = new Map<string, CompiledArtifactRecord>();
  const key = (bf: string, ctx: string, runtime: string, eng: string, comp: string) =>
    `${bf}|${ctx}|${runtime}|${eng}|${comp}`;
  return {
    async get(bf, ctx, runtime, eng, comp) {
      return store.get(key(bf, ctx, runtime, eng, comp)) ?? null;
    },
    async save(record) {
      store.set(
        key(
          record.buildFingerprint,
          record.compilationContextFingerprint,
          record.runtimeCompatibilitySignature,
          record.engineeringModelVersion,
          record.compilerVersion,
        ),
        record,
      );
    },
    async list() {
      return [...store.values()];
    },
  };
}

/** Shared memory backend for build + library ports (tests / session fallback). */
export function createLinkedMemoryPersistence(): {
  builds: DroneBuildRepository;
  library: UserBuildLibraryRepository;
  artifacts: CompiledArtifactRepository;
} {
  const buildsMap = new Map<string, DroneBuild>();
  const draftsMap = new Map<string, unknown>();
  const revisionsMap = new Map<string, unknown>();

  const unwrapDraft = (raw: unknown): DroneBuildDraft | null => {
    const parsed = parsePersistedDraft(raw);
    return parsed.ok ? parsed.record.draft : null;
  };
  const unwrapRevision = (raw: unknown): DroneBuildRevision | null => {
    const parsed = parsePersistedCompiledRevision(raw);
    return parsed.ok ? parsed.record.revision : null;
  };

  const builds: DroneBuildRepository = {
    async getBuild(id) {
      return buildsMap.get(id) ?? null;
    },
    async saveBuild(build) {
      buildsMap.set(build.buildId, build);
    },
    async getDraft(buildId) {
      const raw = draftsMap.get(buildId);
      return raw ? unwrapDraft(raw) : null;
    },
    async saveDraft(draft) {
      const existing = draftsMap.get(draft.buildId);
      const parsed = existing ? parsePersistedDraft(existing) : null;
      draftsMap.set(
        draft.buildId,
        createDraftEnvelope({
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
        }),
      );
    },
    async getRevision(id) {
      const raw = revisionsMap.get(id);
      return raw ? unwrapRevision(raw) : null;
    },
    async revisionExists(id) {
      return revisionsMap.has(id);
    },
    async insertRevision(revision) {
      await insertImmutableRevision(
        {
          getRevision: async (rid) => {
            const raw = revisionsMap.get(rid);
            return raw ? unwrapRevision(raw) : null;
          },
          putNew: async (r) => {
            revisionsMap.set(r.revisionId, r);
          },
        },
        revision,
      );
    },
    async saveRevision(revision) {
      await this.insertRevision(revision);
    },
    async listBuildIds() {
      return [...buildsMap.keys()] as DroneBuildId[];
    },
    async listDraftIds() {
      return [...draftsMap.keys()] as DroneBuildId[];
    },
    async listRevisionIds() {
      return [...revisionsMap.keys()] as DroneBuildRevisionId[];
    },
    async listRevisionsForBuild(buildId) {
      const out: DroneBuildRevision[] = [];
      for (const raw of revisionsMap.values()) {
        const rev = unwrapRevision(raw);
        if (rev?.buildId === buildId) out.push(rev);
      }
      return out;
    },
    async deleteDraft(buildId) {
      draftsMap.delete(buildId);
    },
    async deleteBuild(buildId) {
      buildsMap.delete(buildId);
    },
    async deleteRevision(revisionId) {
      revisionsMap.delete(revisionId);
    },
  };

  const library: UserBuildLibraryRepository = {
    async saveDraftRecord(record) {
      draftsMap.set(record.buildId, record);
    },
    async getDraftRecord(buildId) {
      const raw = draftsMap.get(buildId);
      if (raw == null) return null;
      return parsePersistedDraft(raw);
    },
    async listDraftRecords() {
      const valid: PersistedDraftRecord[] = [];
      const invalid: ValidatedRecordResult<PersistedDraftRecord>[] = [];
      for (const raw of draftsMap.values()) {
        const parsed = parsePersistedDraft(raw);
        if (parsed.ok) valid.push(parsed.record);
        else invalid.push(parsed);
      }
      valid.sort((a, b) => a.updatedAtIso.localeCompare(b.updatedAtIso));
      return { valid, invalid };
    },
    async deleteDraftRecord(buildId) {
      draftsMap.delete(buildId);
    },
    async saveCompiledRevisionRecord(record) {
      const existing = revisionsMap.get(record.revisionId);
      if (!existing) {
        revisionsMap.set(record.revisionId, record);
        return;
      }
      const parsed = parsePersistedCompiledRevision(existing);
      if (
        parsed.ok &&
        parsed.record.artifactFingerprint === record.artifactFingerprint
      ) {
        return;
      }
      await insertImmutableRevision(
        {
          getRevision: async () => (parsed.ok ? parsed.record.revision : null),
          putNew: async () => {
            revisionsMap.set(record.revisionId, record);
          },
        },
        record.revision,
      );
    },
    async getCompiledRevisionRecord(revisionId) {
      const raw = revisionsMap.get(revisionId);
      if (raw == null) return null;
      return parsePersistedCompiledRevision(raw);
    },
    async listCompiledRevisionRecords() {
      const valid: PersistedCompiledRevisionRecord[] = [];
      const invalid: ValidatedRecordResult<PersistedCompiledRevisionRecord>[] =
        [];
      for (const raw of revisionsMap.values()) {
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
      revisionsMap.delete(revisionId);
    },
    async saveBuild(build) {
      buildsMap.set(build.buildId, build);
    },
    async getBuild(id) {
      return buildsMap.get(id) ?? null;
    },
    async deleteBuild(buildId) {
      buildsMap.delete(buildId);
    },
  };

  return {
    builds,
    library,
    artifacts: createMemoryArtifactRepository(),
  };
}
