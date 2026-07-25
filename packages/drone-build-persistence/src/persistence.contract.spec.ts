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
  openDroneBuilderDb,
} from '@fpv/drone-build-persistence';
import { asDroneBuildRevisionId } from '@fpv/engineering-kernel';

function sampleRevision(id: string) {
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
  const draft = createDraft({
    buildId: 'persist-test',
    name: 'Persist',
    catalogReleaseId: OFFICIAL_CATALOG_RELEASE.releaseId,
    selections,
    topology,
  });
  return publishRevision(draft, id);
}

describe('build revision persistence contracts', () => {
  describe('memory repository', () => {
    it('inserts immutably and rejects conflicting content', async () => {
      const repo = createMemoryBuildRepository();
      const rev = sampleRevision('mem-rev@1');
      await repo.insertRevision(rev);
      expect(await repo.revisionExists(asDroneBuildRevisionId('mem-rev@1'))).toBe(true);
      await repo.insertRevision(rev);
      const mutated = {
        ...rev,
        tuning: { ...rev.tuning, thrustCurveExponent: 2.5 },
      };
      await expect(repo.insertRevision(mutated)).rejects.toThrow(/overwrite|IMMUTABLE/i);
    });

    it('deep-copies published revisions away from draft mutation', () => {
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
      const draft = createDraft({
        buildId: 'deep',
        name: 'Deep',
        catalogReleaseId: OFFICIAL_CATALOG_RELEASE.releaseId,
        selections,
        topology,
      });
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
  });

  describe('IndexedDB repository', () => {
    beforeEach(async () => {
      // Reset DB between tests
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('fpv-drone-builder-v1');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
      await openDroneBuilderDb();
    });

    it('uses create-only semantics for revisions', async () => {
      const repo = createIndexedDbBuildRepository();
      const rev = sampleRevision('idb-rev@1');
      await repo.insertRevision(rev);
      expect(await repo.getRevision(asDroneBuildRevisionId('idb-rev@1'))).toBeTruthy();
      await repo.insertRevision(rev);
      const mutated = {
        ...rev,
        tuning: { ...rev.tuning, throttleExpo: 0.99 },
      };
      await expect(repo.insertRevision(mutated)).rejects.toThrow(/overwrite|IMMUTABLE/i);
    });
  });
});
