export type ReleaseChannel = 'development' | 'internal' | 'alpha' | 'beta' | 'production';

export const environment = {
  production: false,
  releaseChannel: 'development' as ReleaseChannel,
  appVersion: '1.3.0',
  buildId: 'dev-local',
  apiBaseUrl: 'http://localhost:8000/api/v1',
  appPublicUrl: 'http://localhost:4200',
  shareUrl: 'http://localhost:4200',
  analyticsEnabled: true,
  errorReportingEnabled: true,
  diagnosticsVisible: true,
  feedbackProminent: true,
  guestModeDefault: true,
  alphaAccessRequired: false,
} as const;
