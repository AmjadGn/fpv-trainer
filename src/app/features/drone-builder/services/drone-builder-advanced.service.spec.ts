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

describe('Advanced Builder shared state (CP3)', () => {
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

  it('preserves selections when switching Simple → Advanced', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    const before = { ...session.selectedRevisionIdsBySlot() };
    facade.setMode('advanced');
    expect(session.mode()).toBe('advanced');
    expect(session.selectedRevisionIdsBySlot()).toEqual(before);
  });

  it('preserves selections when switching Advanced → Simple', async () => {
    await facade.bootstrap();
    facade.startFromIntent('freestyle');
    facade.setMode('advanced');
    const before = { ...session.selectedRevisionIdsBySlot() };
    facade.setMode('simple');
    expect(session.mode()).toBe('simple');
    expect(session.selectedRevisionIdsBySlot()).toEqual(before);
  });

  it('shares build name and intent across modes', async () => {
    await facade.bootstrap();
    facade.startFromIntent('cinematic');
    facade.setBuildName('Shared Cinema Rig');
    const intent = session.intentId();
    facade.setMode('advanced');
    expect(session.buildName()).toBe('Shared Cinema Rig');
    expect(session.intentId()).toBe(intent);
    facade.setMode('simple');
    expect(session.buildName()).toBe('Shared Cinema Rig');
    expect(session.intentId()).toBe(intent);
  });

  it('shares selected component images across modes', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    facade.setActiveCategory('frame');
    facade.setMode('simple');
    const simpleMedia = facade.mappedOptionsForActiveCategory().map((o) => ({
      id: o.revisionId,
      thumb: o.media.thumbnailUrl,
      alt: o.media.altText,
    }));
    facade.setMode('advanced');
    const advancedMedia = facade.mappedAdvancedDetailsForActiveCategory().map((d) => ({
      id: d.option.revisionId,
      thumb: d.option.media.thumbnailUrl,
      alt: d.option.media.altText,
    }));
    expect(advancedMedia).toEqual(simpleMedia);
  });

  it('updates Simple when a component changes in Advanced', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    facade.setMode('advanced');
    facade.setActiveCategory('battery');
    const current = session.selectedRevisionIdsBySlot()['battery'];
    const next = facade
      .optionsForActiveCategory()
      .find((o) => o.revisionId !== current);
    facade.selectComponentForActiveCategory(next!.revisionId);
    facade.setMode('simple');
    expect(session.selectedRevisionIdsBySlot()['battery']).toBe(next!.revisionId);
  });

  it('updates Advanced when a component changes in Simple', async () => {
    await facade.bootstrap();
    facade.startFromIntent('long-range');
    facade.setMode('simple');
    facade.setActiveCategory('motor');
    const current = session.selectedRevisionIdsBySlot()['motor'];
    const next = facade
      .optionsForActiveCategory()
      .find((o) => o.revisionId !== current);
    facade.selectComponentForActiveCategory(next!.revisionId);
    facade.setMode('advanced');
    expect(session.selectedRevisionIdsBySlot()['motor']).toBe(next!.revisionId);
  });

  it('does not mark compilation stale when only switching mode', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    await facade.compile();
    expect(session.compileStale()).toBe(false);
    facade.setMode('advanced');
    expect(session.compileStale()).toBe(false);
    facade.setMode('simple');
    expect(session.compileStale()).toBe(false);
    expect(session.lastCompile()?.ok).toBe(true);
  });

  it('compiles to the same fingerprint from either mode', async () => {
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

describe('Advanced diagnostics and engineering (CP3)', () => {
  let facade: DroneBuilderFacadeService;
  let session: DroneBuilderSessionService;
  let mapper: BuilderPresentationMapperService;
  let selected: SelectedAircraftService;
  let catalog: AircraftCatalogService;
  let shell: AppShellService;

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
    mapper = TestBed.inject(BuilderPresentationMapperService);
    selected = TestBed.inject(SelectedAircraftService);
    catalog = TestBed.inject(AircraftCatalogService);
    shell = TestBed.inject(AppShellService);
  });

  it('groups blocking issues separately from warnings', () => {
    const blocking = mapper.mapIssue({
      ruleCode: 'ELEC_VOLTAGE_COMPAT',
      severity: 'error',
      messageKey: 'voltage.mismatch',
      relatedSelectionIds: ['battery', 'esc'],
      parameters: {},
      affectedPath: 'battery.voltage',
      remediationKeys: ['choose.compatible.esc'],
      phase: 'electrical',
    });
    const warning = mapper.mapIssue({
      ruleCode: 'ELEC_ESC_CURRENT_MARGIN',
      severity: 'warning',
      messageKey: 'esc.margin',
      relatedSelectionIds: ['esc', 'motor'],
      parameters: {},
      affectedPath: 'esc.current',
      remediationKeys: ['choose.higher.esc'],
      phase: 'electrical',
    });
    expect(blocking.issueClass).toBe('blocking-error');
    expect(warning.issueClass).toBe('warning');
    expect(warning.issueClass).not.toBe('blocking-error');
  });

  it('exposes diagnostic codes for Advanced presentation', () => {
    const issue = mapper.mapIssue({
      ruleCode: 'MECH_PROP_CLEARANCE',
      severity: 'error',
      messageKey: 'prop.clearance',
      relatedSelectionIds: ['propeller', 'frame'],
      parameters: {},
      affectedPath: 'propeller.diameter',
      remediationKeys: ['choose.smaller.prop'],
      phase: 'mechanical',
    });
    expect(issue.domainCode).toBe('MECH_PROP_CLEARANCE');
  });

  it('navigates suggested diagnostics to the affected category', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    facade.setMode('advanced');
    facade.setActiveCategory('frame');
    facade.navigateToAffectedCategory('battery');
    expect(session.activeCategory()).toBe('battery');
  });

  it('does not display unavailable engineering values as zero', async () => {
    await facade.bootstrap();
    facade.resetBuild();
    expect(facade.advancedStats()).toEqual([]);
    const empty = mapper.mapEngineeringStats(undefined);
    expect(empty).toEqual([]);
  });

  it('labels confidence/source accurately and never calls fallback measured', () => {
    expect(mapper.mapPropulsionProvenance('curated-estimate-table')).toBe(
      'Curated synthetic',
    );
    expect(mapper.mapPropulsionProvenance('peak-thrust-hint-fallback')).toBe(
      'Legacy fallback',
    );
    expect(mapper.provenanceDescription('Curated synthetic')).toContain(
      'not a measured commercial benchmark',
    );
    expect(mapper.mapPropulsionProvenance('curated-estimate-table')).not.toBe(
      'Measured',
    );
    expect(mapper.mapPropulsionProvenance('peak-thrust-hint-fallback')).not.toBe(
      'Measured',
    );
    expect(mapper.provenanceDescription('Legacy fallback').toLowerCase()).toContain(
      'fallback',
    );
    expect(mapper.mapPropulsionProvenance('measured-table')).toBe('Measured');
  });

  it('shows Not available for missing advanced component fields instead of fabricating zeros', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    facade.setActiveCategory('receiver');
    const details = facade.mappedAdvancedDetailsForActiveCategory();
    expect(details.length).toBeGreaterThan(0);
    for (const detail of details) {
      for (const spec of [...detail.physicalSpecs, ...detail.electricalSpecs]) {
        if (!spec.available) {
          expect(spec.value).toBe('Not available');
          expect(spec.value).not.toBe('0');
          expect(spec.value).not.toBe('N/A: 0');
        }
      }
    }
  });

  it('Advanced compile registers aircraft and Compile & Fly selects it', async () => {
    await facade.bootstrap();
    facade.setMode('advanced');
    facade.startFromIntent('freestyle');
    await facade.compile();
    expect(session.phase()).toBe('compiled');
    const aircraftId = session.lastCompile()?.aircraftId;
    expect(aircraftId).toBeTruthy();
    expect(catalog.getById(aircraftId!)).toBeTruthy();
    expect(selected.selectedAircraftId()).toBe(aircraftId);

    const ok = await facade.compileAndFly();
    expect(ok).toBe(true);
    expect(shell.view()).toBe('flight');
    expect(selected.selectedAircraftId()).toBe(aircraftId);
  });

  it('refuses stale launch and failed compile does not change selected aircraft', async () => {
    await facade.bootstrap();
    facade.setMode('advanced');
    facade.startFromIntent('racing');
    await facade.compile();
    const compiledId = session.lastCompile()?.aircraftId;
    expect(compiledId).toBeTruthy();

    facade.setActiveCategory('propeller');
    const current = session.selectedRevisionIdsBySlot()['propeller'];
    const next = facade
      .optionsForActiveCategory()
      .find((o) => o.revisionId !== current);
    facade.selectComponentForActiveCategory(next!.revisionId);
    expect(session.compileStale()).toBe(true);
    expect(facade.canLaunchCompiled()).toBe(false);

    const previous = selected.selectedAircraftId();
    // Empty build cannot compile — selected aircraft must remain unchanged.
    facade.resetBuild();
    const result = await facade.compile();
    expect(Array.isArray(result) || (result && 'ok' in result)).toBe(true);
    expect(session.canCompile()).toBe(false);
    expect(selected.selectedAircraftId()).toBe(previous);
  });

  it('exposes read-only tuning info without inventing editable knobs', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');
    const tuning = facade.currentTuningInfo();
    expect(tuning.editable).toBe(false);
    expect(tuning.summary.toLowerCase()).toContain('not available');
    expect(tuning.fields.length).toBeGreaterThan(0);
  });
});
