<?php

namespace App\Jobs;

use App\Domain\Achievements\Services\AchievementAwardService;
use App\Domain\AntiCheat\Services\RunVerificationService;
use App\Domain\Integrity\Services\ReviewQueueService;
use App\Domain\Observability\Services\MetricsService;
use App\Domain\Races\Events\RankedRunAccepted;
use App\Domain\Races\Models\RaceRun;
use App\Domain\Replays\Services\ReplayStorageService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Runs RunVerificationService against a persisted (pending) RaceRun and
 * finalizes its status. Only the run id crosses the queue boundary — the
 * job re-loads the run + splits + replay from the database, so this works
 * identically whether QUEUE_CONNECTION is `sync` (default; runs inline
 * within the HTTP request) or a real queue (`database`/`redis`) with a
 * worker process.
 */
class VerifyRaceRunJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly int $raceRunId)
    {
    }

    public function handle(
        RunVerificationService $verifier,
        ReplayStorageService $replays,
        AchievementAwardService $achievements,
        ReviewQueueService $reviewQueue,
        MetricsService $metrics,
    ): void {
        $run = RaceRun::with(['splits', 'raceSession', 'replay'])->find($this->raceRunId);

        if (!$run || $run->status !== RaceRun::STATUS_PENDING) {
            return;
        }

        $session = $run->raceSession;

        if (!$session) {
            $run->update(['status' => RaceRun::STATUS_REJECTED, 'verification_notes' => ['session_missing'], 'verified_at' => now()]);

            return;
        }

        $replayPayload = $run->replay ? $replays->retrieve($run->replay) : null;
        $result = $verifier->verify($session, $run, $replayPayload);

        $run->update([
            'status' => $result->status,
            'suspicion_score' => $result->suspicionScore,
            'verification_notes' => $result->notes,
            'verified_at' => now(),
        ]);

        if ($run->isAccepted()) {
            if ($run->replay) {
                $run->replay->update(['purge_after' => null]);
            }

            UpdateLeaderboardJob::dispatch($run->id);

            $isFirstAccepted = RaceRun::where('user_id', $run->user_id)
                ->where('status', RaceRun::STATUS_ACCEPTED)
                ->where('id', '!=', $run->id)
                ->doesntExist();

            if ($isFirstAccepted) {
                $achievements->award($run->user, 'verified-racer');
            }

            event(new RankedRunAccepted($run->refresh()));
            $metrics->increment('race_runs_accepted');
        } elseif (in_array($run->status, [RaceRun::STATUS_SUSPICIOUS, RaceRun::STATUS_MANUAL_REVIEW], true)) {
            $reviewQueue->enqueue($run, $run->status);
            $metrics->increment('race_runs_flagged');
        }
    }
}
