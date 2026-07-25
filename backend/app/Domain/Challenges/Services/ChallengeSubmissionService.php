<?php

namespace App\Domain\Challenges\Services;

use App\Domain\Challenges\Models\ChallengeInstance;
use App\Domain\Challenges\Models\ChallengeResult;
use App\Domain\Races\Models\RaceRun;
use App\Domain\Races\Models\RaceSession;
use App\Domain\Races\Services\RaceSessionService;
use App\Domain\Races\Services\RaceSubmissionService;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ChallengeSubmissionService
{
    public function __construct(
        private readonly RaceSessionService $sessions,
        private readonly RaceSubmissionService $submissions,
    ) {
    }

    public function createSession(User $user, ChallengeInstance $instance, ?string $ip = null): RaceSession
    {
        $definition = $instance->definition;

        return $this->sessions->create($user, [
            'courseId' => $definition->course_id,
            'weatherPresetId' => $definition->weather_preset_id,
            'contextType' => 'challenge',
            'contextId' => $instance->id,
            'contextMetadata' => ['challenge_instance_id' => $instance->id],
        ], $ip);
    }

    public function submit(User $user, ChallengeInstance $instance, array $payload): RaceRun
    {
        $run = $this->submissions->submit($user, $payload);

        return $run;
    }

    public function recordResult(ChallengeInstance $instance, RaceRun $run): void
    {
        DB::transaction(function () use ($instance, $run) {
            $existing = ChallengeResult::where('challenge_instance_id', $instance->id)
                ->where('user_id', $run->user_id)
                ->first();

            if ($existing && $existing->best_duration_ms <= $run->duration_ms) {
                return;
            }

            $medal = $this->resolveMedal($instance, $run->duration_ms);
            $xp = $instance->definition->xp_reward ?? 0;

            ChallengeResult::updateOrCreate(
                ['challenge_instance_id' => $instance->id, 'user_id' => $run->user_id],
                [
                    'race_run_id' => $run->id,
                    'best_duration_ms' => $run->duration_ms,
                    'medal' => $medal,
                    'xp_awarded' => $xp,
                ],
            );
        });
    }

    private function resolveMedal(ChallengeInstance $instance, int $durationMs): ?string
    {
        $thresholds = $instance->definition->medal_thresholds_ms ?? [];

        if (isset($thresholds['gold']) && $durationMs <= $thresholds['gold']) {
            return 'gold';
        }

        if (isset($thresholds['silver']) && $durationMs <= $thresholds['silver']) {
            return 'silver';
        }

        if (isset($thresholds['bronze']) && $durationMs <= $thresholds['bronze']) {
            return 'bronze';
        }

        return null;
    }
}
