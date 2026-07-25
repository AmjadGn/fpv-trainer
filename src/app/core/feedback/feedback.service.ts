import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { createDiagnosticId } from '../product/diagnostic-id';
import { getAppVersionInfo } from '../product/app-version';
import { FrameTimeMonitorService } from '../performance/frame-time-monitor.service';
import {
  FEEDBACK_DRAFT_KEY,
  FEEDBACK_QUEUE_KEY,
  type FeedbackDraft,
  type FeedbackSubmission,
} from './feedback.models';

const EMPTY_DRAFT: FeedbackDraft = {
  version: 1,
  category: 'bug',
  title: '',
  description: '',
  severity: 'medium',
  email: '',
  includeDiagnostics: false,
  route: null,
  aircraftId: null,
  environmentId: null,
  updatedAt: new Date(0).toISOString(),
};

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly frameMonitor = inject(FrameTimeMonitorService);
  readonly draft = signal<FeedbackDraft>(this.readDraft());
  readonly lastStatus = signal<'idle' | 'submitting' | 'submitted' | 'failed'>('idle');
  readonly lastDiagnosticId = signal<string | null>(null);

  updateDraft(partial: Partial<FeedbackDraft>): void {
    const next = {
      ...this.draft(),
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.draft.set(next);
    this.persistDraft(next);
  }

  clearDraft(): void {
    this.draft.set({ ...EMPTY_DRAFT, updatedAt: new Date().toISOString() });
    try {
      localStorage.removeItem(FEEDBACK_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  async submit(): Promise<FeedbackSubmission> {
    this.lastStatus.set('submitting');
    const draft = this.draft();
    const diagnosticId = draft.includeDiagnostics
      ? createDiagnosticId(`feedback-${Date.now()}`)
      : null;
    this.lastDiagnosticId.set(diagnosticId);

    const submission: FeedbackSubmission = {
      ...draft,
      id: createDiagnosticId(`fb-${Date.now()}`),
      diagnosticId,
      appVersion: getAppVersionInfo().appVersion,
      browserSummary:
        typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : 'ssr',
      performanceSnapshot: draft.includeDiagnostics
        ? { ...this.frameMonitor.snapshot() }
        : null,
      submittedAt: new Date().toISOString(),
      status: 'queued',
    };

    try {
      this.enqueue(submission);
      // Alpha: no remote endpoint required — queue locally and mark submitted.
      submission.status = 'submitted';
      this.lastStatus.set('submitted');
      this.clearDraft();
      if (!environment.production) {
        console.info('[FPV feedback]', submission);
      }
      return submission;
    } catch {
      submission.status = 'failed';
      this.enqueue(submission);
      this.lastStatus.set('failed');
      return submission;
    }
  }

  private enqueue(item: FeedbackSubmission): void {
    try {
      const raw = localStorage.getItem(FEEDBACK_QUEUE_KEY);
      const queue = raw ? (JSON.parse(raw) as FeedbackSubmission[]) : [];
      queue.push(item);
      localStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(queue.slice(-50)));
    } catch {
      /* ignore */
    }
  }

  private persistDraft(draft: FeedbackDraft): void {
    try {
      localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }

  private readDraft(): FeedbackDraft {
    try {
      const raw = localStorage.getItem(FEEDBACK_DRAFT_KEY);
      if (!raw) return { ...EMPTY_DRAFT };
      return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as FeedbackDraft) };
    } catch {
      return { ...EMPTY_DRAFT };
    }
  }
}
