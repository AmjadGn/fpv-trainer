import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AircraftCatalogService } from '../../../core/aircraft/services/aircraft-catalog.service';
import {
  AIRCRAFT_PREFS_STORAGE_KEY,
  AircraftPersistenceService,
} from '../../../core/aircraft/services/aircraft-persistence.service';
import { SelectedAircraftService } from '../../../core/aircraft/services/selected-aircraft.service';
import { AppShellService } from '../../../core/shell/app-shell.service';
import { DroneBuildPersistenceService } from '../../../core/drone-build/drone-build-persistence.service';
import { createLinkedMemoryPersistence } from '@fpv/drone-build-persistence';
import { BuilderPresentationMapperService } from './builder-presentation-mapper.service';
import { ComponentPresentationMediaService } from './component-presentation-media.service';
import { DroneBuilderFacadeService } from './drone-builder-facade.service';
import { DroneBuilderSessionService } from './drone-builder-session.service';

/**
 * Checkpoint 4 — persistence lifecycle coverage for the Drone Builder facade.
 * saveDraft / openDraft / duplicateDraft / deleteDraft / compile were
 * previously exercised only incidentally through UI-flow specs; this file
 * exercises the persistence round-trip and backend-fallback behavior
 * directly against the underlying DroneBuildPersistenceService.
 */
