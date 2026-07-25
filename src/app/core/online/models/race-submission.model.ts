export interface RaceSession {
  id: string;
  courseId: string;
  environmentId: string;
  weatherPresetId: string;
  nonce: string;
  rulesVersion: number;
  expiresAt: string;
}

export interface RaceSubmission {
  submissionVersion: number;
  submissionId: string;
  sessionId: string;
  course: { id: string; version: number };
  environment: { id: string; version: number };
  weather: { id: string; version: number };
  client: {
    buildVersion?: string;
    physicsVersion: string;
    replayVersion: number;
    collisionModelVersion?: string;
    colliderManifestVersion?: string;
    droneColliderVersion?: string;
    environmentArtVersion?: string;
    physicsEngineVersion?: string;
  };
  run: {
    durationMs: number;
    completed: boolean;
    crashed: boolean;
    splits: Array<{ gateIndex: number; timeMs: number }>;
    replay?: { metadata?: Record<string, unknown>; frames?: unknown[] };
  };
  integrity: { sessionNonce: string; clientDigest?: string; events?: unknown[] };
}

export interface RaceRun {
  id: string;
  submissionId: string;
  status: string;
  verified: boolean;
  publicId?: string;
}
