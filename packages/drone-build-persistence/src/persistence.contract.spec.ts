import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  createDraft,
  publishRevision,
  createQuadSelections,
} from '@fpv/drone-build-domain';
import { OFFICIAL_CATALOG_RELEASE } from '@fpv/component-catalog';
import {
  createMemoryBuildRepository,
  createIndexedDbBuildRepository,
  createIndexedDbUserBuildLibraryRepository,
  createLinkedMemoryPersistence,
  openDroneBuilderDb,
  resetDroneBuilderDbConnection,
  IDB_NAME,
  createDraftEnvelope,
  createCompiledRevisionEnvelope,
  parsePersistedDraft,
  PERSISTENCE_RECORD_SCHEMA_VERSION,
} from '@fpv/drone-build-persistence';
import {
  asDroneBuildRevisionId,
  asBuildFingerprint,
  asArtifactFingerprint,
  asCompilationContextFingerprint,
  asRuntimeCompatibilitySignature,
} from '@fpv/engineering-kernel';

function sampleDraft(buildId = 'persist-test', name = 'Persist') {
  const { selections, topology } = createQuadSelections({
    frameRevisionId: 'frame-racing-5in@1',
    motorRevisionId: 'motor-2207-2450kv@1',
    propellerRevisionId: 'prop-5x4x3@1',
    batteryRevisionId: 'batt-6s-1500@1',
    escRevisionId: 'esc-4in1-45a@1',
    armPositions: [
      { x: 0.08, y: 0.08, z: 0 },
      { x: -0.08, y: 0.08, z: 0 },
      { x: -0.08, y: -0.08, z: 0 },
      { x: 0.08, y: -0.08, z: 0 },
    ],
  });
  return createDraft({
    buildId,
    name,
    catalogReleaseId: OFFICIAL_CATALOG_RELEASE.releaseId,
    selections,
    topology,
  });
}

function sampleRevision(id: string, buildId = 'persist-test') {
  return publishRevision(sampleDraft(buildId), id);
}

async function resetIdb(): Promise<void> {
  await resetDroneBuilderDbConnection();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  await openDroneBuilderDb();
}

