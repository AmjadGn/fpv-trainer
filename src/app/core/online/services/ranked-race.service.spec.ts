import { TestBed } from '@angular/core/testing';
import { RankedRaceService } from './ranked-race.service';
import { RaceApiService } from './race-api.service';
import { PendingSubmissionQueueService } from './pending-submission-queue.service';
import { EventTraceService } from './event-trace.service';

describe('RankedRaceService', () => {
  it('builds the Laravel submission-v1 nesting', () => {
    TestBed.configureTestingModule({ providers: [RankedRaceService, { provide: RaceApiService, useValue: {} }, { provide: PendingSubmissionQueueService, useValue: {} }, { provide: EventTraceService, useValue: { events: () => [] } }] });
    const payload = TestBed.inject(RankedRaceService).buildSubmissionPayload(
      { id: 's', courseId: 'starter-circuit', environmentId: 'alpine-training-valley', weatherPresetId: 'calm', nonce: 'n', rulesVersion: 1, expiresAt: 'later' },
      { durationMs: 42_000, completed: true, crashed: false, splits: [] },
      'submission-id',
    );
    expect(payload).toMatchObject({ submissionId: 'submission-id', sessionId: 's', course: { id: 'starter-circuit' }, integrity: { sessionNonce: 'n' } });
  });
});
