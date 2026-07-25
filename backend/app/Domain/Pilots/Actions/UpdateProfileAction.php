<?php

namespace App\Domain\Pilots\Actions;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class UpdateProfileAction
{
    /**
     * @param array{displayName?: string, bio?: ?string, avatarUrl?: ?string, countryCode?: ?string, homeEnvironmentId?: ?string, isPublic?: bool} $data
     */
    public function execute(User $user, array $data): User
    {
        return DB::transaction(function () use ($user, $data) {
            if (array_key_exists('displayName', $data)) {
                $user->display_name = $data['displayName'];
                $user->name = $data['displayName'];
            }

            if (array_key_exists('countryCode', $data)) {
                $user->country_code = $data['countryCode'];
            }

            $user->save();

            $profile = $user->pilotProfile ?? $user->pilotProfile()->create([]);

            $profile->fill([
                'bio' => $data['bio'] ?? $profile->bio,
                'avatar_url' => $data['avatarUrl'] ?? $profile->avatar_url,
                'home_environment_id' => $data['homeEnvironmentId'] ?? $profile->home_environment_id,
                'is_public' => $data['isPublic'] ?? $profile->is_public,
            ])->save();

            return $user->refresh();
        });
    }
}
