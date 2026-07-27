import { TestBed } from '@angular/core/testing';

import { AppShellService } from '../../core/shell/app-shell.service';
import { ExpeditionsHubComponent } from './expeditions-hub.component';
import { ExpeditionMissionCatalog } from '../../core/mission/services/expedition-mission-catalog.service';
import { AircraftCatalogService } from '../../core/aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { MissionAircraftCapabilitiesAdapter } from '../../core/mission/adapters/mission-aircraft-capabilities.adapter';
import { MissionHistoryFacade } from '../../core/mission-persistence/mission-history.facade';
import { MissionPersistenceCoordinator } from '../../core/mission-persistence/mission-persistence.coordinator';
import { createMemoryMissionPersistenceAdapter } from '../../core/mission-persistence/memory-mission-persistence.adapter';
import { MISSION_ID_COASTAL_RUINS_SURVEY } from '../../content/locations/mediterranean-expedition-region';
import {
  MISSION_PERSISTENCE_SCHEMA_VERSION,
  buildMissionScopeKey,
} from '@fpv/mission-persistence';

describe('ExpeditionsHubComponent', () => {
  beforeEach(async () => {
    const memory = createMemoryMissionPersistenceAdapter();
    await memory.open();
    await memory.saveMissionResult({
      persistenceSchemaVersion: MISSION_PERSISTENCE_SCHEMA_VERSION,
      resultId: 'hub-best',
      missionScopeKey: buildMissionScopeKey({
        missionId: String(MISSION_ID_COASTAL_RUINS_SURVEY),
        missionVersion: '1.0.0',
        scoringPolicyVersion: '1.0.0',
      }),
      missionId: String(MISSION_ID_COASTAL_RUINS_SURVEY),
      missionVersion: '1.0.0',
      scoringPolicyVersion: '1.0.0',
      evidenceSchemaVersion: '2.0.0',
      sessionId: 's1',
      sessionGeneration: 1,
      locationId: 'mediterranean-expedition-region',
      locationVersion: '1.0.0',
      aircraftId: null,
      aircraftSourceType: null,
      aircraftDefinitionVersion: null,
      aircraftRuntimeCompatibilityVersion: null,
      status: 'completed',
      failureReasonCode: null,
      totalScore: 77,
      maximumScore: 100,
      normalizedScore: 0.77,
      requiredObjectiveSubtotal: 77,
      timeBonusPoints: 0,
      elapsedTicks: 500,
      fixedStepSeconds: 1 / 120,
      objectives: [],
      attemptCountTotal: 1,
      imageAvailability: [],
      savedAt: { savedAtEpochMs: Date.now(), savedAtIso: new Date().toISOString() },
    });

    const coordinator = new MissionPersistenceCoordinator();
    coordinator.usePortForTests(memory);

    TestBed.configureTestingModule({
      imports: [ExpeditionsHubComponent],
      providers: [
        AppShellService,
        ExpeditionMissionCatalog,
        AircraftCatalogService,
        SelectedAircraftService,
        MissionAircraftCapabilitiesAdapter,
        { provide: MissionPersistenceCoordinator, useValue: coordinator },
        MissionHistoryFacade,
      ],
    });
  });

  it('lists Coastal Ruins Survey with durable progress', async () => {
    const fixture = TestBed.createComponent(ExpeditionsHubComponent);
    fixture.detectChanges();
    await fixture.componentInstance['refreshHistory']();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/Coastal Ruins Survey/i);
    expect(text).toMatch(/Personal Best/i);
    expect(text).toMatch(/77/);

    const catalog = TestBed.inject(ExpeditionMissionCatalog);
    expect(catalog.get(MISSION_ID_COASTAL_RUINS_SURVEY)?.summary.captureScoringEnabled).toBe(
      true,
    );
  });

  it('requires confirmation before clearing mission data', async () => {
    const fixture = TestBed.createComponent(ExpeditionsHubComponent);
    fixture.detectChanges();
    await fixture.componentInstance['refreshHistory']();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="clear-confirm"]')).toBeNull();
    (fixture.nativeElement.querySelector('[data-testid="clear-mission-data"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="clear-confirm"]')).toBeTruthy();

    (fixture.nativeElement.querySelector('[data-testid="clear-all"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    await fixture.componentInstance['refreshHistory']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toMatch(/\b77\b/);
  });

  it('returns to Fly from Expeditions', () => {
    const shell = TestBed.inject(AppShellService);
    shell.showExpeditions();
    const fixture = TestBed.createComponent(ExpeditionsHubComponent);
    fixture.detectChanges();
    fixture.componentInstance['backToFly']();
    expect(shell.view()).toBe('fly');
  });
});
