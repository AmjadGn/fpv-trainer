import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AircraftCatalogService } from '../../../core/aircraft/services/aircraft-catalog.service';
import {
  AIRCRAFT_PREFS_STORAGE_KEY,
  AircraftPersistenceService,
} from '../../../core/aircraft/services/aircraft-persistence.service';
import { SelectedAircraftService } from '../../../core/aircraft/services/selected-aircraft.service';
import { AppShellService } from '../../../core/shell/app-shell.service';
import { BuilderPresentationMapperService } from './builder-presentation-mapper.service';
import { ComponentPresentationMediaService } from './component-presentation-media.service';
import { DroneBuilderFacadeService } from './drone-builder-facade.service';
import { DroneBuilderSessionService } from './drone-builder-session.service';

describe('DroneBuilderFacadeService Simple Builder (CP2)', () => {
  let facade: DroneBuilderFacadeService;
  let session: DroneBuilderSessionService;
  let catalog: AircraftCatalogService;
  let selected: SelectedAircraftService;
  let shell: AppShellService;
  let mapper: BuilderPresentationMapperService;

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
      ],
    });

    facade = TestBed.inject(DroneBuilderFacadeService);
    session = TestBed.inject(DroneBuilderSessionService);
    catalog = TestBed.inject(AircraftCatalogService);
    selected = TestBed.inject(SelectedAircraftService);
    shell = TestBed.inject(AppShellService);
    mapper = TestBed.inject(BuilderPresentationMapperService);
  });

  describe('intent behavior', () => {
    it('loads a complete starting selection for each intent without bypassing validation', async () => {
      await facade.bootstrap();
      for (const intent of facade.intents) {
        facade.startFromIntent(intent.id);
        expect(session.canCompile()).toBe(true);
        expect(session.phase()).toBe('valid');
        expect(facade.selectedCount()).toBe(9);
        expect(session.selectedRevisionIdsBySlot()['frame']).toBeTruthy();
        expect(session.selectedRevisionIdsBySlot()['motor']).toBeTruthy();
        expect(session.selectedRevisionIdsBySlot()['battery']).toBeTruthy();
      }
    });

    it('does not silently destroy selections when intent changes on a dirty session', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const before = { ...session.selectedRevisionIdsBySlot() };
      facade.setActiveCategory('battery');
      const other = facade
        .optionsForActiveCategory()
        .find((o) => o.revisionId !== before['battery']);
      expect(other).toBeTruthy();
      facade.selectComponentForActiveCategory(other!.revisionId);

      const decision = facade.requestIntentChange('cinematic');
      expect(decision).toBe('needs-confirmation');
      expect(session.selectedRevisionIdsBySlot()).toEqual(
        expect.objectContaining({
          battery: other!.revisionId,
        }),
      );

      facade.confirmIntentLabelOnly();
      expect(session.intentId()).toBe('cinematic');
      expect(session.selectedRevisionIdsBySlot()['battery']).toBe(other!.revisionId);
      expect(session.selectedRevisionIdsBySlot()['frame']).toBe(before['frame']);
    });

    it('preserves a custom build name when intent selections are replaced', async () => {
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      facade.setBuildName('Weekend Freestyle Rig');
      expect(session.nameManuallySet()).toBe(true);

      facade.requestIntentChange('long-range');
      // clean? user modified name only — hasUserModifiedSelections is false if only name changed
      // Name change sets dirty but not selection baseline drift. Intent can apply directly.
      expect(session.buildName()).toBe('Weekend Freestyle Rig');
    });

    it('replaces selections when confirmed after a dirty part change', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      facade.setActiveCategory('motor');
      const currentMotor = session.selectedRevisionIdsBySlot()['motor'];
      const other = facade
        .optionsForActiveCategory()
        .find((o) => o.revisionId !== currentMotor);
      facade.selectComponentForActiveCategory(other!.revisionId);

      expect(facade.requestIntentChange('freestyle')).toBe('needs-confirmation');
      facade.confirmIntentReplaceSelections();
      expect(session.intentId()).toBe('freestyle');
      expect(session.selectedRevisionIdsBySlot()['motor']).not.toBe(other!.revisionId);
      expect(session.canCompile()).toBe(true);
    });
  });

  describe('shared state', () => {
    it('preserves selections across Simple/Advanced mode switches', async () => {
      await facade.bootstrap();
      facade.startFromIntent('cinematic');
      const before = { ...session.selectedRevisionIdsBySlot() };
      facade.setMode('advanced');
      facade.setMode('simple');
      expect(session.selectedRevisionIdsBySlot()).toEqual(before);
    });

    it('updates the same shared session when a component changes', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const buildId = session.buildId();
      facade.setActiveCategory('propeller');
      const current = session.selectedRevisionIdsBySlot()['propeller'];
      const next = facade
        .optionsForActiveCategory()
        .find((o) => o.revisionId !== current);
      facade.selectComponentForActiveCategory(next!.revisionId);
      expect(session.buildId()).toBe(buildId);
      expect(session.selectedRevisionIdsBySlot()['propeller']).toBe(next!.revisionId);
    });
  });

  describe('compatibility and engineering presentation', () => {
    it('maps voltage issues into plain-language actions', () => {
      const issue = mapper.mapIssue({
        ruleCode: 'ELEC_VOLTAGE_COMPAT',
        severity: 'error',
        messageKey: 'voltage.mismatch',
        relatedSelectionIds: ['battery', 'esc'],
        parameters: {},
        affectedPath: 'battery.voltage',
        remediationKeys: ['choose.compatible.esc'],
        phase: 'electrical',
      });
      expect(issue.issueClass).toBe('blocking-error');
      expect(issue.suggestedAction.toLowerCase()).toContain('battery');
      expect(issue.domainCode).toBe('ELEC_VOLTAGE_COMPAT');
      expect(issue.title.toLowerCase()).not.toContain('fingerprint');
    });

    it('does not turn unavailable engineering values into zero', () => {
      const stats = mapper.mapEngineeringStats(undefined);
      expect(stats).toEqual([]);
    });

    it('exposes honest confidence/source labels without internal IDs', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const stats = facade.simpleStats();
      expect(stats.length).toBeGreaterThan(0);
      for (const stat of stats) {
        if (!stat.available) {
          expect(stat.displayValue).toBe('Not available for this combination');
          expect(stat.value).toBeNull();
        } else {
          expect(String(stat.displayValue)).not.toContain('@');
          expect(
            ['Measured', 'Curated synthetic', 'Estimated', 'Legacy fallback'].includes(
              stat.source,
            ),
          ).toBe(true);
        }
      }
    });

    it('represents missing required categories clearly', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      facade.resetBuild();
      expect(session.readiness()).toBe('incomplete');
      expect(session.canCompile()).toBe(false);
      expect(facade.selectedCount()).toBe(0);
    });
  });

  describe('compilation and launch', () => {
    it('registers a selectable aircraft on success and marks compile stale after edits', async () => {
      await facade.bootstrap();
      facade.startFromIntent('long-range');
      await facade.compile();
      expect(session.phase()).toBe('compiled');
      const aircraftId = session.lastCompile()?.aircraftId;
      expect(aircraftId).toBeTruthy();
      expect(catalog.getById(aircraftId!)).toBeTruthy();
      expect(selected.selectedAircraftId()).toBe(aircraftId);

      facade.setActiveCategory('battery');
      const current = session.selectedRevisionIdsBySlot()['battery'];
      const next = facade
        .optionsForActiveCategory()
        .find((o) => o.revisionId !== current);
      facade.selectComponentForActiveCategory(next!.revisionId);
      expect(session.compileStale()).toBe(true);
      expect(facade.canLaunchCompiled()).toBe(false);
    });

    it('does not replace the selected aircraft when compile is blocked', async () => {
      await facade.bootstrap();
      const previousId = selected.selectedAircraftId();
      await facade.compile();
      expect(selected.selectedAircraftId()).toBe(previousId);
    });

    it('compileAndFly selects the exact compiled aircraft through the flight shell', async () => {
      await facade.bootstrap();
      facade.startFromIntent('racing');
      const ok = await facade.compileAndFly();
      expect(ok).toBe(true);
      expect(shell.view()).toBe('flight');
      const intent = shell.flightIntent();
      expect(intent?.kind).toBe('test-flight');
      if (intent?.kind === 'test-flight') {
        expect(intent.aircraftId).toBe(selected.selectedAircraftId());
        expect(intent.aircraftId).toBe(session.lastCompile()?.aircraftId);
        expect(intent.aircraftId.startsWith('user-')).toBe(true);
      }
    });

    it('refuses to launch a stale compilation without recompiling', async () => {
      await facade.bootstrap();
      facade.startFromIntent('freestyle');
      await facade.compile();
      const compiledId = session.lastCompile()?.aircraftId;
      facade.setActiveCategory('propeller');
      const current = session.selectedRevisionIdsBySlot()['propeller'];
      const next = facade
        .optionsForActiveCategory()
        .find((o) => o.revisionId !== current);
      facade.selectComponentForActiveCategory(next!.revisionId);
      expect(session.compileStale()).toBe(true);

      // canCompile may still be true; compileAndFly should recompile rather than launch stale.
      const ok = await facade.compileAndFly();
      expect(ok).toBe(true);
      expect(session.compileStale()).toBe(false);
      expect(session.lastCompile()?.aircraftId).toBeTruthy();
      expect(session.lastCompile()?.aircraftId).not.toBe(compiledId);
    });

    it('compiles the same fingerprint in both UI modes', async () => {
      await facade.bootstrap();
      facade.startFromIntent('cinematic');
      facade.setMode('simple');
      const simpleFp = facade.compileFingerprintForCurrentDraft();
      facade.setMode('advanced');
      const advancedFp = facade.compileFingerprintForCurrentDraft();
      expect(simpleFp).toBeTruthy();
      expect(simpleFp).toBe(advancedFp);
    });
  });
});

describe('BuilderPresentationMapperService Simple copy', () => {
  it('maps propulsion provenance labels honestly', () => {
    TestBed.configureTestingModule({
      providers: [BuilderPresentationMapperService, ComponentPresentationMediaService],
    });
    const mapper = TestBed.inject(BuilderPresentationMapperService);
    expect(mapper.mapPropulsionProvenance('measured-table')).toBe('Measured');
    expect(mapper.mapPropulsionProvenance('curated-estimate-table')).toBe(
      'Curated synthetic',
    );
    expect(mapper.mapPropulsionProvenance('peak-thrust-hint-fallback')).toBe(
      'Legacy fallback',
    );
    expect(mapper.sourceBrief('Curated synthetic')).toContain('curated synthetic');
  });
});
