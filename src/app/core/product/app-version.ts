import { environment } from '../../../environments/environment';
import {
  CATALOG_VERSION,
  CLIENT_BUILD_VERSION,
  PHYSICS_VERSION,
  REPLAY_VERSION,
} from '../online/models/version.constants';

export interface AppVersionInfo {
  appVersion: string;
  buildId: string;
  releaseChannel: string;
  clientBuildVersion: string;
  physicsVersion: string;
  replayFormatVersion: number;
  aircraftCatalogVersion: number;
}

export function getAppVersionInfo(): AppVersionInfo {
  return {
    appVersion: environment.appVersion,
    buildId: environment.buildId,
    releaseChannel: environment.releaseChannel,
    clientBuildVersion: CLIENT_BUILD_VERSION,
    physicsVersion: PHYSICS_VERSION,
    replayFormatVersion: REPLAY_VERSION,
    aircraftCatalogVersion: CATALOG_VERSION,
  };
}

export function formatAppVersionLabel(): string {
  const v = getAppVersionInfo();
  return `${v.appVersion} (${v.releaseChannel} · ${v.buildId})`;
}
