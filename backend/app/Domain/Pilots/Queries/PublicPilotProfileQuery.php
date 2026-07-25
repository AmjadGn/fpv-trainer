<?php

namespace App\Domain\Pilots\Queries;

use App\Models\User;
use App\Support\ApiException;

class PublicPilotProfileQuery
{
    public function execute(string $username): array
    {
        $user = User::where('username', strtolower($username))
            ->with(['pilotProfile', 'playerProgress'])
            ->first();

        if (!$user || !$user->pilotProfile?->is_public) {
            throw ApiException::notFound('Pilot not found.');
        }

        return [
            'username' => $user->username,
            'displayName' => $user->display_name,
            'countryCode' => $user->country_code,
            'bio' => $user->pilotProfile->bio,
            'avatarUrl' => $user->pilotProfile->avatar_url,
            'homeEnvironmentId' => $user->pilotProfile->home_environment_id,
            'memberSince' => optional($user->created_at)->toIso8601String(),
            'progress' => $user->playerProgress ? [
                'level' => $user->playerProgress->level,
                'goldMedals' => $user->playerProgress->gold_medals,
                'silverMedals' => $user->playerProgress->silver_medals,
                'bronzeMedals' => $user->playerProgress->bronze_medals,
                'completedRaces' => $user->playerProgress->completed_races,
            ] : null,
        ];
    }
}
