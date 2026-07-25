import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { NetworkStatusService } from '../../network/network-status.service';
import { RaceApiService } from './race-api.service';
import { PendingSubmissionQueueService } from './pending-submission-queue.service';
import { RaceSubmission } from '../models/race-submission.model';

describe('PendingSubmissionQueueService', () => {
  const network = { online: () => true, pendingSubmissions: { set: vi.fn() } };
  const races = { submit: vi.fn() };
  const payload = { submissionId: 'submission', sessionId: 'session' } as RaceSubmission;
  beforeEach(() => { localStorage.clear(); races.submit.mockReset(); TestBed.configureTestingModule({ providers: [PendingSubmissionQueueService, { provide: NetworkStatusService, useValue: network }, { provide: RaceApiService, useValue: races }] }); });
  it('drops permanent client errors instead of retrying them', () => {
    races.submit.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422 })));
    const service = TestBed.inject(PendingSubmissionQueueService); service.enqueue(payload);
    service.flush().subscribe();
    expect(service.count()).toBe(0);
  });
});
