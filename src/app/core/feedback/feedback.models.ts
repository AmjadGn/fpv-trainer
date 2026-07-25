export type FeedbackCategory =
  | 'bug'
  | 'controls'
  | 'performance'
  | 'aircraft-handling'
  | 'visual'
  | 'training'
  | 'feature'
  | 'other';

export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'blocker';

export interface FeedbackDraft {
  version: number;
  category: FeedbackCategory;
  title: string;
  description: string;
  severity: FeedbackSeverity;
  email: string;
  includeDiagnostics: boolean;
  route: string | null;
  aircraftId: string | null;
  environmentId: string | null;
  updatedAt: string;
}

export interface FeedbackSubmission extends FeedbackDraft {
  id: string;
  diagnosticId: string | null;
  appVersion: string;
  browserSummary: string;
  performanceSnapshot: Record<string, unknown> | null;
  submittedAt: string;
  status: 'queued' | 'submitted' | 'failed';
}

export const FEEDBACK_DRAFT_KEY = 'fpv-trainer.feedback-draft.v1';
export const FEEDBACK_QUEUE_KEY = 'fpv-trainer.feedback-queue.v1';