describe('build revision persistence contracts', () => {
  describe('memory repository', () => {
    it('inserts immutably and rejects conflicting content', async () => {
      const repo = createMemoryBuildRepository();
      const rev = sampleRevision('mem-rev@1');
      await repo.insertRevision(rev);
      expect(await repo.revisionExists(asDroneBuildRevisionId('mem-rev@1'))).toBe(
        true,
      );
      await repo.insertRevision(rev);
      const mutated = {
        ...rev,
        tuning: { ...rev.tuning, thrustCurveExponent: 2.5 },
      };
      await expect(repo.insertRevision(mutated)).rejects.toThrow(
        /overwrite|IMMUTABLE/i,
      );
    });

    it('deep-copies published revisions away from draft mutation', () => {
      const draft = sampleDraft('deep', 'Deep');
      const published = publishRevision(draft, 'deep@1');
      const mutablePos = draft.selections[0].transform.position as {
        x: number;
        y: number;
        z: number;
      };
      mutablePos.x = 99;
      (draft.tuning as { thrustCurveExponent: number }).thrustCurveExponent = 9;
      const draftConfig = draft.selections[0].configuration as Record<
        string,
        string | number | boolean
      >;
      draftConfig['hack'] = true;
      expect(published.selections[0].transform.position.x).not.toBe(99);
      expect(published.tuning.thrustCurveExponent).not.toBe(9);
      expect(published.selections[0].configuration['hack']).toBeUndefined();
      expect(Object.isFrozen(published)).toBe(true);
    });

    it('rejects concurrent-style conflicting inserts with stable error code', async () => {
      const repo = createMemoryBuildRepository();
      const rev = sampleRevision('mem-race@1');
      await repo.insertRevision(rev);
      const conflicting = {
        ...rev,
        notes: 'different canonical content',
      };
      try {
        await repo.insertRevision(conflicting);
        expect.unreachable('should have thrown');
      } catch (e) {
        const err = e as { code?: string; message?: string };
        expect(String(err.code ?? err.message)).toMatch(
          /REVISION_IMMUTABLE_CONFLICT|Cannot overwrite/,
        );
      }
    });

    it('saves, lists, updates, and deletes drafts without changing build ID', async () => {
      const linked = createLinkedMemoryPersistence();
      const draft = sampleDraft('draft-a', 'Alpha');
      const envelope = createDraftEnvelope({
        draft,
        intentId: 'racing',
        sourceType: 'user-draft',
      });
      await linked.library.saveDraftRecord(envelope);
      const loaded = await linked.library.getDraftRecord(draft.buildId);
      expect(loaded?.ok).toBe(true);
      if (!loaded?.ok) return;
      expect(loaded.record.buildId).toBe('draft-a');
      expect(loaded.record.displayName).toBe('Alpha');

      const renamed = createDraftEnvelope({
        draft: { ...draft, name: 'Alpha Renamed' },
        intentId: 'racing',
        sourceType: 'user-draft',
        createdAtIso: envelope.createdAtIso,
      });
      await linked.library.saveDraftRecord(renamed);
      const again = await linked.library.getDraftRecord(draft.buildId);
      expect(again?.ok && again.record.buildId).toBe('draft-a');
      expect(again?.ok && again.record.displayName).toBe('Alpha Renamed');

      const listed = await linked.library.listDraftRecords();
      expect(listed.valid).toHaveLength(1);

      await linked.library.deleteDraftRecord(draft.buildId);
      expect(await linked.library.getDraftRecord(draft.buildId)).toBeNull();
    });

    it('keeps compiled revisions after draft deletion', async () => {
      const linked = createLinkedMemoryPersistence();
      const draft = sampleDraft('keep-rev', 'Keep');
      await linked.library.saveDraftRecord(
        createDraftEnvelope({
          draft,
          intentId: 'racing',
          sourceType: 'user-draft',
        }),
      );
      const revision = publishRevision(draft, 'keep-rev@1');
      await linked.library.saveCompiledRevisionRecord(
        createCompiledRevisionEnvelope({
          revision,
          displayNameAtCompile: 'Keep',
          revisionLabel: 'Rev 1',
          intentId: 'racing',
          aircraftId: 'user-keep-rev-1',
          buildFingerprint: asBuildFingerprint('bf1'),
          artifactFingerprint: asArtifactFingerprint('af1'),
          compilationContextFingerprint:
            asCompilationContextFingerprint('cf1'),
          runtimeCompatibilitySignature:
            asRuntimeCompatibilitySignature('rt1'),
          engineeringModelVersion: '1.1.2',
          compilerVersion: '1.1.2',
        }),
      );
      await linked.library.deleteDraftRecord(draft.buildId);
      const listed = await linked.library.listCompiledRevisionRecords();
      expect(listed.valid).toHaveLength(1);
      expect(listed.valid[0].buildId).toBe('keep-rev');
    });
  });

  describe('IndexedDB repository', () => {
    beforeEach(async () => {
      await resetIdb();
    });

    it('opens database and uses create-only semantics for revisions', async () => {
      const repo = createIndexedDbBuildRepository();
      const rev = sampleRevision('idb-rev@1');
      await repo.insertRevision(rev);
      expect(
        await repo.getRevision(asDroneBuildRevisionId('idb-rev@1')),
      ).toBeTruthy();
      await repo.insertRevision(rev);
      const mutated = {
        ...rev,
        tuning: { ...rev.tuning, throttleExpo: 0.99 },
      };
      await expect(repo.insertRevision(mutated)).rejects.toThrow(
        /overwrite|IMMUTABLE/i,
      );
    });

    it('saves and loads draft envelopes; lists deterministically', async () => {
      const library = createIndexedDbUserBuildLibraryRepository();
      const a = createDraftEnvelope({
        draft: sampleDraft('idb-a', 'A'),
        intentId: 'racing',
        sourceType: 'user-draft',
        updatedAtIso: '2026-01-01T00:00:00.000Z',
      });
      const b = createDraftEnvelope({
        draft: sampleDraft('idb-b', 'B'),
        intentId: 'freestyle',
        sourceType: 'user-draft',
        updatedAtIso: '2026-01-02T00:00:00.000Z',
      });
      await library.saveDraftRecord(a);
      await library.saveDraftRecord(b);
      const listed = await library.listDraftRecords();
      expect(listed.valid.map((d) => d.buildId)).toEqual(['idb-a', 'idb-b']);
      expect(listed.invalid).toHaveLength(0);
    });

    it('updates a draft without changing build ID', async () => {
      const library = createIndexedDbUserBuildLibraryRepository();
      const envelope = createDraftEnvelope({
        draft: sampleDraft('stable-id', 'Original'),
        intentId: 'racing',
        sourceType: 'user-draft',
      });
      await library.saveDraftRecord(envelope);
      await library.saveDraftRecord({
        ...envelope,
        displayName: 'Renamed',
        draft: { ...envelope.draft, name: 'Renamed' },
        updatedAtIso: '2026-07-01T12:00:00.000Z',
      });
      const loaded = await library.getDraftRecord(
        envelope.buildId as never,
      );
      expect(loaded?.ok && loaded.record.buildId).toBe('stable-id');
      expect(loaded?.ok && loaded.record.displayName).toBe('Renamed');
    });

    it('deletes drafts and keeps compiled revisions', async () => {
      const library = createIndexedDbUserBuildLibraryRepository();
      const draft = sampleDraft('idb-orphan', 'Orphan Source');
      await library.saveDraftRecord(
        createDraftEnvelope({
          draft,
          intentId: 'racing',
          sourceType: 'user-draft',
        }),
      );
      const revision = publishRevision(draft, 'idb-orphan@1');
      await library.saveCompiledRevisionRecord(
        createCompiledRevisionEnvelope({
          revision,
          displayNameAtCompile: 'Orphan Source',
          revisionLabel: 'Rev 1',
          intentId: 'racing',
          aircraftId: 'user-idb-orphan-1',
          buildFingerprint: asBuildFingerprint('bf'),
          artifactFingerprint: asArtifactFingerprint('af'),
          compilationContextFingerprint:
            asCompilationContextFingerprint('cf'),
          runtimeCompatibilitySignature:
            asRuntimeCompatibilitySignature('rt'),
          engineeringModelVersion: '1.1.2',
          compilerVersion: '1.1.2',
        }),
      );
      await library.deleteDraftRecord(draft.buildId);
      expect(await library.getDraftRecord(draft.buildId)).toBeNull();
      const compiled = await library.listCompiledRevisionRecords();
      expect(compiled.valid).toHaveLength(1);
    });

    it('handles malformed records without deleting valid ones', async () => {
      const library = createIndexedDbUserBuildLibraryRepository();
      await library.saveDraftRecord(
        createDraftEnvelope({
          draft: sampleDraft('good', 'Good'),
          intentId: 'racing',
          sourceType: 'user-draft',
        }),
      );
      // Inject corrupt row directly
      const db = await openDroneBuilderDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put({
          buildId: 'corrupt',
          recordKind: 'draft',
          recordSchemaVersion: PERSISTENCE_RECORD_SCHEMA_VERSION,
          // missing draft
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      const listed = await library.listDraftRecords();
      expect(listed.valid.map((d) => d.buildId)).toEqual(['good']);
      expect(listed.invalid.length).toBeGreaterThanOrEqual(1);
      expect(listed.invalid[0].ok).toBe(false);
    });

    it('marks unsupported future schema without claiming migration', async () => {
      const raw = {
        buildId: 'future',
        recordKind: 'draft',
        recordSchemaVersion: 99,
        draft: sampleDraft('future', 'Future'),
      };
      const parsed = parsePersistedDraft(raw);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.attentionStatus).toBe('unsupported-schema');
      expect(parsed.preserved).toBe(raw);
    });

    it('migrates legacy bare drafts deterministically', () => {
      const legacy = sampleDraft('legacy', 'Legacy');
      const parsed = parsePersistedDraft(legacy);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.record.recordSchemaVersion).toBe(
        PERSISTENCE_RECORD_SCHEMA_VERSION,
      );
      expect(parsed.record.draft.buildId).toBe('legacy');
    });
  });
});
