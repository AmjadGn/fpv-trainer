import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildOfficialCatalogSnapshot,
} from '@fpv/component-catalog';
import {
  createDraft,
  createQuadSelections,
  publishRevision,
} from '@fpv/drone-build-domain';
import { compileAircraft } from '@fpv/aircraft-compiler';
import { FREE_FLIGHT_POLICY } from '@fpv/compatibility-engine';
import {
  createCompiledRevisionEnvelope,
  createLinkedMemoryPersistence,
} from '@fpv/drone-build-persistence';
import { asRuntimeCompatibilitySignature } from '@fpv/engineering-kernel';

import { AircraftCatalogService } from '../../../core/aircraft/services/aircraft-catalog.service';
import {
  AIRCRAFT_PREFS_STORAGE_KEY,
  AircraftPersistenceService,
} from '../../../core/aircraft/services/aircraft-persistence.service';
import { SelectedAircraftService } from '../../../core/aircraft/services/selected-aircraft.service';
import { AppShellService } from '../../../core/shell/app-shell.service';
import { DroneBuildPersistenceService } from '../../../core/drone-build/drone-build-persistence.service';
import { BuilderPresentationMapperService } from '../../drone-builder/services/builder-presentation-mapper.service';
import { ComponentPresentationMediaService } from '../../drone-builder/services/component-presentation-media.service';
import { DroneBuilderFacadeService } from '../../drone-builder/services/drone-builder-facade.service';
import { DroneBuilderSessionService } from '../../drone-builder/services/drone-builder-session.service';
import { HangarLibraryService } from './hangar-library.service';

