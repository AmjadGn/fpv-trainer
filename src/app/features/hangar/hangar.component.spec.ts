import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AIRCRAFT_PREFS_STORAGE_KEY,
  AircraftPersistenceService,
} from '../../core/aircraft/services/aircraft-persistence.service';
import { DroneBuildPersistenceService } from '../../core/drone-build/drone-build-persistence.service';
import { createLinkedMemoryPersistence } from '@fpv/drone-build-persistence';
import { DroneBuilderFacadeService } from '../drone-builder/services/drone-builder-facade.service';
import { ComponentPresentationMediaService } from '../drone-builder/services/component-presentation-media.service';
import { HangarComponent } from './hangar.component';
import { HangarLibraryService } from './services/hangar-library.service';

/**
 * Component-level tests deliberately avoid `fixture.detectChanges()`.
 * `ngAfterViewInit()` constructs a real `THREE.WebGLRenderer`, which has no
 * usable GL context under jsdom. Angular does not run lifecycle hooks until
 * the first change-detection pass, so constructing the component and
 * invoking its (otherwise protected) handler methods directly exercises the
 * Checkpoint 4 wiring without touching the 3D preview pipeline.
 */
describe('HangarComponent (Checkpoint 4 wiring)', () => {
  let component: HangarComponent;
  let hangarLibrary: HangarLibraryService;
  let facade: DroneBuilderFacadeService;
  let persistence: DroneBuildPersistenceService;
  let media: ComponentPresentationMediaService;

  beforeEach(async () => {
    try {
      localStorage.removeItem(AIRCRAFT_PREFS_STORAGE_KEY);
    } catch {
      /* jsdom */
    }

    await TestBed.configureTestingModule({
      imports: [HangarComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(HangarComponent);
    component = fixture.componentInstance;

    hangarLibrary = TestBed.inject(HangarLibraryService);
    facade = TestBed.inject(DroneBuilderFacadeService);
    persistence = TestBed.inject(DroneBuildPersistenceService);
    media = TestBed.inject(ComponentPresentationMediaService);

    const linked = createLinkedMemoryPersistence();
    persistence.replaceRepositoriesForTests({
      builds: linked.builds,
      library: linked.library,
      artifacts: linked.artifacts,
      backend: 'indexeddb',
    });
  });

  it('creates the component and wires the shared HangarLibraryService', () => {
    expect(component).toBeTruthy();
    expect((component as unknown as { hangarLibrary: HangarLibraryService })
      .hangarLibrary).toBe(hangarLibrary);
  });

  it('ngOnInit triggers a HangarLibraryService refresh', async () => {
    const refreshSpy = vi.spyOn(hangarLibrary, 'refresh');
    component.ngOnInit();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it('reflects storage-unavailable state through the component signal', async () => {
    persistence.replaceWithMemoryForTests();
    await hangarLibrary.refresh();
    expect((component as any).storageUnavailable()).toBe(true);
    expect((component as any).storageMessage()).toBeTruthy();
  });

  describe('draft actions', () => {
    async function createSavedDraft(): Promise<string> {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      await facade.saveDraft();
      await hangarLibrary.refresh();
      return hangarLibrary.draftCards()[0].buildId;
    }

    it('requestRenameDraft opens the rename dialog pre-filled with the current name', async () => {
      await createSavedDraft();
      const card = hangarLibrary.draftCards()[0];

      (component as any).requestRenameDraft(card);
      expect((component as any).renameDraftTarget()).toBe(card);
      expect((component as any).renameDraftName()).toBe(card.name);
    });

    it('confirmRenameDraft delegates the edited name to the library and closes the dialog', async () => {
      await createSavedDraft();
      const card = hangarLibrary.draftCards()[0];
      const renameSpy = vi
        .spyOn(hangarLibrary, 'renameDraft')
        .mockResolvedValue(true);

      (component as any).requestRenameDraft(card);
      (component as any).onRenameInput('Weekend Racer');
      (component as any).confirmRenameDraft();

      expect(renameSpy).toHaveBeenCalledWith(card.buildId, 'Weekend Racer');
      expect((component as any).renameDraftTarget()).toBeNull();
    });

    it('cancelRenameDraft closes the dialog without calling the library', async () => {
      await createSavedDraft();
      const card = hangarLibrary.draftCards()[0];
      const renameSpy = vi.spyOn(hangarLibrary, 'renameDraft');

      (component as any).requestRenameDraft(card);
      (component as any).cancelRenameDraft();

      expect((component as any).renameDraftTarget()).toBeNull();
      expect(renameSpy).not.toHaveBeenCalled();
    });

    it('requestDeleteDraft stages a target and confirmDeleteDraft delegates to the library', async () => {
      await createSavedDraft();
      const card = hangarLibrary.draftCards()[0];
      const deleteSpy = vi
        .spyOn(hangarLibrary, 'deleteDraft')
        .mockResolvedValue(true);

      (component as any).requestDeleteDraft(card);
      expect((component as any).deleteDraftTarget()).toBe(card);

      (component as any).confirmDeleteDraft();
      expect(deleteSpy).toHaveBeenCalledWith(card.buildId);
      expect((component as any).deleteDraftTarget()).toBeNull();
    });

    it('cancelDeleteDraft clears the pending target without deleting', async () => {
      await createSavedDraft();
      const card = hangarLibrary.draftCards()[0];
      const deleteSpy = vi.spyOn(hangarLibrary, 'deleteDraft');

      (component as any).requestDeleteDraft(card);
      (component as any).cancelDeleteDraft();

      expect((component as any).deleteDraftTarget()).toBeNull();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('compileAndFlyDraft disposes the 3D preview and delegates to the library', async () => {
      await createSavedDraft();
      const card = hangarLibrary.draftCards()[0];
      const compileAndFlySpy = vi
        .spyOn(hangarLibrary, 'compileAndFlyDraft')
        .mockResolvedValue(true);

      expect(() => (component as any).compileAndFlyDraft(card)).not.toThrow();
      expect(compileAndFlySpy).toHaveBeenCalledWith(card.buildId);
    });
  });

  describe('compiled aircraft actions', () => {
    async function createCompiledCard(): Promise<
      ReturnType<HangarLibraryService['compiledCards']>[number]
    > {
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      await facade.saveDraft();
      await facade.compile();
      await hangarLibrary.refresh();
      return hangarLibrary.compiledCards()[0];
    }

    it('flyCompiled disposes the 3D preview and delegates to the library by revision id', async () => {
      const card = await createCompiledCard();
      const flySpy = vi.spyOn(hangarLibrary, 'flyCompiled').mockReturnValue(true);

      expect(() => (component as any).flyCompiled(card)).not.toThrow();
      expect(flySpy).toHaveBeenCalledWith(card.revisionId);
    });

    it('requestDeleteCompiled stages a target and confirmDeleteCompiled delegates to the library', async () => {
      const card = await createCompiledCard();
      const deleteSpy = vi
        .spyOn(hangarLibrary, 'deleteCompiledRevision')
        .mockResolvedValue(undefined);

      (component as any).requestDeleteCompiled(card);
      expect((component as any).deleteCompiledTarget()).toBe(card);

      (component as any).confirmDeleteCompiled();
      expect(deleteSpy).toHaveBeenCalledWith(card.revisionId);
      expect((component as any).deleteCompiledTarget()).toBeNull();
    });

    it('cancelDeleteCompiled clears the pending target without deleting', async () => {
      const card = await createCompiledCard();
      const deleteSpy = vi.spyOn(hangarLibrary, 'deleteCompiledRevision');

      (component as any).requestDeleteCompiled(card);
      (component as any).cancelDeleteCompiled();

      expect((component as any).deleteCompiledTarget()).toBeNull();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('duplicateCompiledIntoBuilder disposes the 3D preview and delegates to the library', async () => {
      const card = await createCompiledCard();
      const dupSpy = vi
        .spyOn(hangarLibrary, 'duplicateCompiledSourceIntoBuilder')
        .mockResolvedValue('user-copy-x');

      expect(() =>
        (component as any).duplicateCompiledIntoBuilder(card),
      ).not.toThrow();
      expect(dupSpy).toHaveBeenCalledWith(card.revisionId);
    });
  });

  it('onMediaError delegates to ComponentPresentationMediaService for the frame category', () => {
    const errorSpy = vi.spyOn(media, 'onImageError').mockImplementation(() => {});
    const fakeEvent = new Event('error');

    (component as any).onMediaError(fakeEvent);

    expect(errorSpy).toHaveBeenCalledWith(fakeEvent, 'frame');
  });

  it('dismissLibraryNotice clears the HangarLibraryService action notice', () => {
    const clearSpy = vi.spyOn(hangarLibrary, 'clearActionNotice');
    (component as any).dismissLibraryNotice();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('openDraft disposes the 3D preview and delegates to the library by build id', async () => {
    await facade.bootstrap();
    facade.startFromIntent('cinematic');
    await facade.saveDraft();
    await hangarLibrary.refresh();
    const card = hangarLibrary.draftCards()[0];
    const openSpy = vi
      .spyOn(hangarLibrary, 'openDraftInBuilder')
      .mockResolvedValue(true);

    expect(() => (component as any).openDraft(card)).not.toThrow();
    expect(openSpy).toHaveBeenCalledWith(card.buildId);
  });
});
