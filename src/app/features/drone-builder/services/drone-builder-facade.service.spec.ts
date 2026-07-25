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
import { DroneBuilderFacadeService } from './drone-builder-facade.service';
import { DroneBuilderSessionService } from './drone-builder-session.service';

describe('DroneBuilderFacadeService orchestration', () => {
  let facade: DroneBuilderFacadeService;
  let session: DroneBuilderSessionService;
  let catalog: AircraftCatalogService;
  let selected: SelectedAircraftService;
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
  });

  it('bootstraps catalog and starts from racing intent', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');

    expect(session.intentId()).toBe('racing');
    expect(session.phase()).toBe('valid');
    expect(session.canCompile()).toBe(true);
    expect(Object.keys(session.selectedRevisionIdsBySlot()).length).toBeGreaterThan(
      4,
    );
  });

  it('preserves selections when switching Simple and Advanced modes', async () => {
    await facade.bootstrap();
    facade.startFromIntent('freestyle');
    const before = { ...session.selectedRevisionIdsBySlot() };

    facade.setMode('advanced');
    expect(session.mode()).toBe('advanced');
    expect(session.selectedRevisionIdsBySlot()).toEqual(before);

    facade.setMode('simple');
    expect(session.selectedRevisionIdsBySlot()).toEqual(before);
  });

  it('compiles the same fingerprint regardless of UI mode', async () => {
    await facade.bootstrap();
    facade.startFromIntent('cinematic');

    facade.setMode('simple');
    const simpleFp = facade.compileFingerprintForCurrentDraft();
    facade.setMode('advanced');
    const advancedFp = facade.compileFingerprintForCurrentDraft();

    expect(simpleFp).toBeTruthy();
    expect(simpleFp).toBe(advancedFp);
  });

  it('registers a selectable aircraft on successful compile', async () => {
    await facade.bootstrap();
    facade.startFromIntent('long-range');

    facade.compile();
    expect(session.phase()).toBe('compiled');
    expect(session.lastCompile()?.ok).toBe(true);

    const aircraftId = session.lastCompile()?.aircraftId;
    expect(aircraftId).toBeTruthy();
    expect(catalog.getById(aircraftId!)).toBeTruthy();
    expect(selected.selectedAircraftId()).toBe(aircraftId);
    expect(catalog.userAircraft().length).toBeGreaterThan(0);
  });

  it('does not replace the selected aircraft when compile is blocked', async () => {
    await facade.bootstrap();
    const previousId = selected.selectedAircraftId();
    facade.compile();
    expect(session.phase()).toBe('idle');
    expect(selected.selectedAircraftId()).toBe(previousId);
  });

  it('compileAndFly launches the compiled aircraft into the flight shell', async () => {
    await facade.bootstrap();
    facade.startFromIntent('racing');

    const ok = facade.compileAndFly();
    expect(ok).toBe(true);
    expect(session.phase()).toBe('launching');
    expect(shell.view()).toBe('flight');
    expect(shell.flightIntent()?.kind).toBe('test-flight');
    const intent = shell.flightIntent();
    if (intent?.kind === 'test-flight') {
      expect(intent.aircraftId).toBe(selected.selectedAircraftId());
    }
    expect(session.launchAircraftName()).toBe(session.buildName());
  });
});

describe('BuilderPresentationMapperService', () => {
  it('maps propulsion provenance labels honestly', () => {
    const mapper = new BuilderPresentationMapperService();
    expect(mapper.mapPropulsionProvenance('measured-table')).toBe('Measured');
    expect(mapper.mapPropulsionProvenance('curated-estimate-table')).toBe(
      'Curated synthetic',
    );
    expect(mapper.mapPropulsionProvenance('peak-thrust-hint-fallback')).toBe(
      'Legacy fallback',
    );
    expect(mapper.mapPropulsionProvenance('estimated')).toBe('Estimated');
  });
});
