import { inject, Injectable } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import {
  CLIENT_BUILD_VERSION,
  COLLIDER_MANIFEST_VERSION,
  COLLISION_MODEL_VERSION,
  DRONE_COLLIDER_VERSION,
  ENVIRONMENT_ART_VERSION,
  PHYSICS_ENGINE_VERSION,
  PHYSICS_VERSION,
  REPLAY_VERSION,
  SUBMISSION_VERSION,
} from '../models/version.constants';
import { PendingSubmissionQueueService } from './pending-submission-queue.service';
import { RaceApiService } from './race-api.service';
import { EventTraceService } from './event-trace.service';
import { RaceRun, RaceSession, RaceSubmission } from '../models/race-submission.model';

@Injectable({ providedIn: 'root' })
export class RankedRaceService {
  private readonly api = inject(RaceApiService);
  private readonly queue = inject(PendingSubmissionQueueService);
  private readonly trace = inject(EventTraceService);

  startSession(courseId: string, weatherPresetId: string): Observable<RaceSession> {
    this.trace.start();
    return this.api.startSession({
      courseId,
      weatherPresetId,
      clientBuildVersion: CLIENT_BUILD_VERSION,
      physicsVersion: PHYSICS_VERSION,
    });
  }

  buildSubmissionPayload(
    session: RaceSession,
    result: Pick<RaceSubmission['run'], 'durationMs' | 'completed' | 'crashed' | 'splits' | 'replay'>,
    submissionId: string = crypto.randomUUID(),
  ): RaceSubmission {
    return {
      submissionVersion: SUBMISSION_VERSION,
      submissionId,
      sessionId: session.id,
      course: { id: session.courseId, version: 1 },
      environment: { id: session.environmentId, version: 1 },
      weather: { id: session.weatherPresetId, version: 1 },
      client: {
        buildVersion: CLIENT_BUILD_VERSION,
        physicsVersion: PHYSICS_VERSION,
        replayVersion: REPLAY_VERSION,
        collisionModelVersion: COLLISION_MODEL_VERSION,
        colliderManifestVersion: COLLIDER_MANIFEST_VERSION,
        droneColliderVersion: DRONE_COLLIDER_VERSION,
        environmentArtVersion: ENVIRONMENT_ART_VERSION,
        physicsEngineVersion: PHYSICS_ENGINE_VERSION,
      },
      run: result,
      integrity: { sessionNonce: session.nonce, events: this.trace.events() },
    };
  }

  queueOrSubmit(payload: RaceSubmission): Observable<RaceRun | null> {
    return this.api.submit(payload).pipe(
      catchError(() => {
        this.queue.enqueue(payload);
        return of(null);
      }),
    );
  }
}