describe('HangarLibraryService (Checkpoint 4)', () => {
  let hangar: HangarLibraryService;
  let facade: DroneBuilderFacadeService;
  let session: DroneBuilderSessionService;
  let persistence: DroneBuildPersistenceService;
  let catalog: AircraftCatalogService;
  let selected: SelectedAircraftService;
  let shell: AppShellService;

  /** Simulate a healthy, persistent (IndexedDB-like) backend using fresh linked memory repos. */
  function usePersistentBackend(): void {
    const linked = createLinkedMemoryPersistence();
    persistence.replaceRepositoriesForTests({
      builds: linked.builds,
      library: linked.library,
      artifacts: linked.artifacts,
      backend: 'indexeddb',
    });
  }

  beforeEach(() => {
    try {
      localStorage.removeItem(AIRCRAFT_PREFS_STORAGE_KEY);
    } catch {
      /* jsdom */
    }

    TestBed.configureTestingModule({
      providers: [
        HangarLibraryService,
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

    hangar = TestBed.inject(HangarLibraryService);
    facade = TestBed.inject(DroneBuilderFacadeService);
    session = TestBed.inject(DroneBuilderSessionService);
    persistence = TestBed.inject(DroneBuildPersistenceService);
    catalog = TestBed.inject(AircraftCatalogService);
    selected = TestBed.inject(SelectedAircraftService);
    shell = TestBed.inject(AppShellService);
  });

  describe('empty and storage states', () => {
    it('starts empty with factory aircraft exposed and no drafts/compiled cards', async () => {
      usePersistentBackend();
      await hangar.refresh();
      expect(hangar.state()).toBe('empty');
      expect(hangar.draftCards()).toEqual([]);
      expect(hangar.compiledCards()).toEqual([]);
      expect(hangar.recoveryNotice()).toBeNull();
      expect(hangar.factoryAircraft().length).toBeGreaterThan(0);
      expect(hangar.isStorageUnavailable()).toBe(false);
    });

    it('reports storage-unavailable when persistence falls back to memory', async () => {
      persistence.replaceWithMemoryForTests();
      await hangar.refresh();
      expect(hangar.state()).toBe('storage-unavailable');
      expect(hangar.isStorageUnavailable()).toBe(true);
      expect(hangar.storageMessage()).toBeTruthy();
    });

    it('reports partial-recovery when an invalid persisted draft record exists', async () => {
      usePersistentBackend();
      await persistence.ensureReady();
      await persistence
        .getLibraryRepository()
        .saveDraftRecord({ nonsense: true } as never);

      await hangar.refresh();
      expect(hangar.state()).toBe('partial-recovery');
      expect(hangar.recoveryNotice()?.invalidDraftCount).toBe(1);
      expect(hangar.recoveryNotice()?.invalidCompiledCount).toBe(0);
    });
  });

  describe('draft cards', () => {
    it('exposes a draft card after saving a draft from the Builder', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const saved = await facade.saveDraft();
      expect(saved).toBe(true);
      const buildId = session.buildId();

      await hangar.refresh();
      expect(hangar.state()).toBe('ready');
      const cards = hangar.draftCards();
      expect(cards.length).toBe(1);
      const card = cards[0];
      expect(card.buildId).toBe(buildId);
      expect(card.intentLabel).toBe('Racing');
      expect(card.completenessFraction).toBe(1);
      expect(card.hasMissingComponents).toBe(false);
      expect(card.hasCompiledRevisions).toBe(false);
      expect(card.compiledRevisionCount).toBe(0);
      expect(card.isOutdated).toBe(false);
      expect(card.canCompile).toBe(true);
      expect(card.frameMedia).toBeTruthy();
    });

    it('renames a persisted draft and reflects the new name in its card', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('cinematic');
      await facade.saveDraft();
      await hangar.refresh();
      const card = hangar.draftCards()[0];

      const ok = await hangar.renameDraft(card.buildId, 'My Cinema Rig');
      expect(ok).toBe(true);
      expect(hangar.draftCards()[0].name).toBe('My Cinema Rig');
      expect(hangar.actionNotice()).toContain('My Cinema Rig');
    });

    it('rejects renaming to a blank name without touching persisted state', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      await facade.saveDraft();
      await hangar.refresh();
      const card = hangar.draftCards()[0];

      const ok = await hangar.renameDraft(card.buildId, '   ');
      expect(ok).toBe(false);
    });

    it('duplicates a draft into a second independent draft card', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      await facade.saveDraft();
      await hangar.refresh();
      const original = hangar.draftCards()[0];

      const newBuildId = await hangar.duplicateDraft(original.buildId);
      expect(newBuildId).toBeTruthy();
      expect(newBuildId).not.toBe(original.buildId);
      expect(hangar.draftCards().length).toBe(2);
      expect(hangar.actionNotice()).toBeTruthy();
    });

    it('deletes a draft while preserving its compiled revision as a flyable orphan', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('long-range');
      await facade.saveDraft();
      await facade.compile();
      await hangar.refresh();
      const draftCard = hangar.draftCards()[0];
      const compiledBefore = hangar.compiledCards()[0];
      expect(compiledBefore.sourceDraftExists).toBe(true);

      const ok = await hangar.deleteDraft(draftCard.buildId);
      expect(ok).toBe(true);
      expect(hangar.draftCards().length).toBe(0);

      const compiledAfter = hangar.compiledCards()[0];
      expect(compiledAfter.revisionId).toBe(compiledBefore.revisionId);
      expect(compiledAfter.sourceDraftExists).toBe(false);
      expect(compiledAfter.isOrphan).toBe(true);
      expect(compiledAfter.isFlyable).toBe(true);
    });
  });

  describe('compiled cards', () => {
    it('registers a flyable compiled card linked back to its draft card', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      await facade.saveDraft();
      const result = await facade.compile();
      expect(Array.isArray(result) ? false : result.ok).toBe(true);
      const aircraftId = session.lastCompile()?.aircraftId;
      expect(aircraftId).toBeTruthy();

      await hangar.refresh();
      expect(hangar.state()).toBe('ready');
      const compiledCards = hangar.compiledCards();
      expect(compiledCards.length).toBe(1);
      const card = compiledCards[0];
      expect(card.aircraftId).toBe(aircraftId);
      expect(card.isFlyable).toBe(true);
      expect(card.runtimeCompatible).toBe(true);
      expect(card.sourceDraftExists).toBe(true);
      expect(card.isOrphan).toBe(false);
      expect(card.massLabel).toBeTruthy();
      expect(card.thrustLabel).toBeTruthy();

      const draftCard = hangar
        .draftCards()
        .find((d) => d.buildId === card.buildId);
      expect(draftCard?.hasCompiledRevisions).toBe(true);
      expect(draftCard?.compiledRevisionCount).toBe(1);
    });

    it('flyCompiled selects the exact aircraft id and opens the flight shell', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('long-range');
      await facade.saveDraft();
      await facade.compile();
      await hangar.refresh();
      const card = hangar.compiledCards()[0];

      const ok = hangar.flyCompiled(card.revisionId);
      expect(ok).toBe(true);
      expect(shell.view()).toBe('flight');
      const intent = shell.flightIntent();
      expect(intent?.kind).toBe('test-flight');
      if (intent?.kind === 'test-flight') {
        expect(intent.aircraftId).toBe(card.aircraftId);
      }
      expect(selected.selectedAircraftId()).toBe(card.aircraftId);
    });

    it('deletes a compiled revision and removes it from the aircraft catalog', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('racing');
      await facade.saveDraft();
      await facade.compile();
      await hangar.refresh();
      const card = hangar.compiledCards()[0];
      expect(catalog.getById(card.aircraftId)).toBeTruthy();

      await hangar.deleteCompiledRevision(card.revisionId);
      expect(hangar.compiledCards().length).toBe(0);
      expect(catalog.getById(card.aircraftId)).toBeUndefined();
    });

    it('duplicates a compiled revision’s frozen selections into a new draft and opens the Builder', async () => {
      usePersistentBackend();
      await facade.bootstrap();
      facade.startFromIntent('long-range');
      await facade.saveDraft();
      await facade.compile();
      await hangar.refresh();
      const card = hangar.compiledCards()[0];

      const newBuildId = await hangar.duplicateCompiledSourceIntoBuilder(
        card.revisionId,
      );
      expect(newBuildId).toBeTruthy();
      expect(shell.view()).toBe('builder');
      const draftCard = hangar
        .draftCards()
        .find((d) => d.buildId === newBuildId);
      expect(draftCard).toBeTruthy();
      expect(draftCard?.name).toContain('Copy of');
    });

    it('marks a compiled revision runtime-incompatible and refuses to fly it', async () => {
      usePersistentBackend();
      const catalogSnapshot = buildOfficialCatalogSnapshot();
      const { selections, topology } = createQuadSelections({
        frameRevisionId: 'frame-racing-5in@1',
        motorRevisionId: 'motor-2207-2450kv@1',
        propellerRevisionId: 'prop-5x4x3@1',
        batteryRevisionId: 'batt-6s-1500@1',
        escRevisionId: 'esc-4in1-45a@1',
        fcRevisionId: 'fc-f7-standard@1',
        cameraRevisionId: 'cam-fpv-standard@1',
        vtxRevisionId: 'vtx-25-800@1',
        receiverRevisionId: 'rx-elrs@1',
        armPositions: [
          { x: 0.08, y: 0.08, z: 0 },
          { x: -0.08, y: 0.08, z: 0 },
          { x: -0.08, y: -0.08, z: 0 },
          { x: 0.08, y: -0.08, z: 0 },
        ],
      });
      const draft = createDraft({
        buildId: 'legacy-incompatible',
        name: 'Legacy Incompatible Build',
        catalogReleaseId: catalogSnapshot.release.releaseId,
        selections,
        topology,
      });
      const revision = publishRevision(draft, 'legacy-incompatible@1', null);
      const result = compileAircraft(
        revision,
        [...catalogSnapshot.revisions.values()],
        { policy: FREE_FLIGHT_POLICY },
      );
      expect(result.ok).toBe(true);
      const spec = result.specification!;

      const staleSignature = asRuntimeCompatibilitySignature(
        'legacy-runtime-signature-v0',
      );
      const envelope = createCompiledRevisionEnvelope({
        revision,
        displayNameAtCompile: draft.name,
        revisionLabel: 'Revision 1',
        intentId: null,
        aircraftId: 'user-legacy-incompatible',
        buildFingerprint: spec.buildFingerprint,
        artifactFingerprint: spec.artifactFingerprint,
        compilationContextFingerprint: spec.compilationContextFingerprint,
        runtimeCompatibilitySignature: staleSignature,
        engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
        compilerVersion: spec.versionManifest.compilerVersion,
        massKg: spec.physicalAssembly.totalMassKg,
        thrustNewtons: spec.propulsion.totalMaxThrustNewtons,
        artifact: {
          buildFingerprint: spec.buildFingerprint,
          compilationContextFingerprint: spec.compilationContextFingerprint,
          runtimeCompatibilitySignature: staleSignature,
          artifactFingerprint: spec.artifactFingerprint,
          engineeringModelVersion: spec.versionManifest.engineeringModelVersion,
          compilerVersion: spec.versionManifest.compilerVersion,
          specification: spec,
          createdAtIso: new Date().toISOString(),
          trustStatus: 'local',
        },
      });

      await persistence.saveCompiledRevisionRecord(envelope);
      await hangar.refresh();

      const card = hangar
        .compiledCards()
        .find((c) => c.revisionId === envelope.revisionId);
      expect(card).toBeTruthy();
      expect(card?.isOrphan).toBe(true);
      expect(card?.runtimeCompatible).toBe(false);
      expect(card?.isFlyable).toBe(false);
      expect(catalog.getById('user-legacy-incompatible')).toBeUndefined();

      const flew = hangar.flyCompiled(card!.revisionId);
      expect(flew).toBe(false);
      expect(shell.view()).not.toBe('flight');
    });
  });
});