describe('DroneBuilderFacadeService persistence lifecycle (CP4)', () => {
  let facade: DroneBuilderFacadeService;
  let session: DroneBuilderSessionService;
  let catalog: AircraftCatalogService;
  let persistence: DroneBuildPersistenceService;

  beforeEach(() => {
    try {
      localStorage.removeItem(AIRCRAFT_PREFS_STORAGE_KEY);
    } catch {
      /* jsdom */
    }

    TestBed.configureTestingModule({
      providers: [
        DroneBuilderFacadeService,
        DroneBuilderSessionService,
        BuilderPresentationMapperService,
        ComponentPresentationMediaService,
        AircraftCatalogService,
        AircraftPersistenceService,
        SelectedAircraftService,
        AppShellService,
        DroneBuildPersistenceService,
      ],
    });

    facade = TestBed.inject(DroneBuilderFacadeService);
    session = TestBed.inject(DroneBuilderSessionService);
    catalog = TestBed.inject(AircraftCatalogService);
    persistence = TestBed.inject(DroneBuildPersistenceService);

    // Most lifecycle behavior (save/open/duplicate/delete/compile) should be
    // identical regardless of backend, so default to a healthy "indexeddb"
    // backend via fresh linked memory repos. The dedicated "backend
    // fallback" describe block below opts into
    // `facade.replaceBuildRepositoryForTests()` (memory-fallback) instead.
    const linked = createLinkedMemoryPersistence();
    persistence.replaceRepositoriesForTests({
      builds: linked.builds,
      library: linked.library,
      artifacts: linked.artifacts,
      backend: 'indexeddb',
    });
  });

  describe('saveDraft / openDraft round-trip', () => {
    it('persists a draft and restores identical selections, name, and intent after reopening', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      facade.setBuildName('My Racer');
      const buildId = session.buildId()!;
      const selectionsBefore = { ...session.selectedRevisionIdsBySlot() };

      const saved = await facade.saveDraft();
      expect(saved).toBe(true);
      expect(session.saveState()).toBe('saved');

      facade.resetBuild();
      expect(session.buildId()).toBeNull();

      const opened = await facade.openDraft(buildId);
      expect(opened).toBe(true);
      expect(session.buildId()).toBe(buildId);
      expect(session.buildName()).toBe('My Racer');
      expect(session.intentId()).toBe('racing');
      expect(session.selectedRevisionIdsBySlot()).toEqual(selectionsBefore);
      expect(session.canCompile()).toBe(true);
    });

    it('preserves createdAtIso across repeated saves of the same draft', async () => {
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      const buildId = session.buildId()!;

      await facade.saveDraft();
      const first = await persistence.getDraftRecord(buildId);
      expect(first?.ok).toBe(true);
      const createdAtIso = first?.ok ? first.record.createdAtIso : null;

      facade.setBuildName('Renamed Freestyle Rig');
      await facade.saveDraft();
      const second = await persistence.getDraftRecord(buildId);
      expect(second?.ok).toBe(true);
      if (second?.ok) {
        expect(second.record.createdAtIso).toBe(createdAtIso);
        expect(second.record.displayName).toBe('Renamed Freestyle Rig');
      }
    });

    it('returns false with an error message when opening a build id that was never saved', async () => {
      await facade.bootstrap();
      const opened = await facade.openDraft('does-not-exist');
      expect(opened).toBe(false);
      expect(facade.errorMessage()).toBeTruthy();
    });

    it('does not overwrite the in-memory draft when opening a damaged persisted record fails', async () => {
      await facade.bootstrap();
      facade.startFromIntent('cinematic');
      const buildId = session.buildId()!;
      await facade.saveDraft();

      const library = persistence.getLibraryRepository();
      // Corrupt the persisted envelope directly (bypasses facade validation).
      await library.saveDraftRecord({ mutable: true, buildId } as never);

      const opened = await facade.openDraft(buildId);
      expect(opened).toBe(false);
      expect(facade.errorMessage()).toBeTruthy();
    });
  });

  describe('duplicateDraft', () => {
    it('duplicates a persisted draft into a new build id without mutating the original', async () => {
      await facade.bootstrap();
      facade.startFromIntent('long-range');
      const originalBuildId = session.buildId()!;
      const originalName = session.buildName();
      await facade.saveDraft();

      const newBuildId = await facade.duplicateDraft(originalBuildId);
      expect(newBuildId).toBeTruthy();
      expect(newBuildId).not.toBe(originalBuildId);
      expect(session.buildId()).toBe(newBuildId);
      expect(session.buildName()).toBe(`Copy of ${originalName}`);

      const originalRecord = await persistence.getDraftRecord(originalBuildId);
      expect(originalRecord?.ok).toBe(true);
      if (originalRecord?.ok) {
        expect(originalRecord.record.displayName).toBe(originalName);
      }
    });

    it('duplicates the current in-memory draft when no source build id is given', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const currentBuildId = session.buildId()!;

      const newBuildId = await facade.duplicateDraft();
      expect(newBuildId).toBeTruthy();
      expect(newBuildId).not.toBe(currentBuildId);
      const persisted = await persistence.getDraftRecord(newBuildId!);
      expect(persisted?.ok).toBe(true);
    });

    it('returns null with an error message when there is nothing to duplicate', async () => {
      await facade.bootstrap();
      const result = await facade.duplicateDraft();
      expect(result).toBeNull();
      expect(facade.errorMessage()).toBeTruthy();
    });
  });

  describe('deleteDraft', () => {
    it('deletes the persisted draft record and resets the session when it is the open draft', async () => {
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      const buildId = session.buildId()!;
      await facade.saveDraft();

      const ok = await facade.deleteDraft(buildId);
      expect(ok).toBe(true);
      expect(session.buildId()).toBeNull();
      expect(session.selectedRevisionIdsBySlot()).toEqual({});

      const gone = await persistence.getDraftRecord(buildId);
      expect(gone).toBeNull();
    });

    it('leaves compiled revisions flyable after their source draft is deleted', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const buildId = session.buildId()!;
      await facade.saveDraft();
      await facade.compile();
      const aircraftId = session.lastCompile()?.aircraftId;
      expect(aircraftId).toBeTruthy();

      await facade.deleteDraft(buildId);

      const compiled = await persistence.listCompiledRevisionRecordsForBuild(
        buildId,
      );
      expect(compiled.valid.length).toBe(1);
      // The compiled aircraft definition stays registered — deleting a draft
      // must never retract an already-flyable compiled build.
      expect(catalog.getById(aircraftId!)).toBeTruthy();
    });

    it('deleting an unrelated draft does not disturb the currently open draft', async () => {
      await facade.bootstrap();
      facade.startFromIntent('long-range');
      const openBuildId = session.buildId()!;
      await facade.saveDraft();

      const otherBuildId = await facade.duplicateDraft(openBuildId);
      // duplicateDraft() switches the open session to the new copy — reopen
      // the original so it is the "current" draft under test.
      await facade.openDraft(openBuildId);

      const ok = await facade.deleteDraft(otherBuildId!);
      expect(ok).toBe(true);
      expect(session.buildId()).toBe(openBuildId);
      const stillThere = await persistence.getDraftRecord(openBuildId);
      expect(stillThere?.ok).toBe(true);
    });
  });

  describe('compile persistence', () => {
    it('persists exactly one compiled revision and marks the draft record compiled', async () => {
      await facade.bootstrap();
      facade.startFromIntent('cinematic');
      const buildId = session.buildId()!;
      await facade.saveDraft();
      await facade.compile();

      const compiled = await persistence.listCompiledRevisionRecordsForBuild(
        buildId,
      );
      expect(compiled.valid.length).toBe(1);

      const draftRecord = await persistence.getDraftRecord(buildId);
      expect(draftRecord?.ok).toBe(true);
      if (draftRecord?.ok) {
        expect(draftRecord.record.compileStatus).toBe('compiled');
      }
    });

    it('mints a new immutable revision for each explicit compile, growing the revision history', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const buildId = session.buildId()!;
      await facade.saveDraft();

      await facade.compile();
      // Revision ids are minted from a millisecond clock — advance the
      // clock so the second compile is guaranteed a distinct revisionId
      // rather than depending on incidental test-runner timing.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await facade.compile();

      const compiled = await persistence.listCompiledRevisionRecordsForBuild(
        buildId,
      );
      // Each compile publishes a new immutable DroneBuildRevision (distinct
      // revisionId), so recompiling an unchanged draft still records a new
      // revision in the Hangar's "Compiled User Aircraft" history rather
      // than silently reusing the previous one.
      expect(compiled.valid.length).toBe(2);
      const revisionIds = new Set(compiled.valid.map((r) => r.revisionId));
      expect(revisionIds.size).toBe(2);
    });
  });

  describe('backend fallback', () => {
    it('reports memory-fallback and still saves drafts (session-only) when persistence has no durable backend', async () => {
      facade.replaceBuildRepositoryForTests();
      await facade.bootstrap();
      expect(session.persistenceBackend()).toBe('memory-fallback');

      facade.startFromIntent('freestyle');
      const buildId = session.buildId()!;
      const saved = await facade.saveDraft();
      expect(saved).toBe(true);
      expect(session.saveState()).toBe('storage-unavailable');

      const record = await persistence.getDraftRecord(buildId);
      expect(record?.ok).toBe(true);
    });
  });
});
