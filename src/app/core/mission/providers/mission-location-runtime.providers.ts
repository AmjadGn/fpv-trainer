import type { EnvironmentProviders, Provider } from '@angular/core';
import { makeEnvironmentProviders } from '@angular/core';

import { BundledLocationAssetLoadAdapter } from '../adapters/bundled-location-asset-load.adapter';
import { BundledLocationDefinitionSource } from '../adapters/bundled-location-definition-source';
import { CuratedLocationRuntimeInstallAdapter } from '../adapters/curated-location-runtime-install.adapter';
import { RapierMissionSpatialQueryAdapter } from '../adapters/rapier-mission-spatial-query.adapter';
import {
  LOCATION_ASSET_LOAD,
  LOCATION_DEFINITION_SOURCE,
  LOCATION_RUNTIME_INSTALL,
} from '../ports/location-definition-source.port';
import { MISSION_SPATIAL_QUERY } from '../ports/mission-spatial-query.token';

export function provideMissionLocationRuntime(): Provider[] {
  return [
    { provide: LOCATION_DEFINITION_SOURCE, useExisting: BundledLocationDefinitionSource },
    { provide: LOCATION_ASSET_LOAD, useExisting: BundledLocationAssetLoadAdapter },
    { provide: LOCATION_RUNTIME_INSTALL, useExisting: CuratedLocationRuntimeInstallAdapter },
    { provide: MISSION_SPATIAL_QUERY, useExisting: RapierMissionSpatialQueryAdapter },
  ];
}

export function provideMissionLocationRuntimeEnv(): EnvironmentProviders {
  return makeEnvironmentProviders(provideMissionLocationRuntime());
}
