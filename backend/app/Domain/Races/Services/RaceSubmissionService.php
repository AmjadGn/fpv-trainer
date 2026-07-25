<?php

namespace App\Domain\Races\Services;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Models\RaceSession;
use App\Domain\Replays\Services\ReplayStorageService;
use App\Jobs\VerifyRaceRunJob;
use App\Models\User;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

/**
 * Handles POST /race-submissions. Idempotent per (user_id, submission_id):
 * retrying an identical submissionId always returns the original result
 * instead of re-creating/re-verifying the run.
 *
 * The run is persisted with status `pending` first, then verification is
 * dispatched via VerifyRaceRunJob (see App\Jobs). With the default `sync`
 * queue connection this resolves inline before the HTTP response is sent;
 * swapping to a real queue driver turns this into genuine async
 * processing without any code changes here — callers should treat
 * `pending` as a legitimate terminal-for-now state and poll
 * GET /race-submissions/{submissionId} if it's still pending.
 */
class RaceSubmissionService
{
    public function __construct(
        private readonly RaceSessionService $sessions,
        private readonly ReplayStorageService $replays,
    ) {
    }

    /**
     * @param array<string, mixed> $payload Decoded + validated submission payload.
     */
    public function submit(User $user, array $payload): RaceRun
    {
        $submissionId = (string) $payload['submissionId'];

        $existing = RaceRun::where('user_id', $user->id)
            ->where('submission_id', $submissionId)
            ->first();

        if ($existing) {
            return $existing;
        }

        if ((int) ($payload['submissionVersion'] ?? 0) !== (int) config('fpv.submission_version')) {
            throw ApiException::make('unsupported_submission_version', 'This client version is no longer supported. Please update the app.', 422);
        }

        $session = $this->sessions->findOwned($user, (string) $payload['sessionId']);

        if ($session->status === RaceSession::STATUS_CONSUMED) {
            throw ApiException::conflict('This race session has already been used for a submission.', ['sessionId' => $session->id]);
        }

        if ($session->isExpired()) {
            throw ApiException::make('session_expired', 'This race session has expired. Start a new one before submitting.', 422);
        }

        $run = DB::transaction(function () use ($user, $payload, $session, $submissionId) {
            $run = RaceRun::create([
                'user_id' => $user->id,
                'race_session_id' => $session->id,
                'submission_id' => $submissionId,
                'course_id' => $payload['course']['id'],
                'environment_id' => $payload['environment']['id'],
                'weather_preset_id' => $payload['weather']['id'],
                'course_version' => $payload['course']['version'] ?? 1,
                'environment_version' => $payload['environment']['version'] ?? 1,
                'weather_preset_version' => $payload['weather']['version'] ?? 1,
                'physics_version' => $payload['client']['physicsVersion'] ?? 'unknown',
                'client_build_version' => $payload['client']['buildVersion'] ?? null,
                'replay_version' => $payload['client']['replayVersion'] ?? 1,
                'submission_version' => $payload['submissionVersion'],
                'duration_ms' => (int) $payload['run']['durationMs'],
                'gate_count' => count($payload['run']['splits'] ?? []),
                'completed' => (bool) ($payload['run']['completed'] ?? false),
                'crashed' => (bool) ($payload['run']['crashed'] ?? false),
                'status' => RaceRun::STATUS_PENDING,
                'session_nonce' => $payload['integrity']['sessionNonce'] ?? null,
                'client_digest' => $payload['integrity']['clientDigest'] ?? null,
                'client_metadata' => [
                    'events' => $payload['integrity']['events'] ?? [],
                ],
                'context_type' => $session->context_type,
                'context_id' => $session->context_id,
                'submitted_at' => now(),
            ]);

            foreach ($payload['run']['splits'] ?? [] as $split) {
                $run->splits()->create([
                    'gate_index' => $split['gateIndex'],
                    'time_ms' => $split['timeMs'],
                ]);
            }

            $replayPayload = $payload['run']['replay'] ?? null;

            if (is_array($replayPayload) && !empty($replayPayload)) {
                $this->replays->store($run, $replayPayload);
            }

            $this->sessions->markConsumed($session);

            return $run;
        });

        VerifyRaceRunJob::dispatch($run->id);

        return $run->refresh();
    }
}
