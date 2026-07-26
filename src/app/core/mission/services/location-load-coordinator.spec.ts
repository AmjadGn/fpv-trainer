import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import {
  NullLocationAssetLoadPort,
  NullLocationDefinitionSource,
  NullLocationRuntimeInstallPort,
} from '../adapters/null-location.adapters';
import { BundledLocationDefinitionSource } from '../adapters/bundled-location-definition-source';
import { BundledLocationAssetLoadAdapter } from '../adapters/bundled-location-asset-load.adapter';
import {
  LOCATION_ASSET_LOAD,
  LOCATION_DEFINITION_SOURCE,
  LOCATION_RUNTIME_INSTALL,
} from '../ports/location-definition-source.port';
import { LocationLoadCoordinator } from './location-load-coordinator.service';
import { MissionSessionFacade } from './mission-session.facade';
import { MEDITERRANEAN_LOCATION_ID } from '../../../content/locations/mediterranean-expedition-region';
import { CuratedLocationRegistry } from '../adapters/curated-location-registry';

describe('LocationLoadCoordinator lifecycle', () => {
  it('fails for unavailable package via null source', async () => {
    TestBed.configureTestingModule({
      providers: [
        MissionSessionFacade,
        LocationLoadCoordinator,
        NullLocationDefinitionSource,
        NullLocationAssetLoadPort,
        NullLocationRuntimeInstallPort,
        { provide: LOCATION_DEFINITION_SOURCE, useExisting: NullLocationDefinitionSource },
        { provide: LOCATION_ASSET_LOAD, useExisting: NullLocationAssetLoadPort },
        { provide: LOCATION_RUNTIME_INSTALL, useExisting: NullLocationRuntimeInstallPort },
      ],
    });
    const coordinator = TestBed.inject(LocationLoadCoordinator);
    const result = await coordinator.load('missing-location');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('LOCATION_PACKAGE_NOT_FOUND');
    }
  });

  it('loads Mediterranean package through bundled source when install succeeds', async () => {
    const install = {
      install: vi.fn(async (handleId: string, locationId: string) => ({
        ok: true as const,
        handle: {
          handleId,
          locationId,
          locationGeneration: 1,
          installed: true,
        },
      })),
      unload: vi.fn(async () => undefined),
      currentGeneration: () => 1,
    };

    TestBed.configureTestingModule({
      providers: [
        MissionSessionFacade,
        LocationLoadCoordinator,
        CuratedLocationRegistry,
        BundledLocationDefinitionSource,
        BundledLocationAssetLoadAdapter,
        { provide: LOCATION_DEFINITION_SOURCE, useExisting: BundledLocationDefinitionSource },
        { provide: LOCATION_ASSET_LOAD, useExisting: BundledLocationAssetLoadAdapter },
        { provide: LOCATION_RUNTIME_INSTALL, useValue: install },
      ],
    });

    const coordinator = TestBed.inject(LocationLoadCoordinator);
    const facade = TestBed.inject(MissionSessionFacade);
    const result = await coordinator.load(MEDITERRANEAN_LOCATION_ID);
    expect(result.ok).toBe(true);
    expect(install.install).toHaveBeenCalled();
    expect(facade.snapshot().locationProgress?.stage).toBe('ready');

    await coordinator.unload();
    expect(install.unload).toHaveBeenCalled();
    expect(facade.snapshot().locationProgress?.stage).toBe('unloaded');
  });

  it('marks progress cancelled when cancel is invoked', async () => {
    TestBed.configureTestingModule({
      providers: [
        MissionSessionFacade,
        LocationLoadCoordinator,
        CuratedLocationRegistry,
        BundledLocationDefinitionSource,
        BundledLocationAssetLoadAdapter,
        { provide: LOCATION_DEFINITION_SOURCE, useExisting: BundledLocationDefinitionSource },
        { provide: LOCATION_ASSET_LOAD, useExisting: BundledLocationAssetLoadAdapter },
        {
          provide: LOCATION_RUNTIME_INSTALL,
          useValue: {
            install: vi.fn(async () => ({
              ok: true,
              handle: {
                handleId: 'h',
                locationId: MEDITERRANEAN_LOCATION_ID,
                locationGeneration: 1,
                installed: true,
              },
            })),
            unload: vi.fn(async () => undefined),
            currentGeneration: () => 1,
          },
        },
      ],
    });

    const coordinator = TestBed.inject(LocationLoadCoordinator);
    const facade = TestBed.inject(MissionSessionFacade);
    coordinator.cancel();
    expect(facade.snapshot().locationProgress?.stage).toBe('cancelled');
  });
});
