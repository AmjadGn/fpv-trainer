export type ReleaseChannel = 'development' | 'internal' | 'alpha' | 'beta' | 'production';

export const environment = {
  production: true,
  releaseChannel: 'production' as ReleaseChannel,
  appVersion: '1.3.0',
  buildId: 'v1.3.0',
  // API remains optional; Expeditions Preview runs fully client-side.
  apiBaseUrl: 'https://api.fpv-trainer.example/api/v1',
  appPublicUrl: 'https://amjadgn.github.io/fpv-trainer',
  shareUrl: 'https://amjadgn.github.io/fpv-trainer',
  analyticsEnabled: true,
  errorReportingEnabled: true,
  diagnosticsVisible: false,
  feedbackProminent: true,
  guestModeDefault: true,
  alphaAccessRequired: false,
} as const;
