export interface AnalyticsContext {
  anonymousSessionId: string;
  authenticated: boolean;
  appVersion: string;
  buildId: string;
  releaseChannel: string;
  browserFamily: string;
  deviceClass: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  qualityPreset: string;
  aircraftId: string | null;
  environmentId: string | null;
  mode: string | null;
  controlMethod: string | null;
  experienceLevel: string | null;
  performanceCategory: string | null;
  networkOnline: boolean;
}
