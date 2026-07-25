<?php

namespace App\Domain\Sharing\Services;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Replays\Services\ReplayStorageService;
use App\Domain\Sharing\Models\PublicResultShare;
use App\Models\User;
use App\Support\ApiException;
use Illuminate\Support\Str;

class ShareService
{
    public function __construct(private readonly ReplayStorageService $replays)
    {
    }

    public function shareRun(User $user, int $runId, string $visibility = PublicResultShare::VISIBILITY_UNLISTED, ?string $title = null): PublicResultShare
    {
        $run = RaceRun::where('id', $runId)->where('user_id', $user->id)->first();

        if (!$run) {
            throw ApiException::notFound('Race run not found.');
        }

        if (!$run->isAccepted()) {
            throw ApiException::make('run_not_shareable', 'Only accepted runs can be shared publicly.', 422);
        }

        return PublicResultShare::updateOrCreate(
            ['race_run_id' => $run->id],
            [
                'public_id' => optional($run->publicShare)->public_id ?? (string) Str::uuid(),
                'user_id' => $user->id,
                'visibility' => $visibility,
                'title' => $title,
            ],
        );
    }

    public function updateVisibility(User $user, int $runId, string $visibility): PublicResultShare
    {
        $share = PublicResultShare::where('race_run_id', $runId)->where('user_id', $user->id)->first();

        if (!$share) {
            throw ApiException::notFound('Share not found for this run.');
        }

        $share->update(['visibility' => $visibility]);

        return $share;
    }

    public function findPublicResult(string $publicId): array
    {
        $share = PublicResultShare::where('public_id', $publicId)->with(['raceRun.user', 'raceRun.splits'])->first();

        if (!$share || !$share->isViewableByPublic()) {
            throw ApiException::notFound('Shared result not found.');
        }

        $share->increment('view_count');
        $run = $share->raceRun;

        return [
            'publicId' => $share->public_id,
            'title' => $share->title,
            'visibility' => $share->visibility,
            'pilot' => [
                'username' => $run->user->username,
                'displayName' => $run->user->display_name,
            ],
            'run' => [
                'courseId' => $run->course_id,
                'environmentId' => $run->environment_id,
                'weatherPresetId' => $run->weather_preset_id,
                'durationMs' => $run->duration_ms,
                'completed' => $run->completed,
                'submittedAt' => optional($run->submitted_at)->toIso8601String(),
                'splits' => $run->splits->map(fn ($split) => [
                    'gateIndex' => $split->gate_index,
                    'timeMs' => $split->time_ms,
                ])->values()->all(),
            ],
            'viewCount' => $share->view_count,
        ];
    }

    public function findPublicReplay(string $publicId): array
    {
        $share = PublicResultShare::where('public_id', $publicId)->with('raceRun.replay')->first();

        if (!$share || !$share->isViewableByPublic()) {
            throw ApiException::notFound('Shared replay not found.');
        }

        $replayRecord = $share->raceRun->replay;

        if (!$replayRecord) {
            throw ApiException::notFound('No replay was stored for this run.');
        }

        $payload = $this->replays->retrieve($replayRecord);

        if ($payload === null) {
            throw ApiException::notFound('Replay data is unavailable.');
        }

        return [
            'publicId' => $share->public_id,
            'replayVersion' => $share->raceRun->replay_version,
            'replay' => $payload,
        ];
    }
}
