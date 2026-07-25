import type { ErrorReportPayload } from './error-context.model';

export interface ErrorReportingProvider {
  readonly id: string;
  report(payload: ErrorReportPayload): void;
}
