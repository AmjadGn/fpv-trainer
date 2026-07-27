import { TestBed } from '@angular/core/testing';

import { AppShellService } from '../../core/shell/app-shell.service';
import { ExpeditionsHubComponent } from './expeditions-hub.component';
import { ExpeditionMissionCatalog } from '../../core/mission/services/expedition-mission-catalog.service';
import { AircraftCatalogService } from '../../core/aircraft/services/aircraft-catalog.service';
import { SelectedAircraftService } from '../../core/aircraft/services/selected-aircraft.service';
import { MissionAircraftCapabilitiesAdapter } from '../../core/mission/adapters/mission-aircraft-capabilities.adapter';
import { MISSION_ID_COASTAL_RUINS_SURVEY } from '../../content/locations/mediterranean-expedition-region';

describe('ExpeditionsHubComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExpeditionsHubComponent],
      providers: [
        AppShellService,
        ExpeditionMissionCatalog,
        AircraftCatalogService,
        SelectedAircraftService,
        MissionAircraftCapabilitiesAdapter,
      ],
    });
  });

  it('lists Coastal Ruins Survey with capture scoring but no persisted records', () => {
    const fixture = TestBed.createComponent(ExpeditionsHubComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/Coastal Ruins Survey/i);
    expect(text).not.toMatch(/best score|medal/i);

    const catalog = TestBed.inject(ExpeditionMissionCatalog);
    expect(catalog.get(MISSION_ID_COASTAL_RUINS_SURVEY)?.summary.captureScoringEnabled).toBe(
      true,
    );
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
