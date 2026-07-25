import { Injectable, signal } from '@angular/core';

export type RaceEventName = 'countdownStarted' | 'runStarted' | 'gatePassed' | 'runFinished' | 'runAborted';
export interface RaceEvent { name: RaceEventName; at: number; data?: Record<string, unknown>; }

@Injectable({ providedIn: 'root' })
export class EventTraceService {
  readonly events = signal<RaceEvent[]>([]);
  start(): void { this.events.set([]); }
  record(name: RaceEventName, data?: Record<string, unknown>): void {
    this.events.update((events) => [...events, { name, at: performance.now(), data }]);
  }
}
