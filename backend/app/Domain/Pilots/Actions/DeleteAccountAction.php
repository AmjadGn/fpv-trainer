<?php

namespace App\Domain\Pilots\Actions;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Anonymizes and soft-deletes an account. Competitive history (race_runs,
 * leaderboard_entries) is intentionally kept intact for leaderboard/anti-
 * cheat integrity — only personally identifying fields are scrubbed.
 */
class DeleteAccountAction
{
    public function execute(User $user): void
    {
        DB::transaction(function () use ($user) {
            $anonymizedId = Str::lower(Str::random(10));

            $user->tokens()->delete();

            $user->forceFill([
                'username' => "deleted-{$user->id}-{$anonymizedId}",
                'display_name' => 'Deleted Pilot',
                'name' => 'Deleted Pilot',
                'email' => "deleted-{$user->id}-{$anonymizedId}@fpv-trainer.invalid",
                'password' => Str::random(40),
                'country_code' => null,
            ])->save();

            if ($user->pilotProfile) {
                $user->pilotProfile->update([
                    'bio' => null,
                    'avatar_url' => null,
                    'is_public' => false,
                ]);
            }

            $user->delete();
        });
    }
}
