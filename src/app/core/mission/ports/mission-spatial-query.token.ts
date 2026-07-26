import { InjectionToken } from '@angular/core';

import type { MissionSpatialQueryPort } from './mission-spatial-query.port';

export const MISSION_SPATIAL_QUERY = new InjectionToken<MissionSpatialQueryPort>(
  'MISSION_SPATIAL_QUERY',
);
