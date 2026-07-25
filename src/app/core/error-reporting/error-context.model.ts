export interface ErrorReportContext {
  route: string | null;
  appVersion: string;
  buildId: string;
  releaseChannel: string;
  aircraftId: string | null;
  environmentId: string | null;
  mode: string | null;
  graphicsPreset: string | null;
  browserSummary: string;
  lastProductEvent: string | null;
  diagnosticId: string;
}

export interface ErrorReportPayload {
  message: string;
  name: string;
  stack?: string;
  source: 'angular' | 'promise' | 'manual' | 'physics' | 'asset' | 'webgl' | 'api';
  context: ErrorReportContext;
  timestamp: string;
}
