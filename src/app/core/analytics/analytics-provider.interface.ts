import type { AnalyticsContext } from './analytics-context';
import type { AnalyticsEventName } from './analytics-events';

export interface AnalyticsProvider {
  readonly id: string;
  track(
    event: AnalyticsEventName | string,
    properties: Record<string, unknown>,
    context: AnalyticsContext,
  ): void;
}
