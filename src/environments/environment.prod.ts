export type ReleaseChannel = 'development' | 'internal' | 'alpha' | 'beta' | 'production';

export const environment = {
  production: true,
  releaseChannel: 'alpha' as ReleaseChannel,
  appVersion: '1.0.0-alpha.1',
  buildId: 'alpha-build',
  // Override at deploy time (reverse proxy / CDN rewrite recommended).
  apiBaseUrl: 'https://api.fpv-trainer.example/api/v1',
  appPublicUrl: 'https://fpv-trainer.example',
  shareUrl: 'https://fpv-trainer.example',
  analyticsEnabled: true,
  errorReportingEnabled: true,
  diagnosticsVisible: false,
  feedbackProminent: true,
  guestModeDefault: true,
  alphaAccessRequired: false,
} as const;
