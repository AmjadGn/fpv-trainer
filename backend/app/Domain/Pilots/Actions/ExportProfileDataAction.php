<?php

namespace App\Domain\Pilots\Actions;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;

/**
 * Builds a full export of a pilot's data (GDPR-style data portability).
 * Replay blobs are intentionally excluded from the export payload to keep
 * it small; splits/summary metrics are included instead.
 */
class ExportProfileDataAction
{
    public function execute(User $user): array
    {
        $user->loadMissing(['pilotProfile', 'playerProgress', 'trainingProgress', 'achievements']);

        $runs = RaceRun::query()
            ->where('user_id', $user->id)
            ->with('splits')
            ->orderByDesc('submitted_at')
            ->limit(500)
            ->get();

        return [
            'exportedAt' => now()->toIso8601String(),
            'account' => [
                'id' => $user->id,
                'username' => $user->username,
                'displayName' => $user->display_name,
                'email' => $user->email,
                'countryCode' => $user->country_code,
                'competitiveStatus' => $user->competitive_status,
                'createdAt' => optional($user->created_at)->toIso8601String(),
                'acceptedTermsAt' => optional($user->accepted_terms_at)->toIso8601String(),
            ],
            'profile' => $user->pilotProfile ? [
                'bio' => $user->pilotProfile->bio,
                'avatarUrl' => $user->pilotProfile->avatar_url,
                'homeEnvironmentId' => $user->pilotProfile->home_environment_id,
                'isPublic' => $user->pilotProfile->is_public,
            ] : null,
            'progress' => $user->playerProgress?->toApiArray(),
            'trainingProgress' => $user->trainingProgress->map(fn ($record) => $record->toApiArray())->values()->all(),
            'achievements' => $user->achievements->map(fn ($achievement) => [
                'achievementId' => $achievement->achievement_id,
                'unlockedAt' => optional($achievement->unlocked_at)->toIso8601String(),
                'source' => $achievement->source,
            ])->values()->all(),
            'raceRuns' => $runs->map(fn (RaceRun $run) => [
                'id' => $run->id,
                'courseId' => $run->course_id,
                'environmentId' => $run->environment_id,
                'weatherPresetId' => $run->weather_preset_id,
                'durationMs' => $run->duration_ms,
                'status' => $run->status,
                'completed' => $run->completed,
                'crashed' => $run->crashed,
                'submittedAt' => optional($run->submitted_at)->toIso8601String(),
                'splits' => $run->splits->map(fn ($split) => [
                    'gateIndex' => $split->gate_index,
                    'timeMs' => $split->time_ms,
                ])->values()->all(),
            ])->values()->all(),
        ];
    }
}
