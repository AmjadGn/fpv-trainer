import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CompetitiveCacheService } from '../../cache/services/competitive-cache.service';
import { FeatureFlagService } from './feature-flag.service';

describe('FeatureFlagService', () => {
  it('uses safe local defaults when feature fetch fails', () => {
    TestBed.configureTestingModule({
      providers: [
        FeatureFlagService,
        CompetitiveCacheService,
        { provide: HttpClient, useValue: { get: () => of({}) } },
      ],
    });
    const service = TestBed.inject(FeatureFlagService);

    service.load().subscribe();

    expect(service.maintenanceMode()).toBe(false);
    expect(service.seasonsEnabled()).toBe(true);
    expect(service.ghostEventsEnabled()).toBe(true);
  });
});
