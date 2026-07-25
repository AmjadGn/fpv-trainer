<?php

namespace App\Domain\Achievements\Services;

use App\Domain\Achievements\Models\UserAchievement;
use App\Models\User;

/**
 * Server-awarded achievements only (catalog entries with serverAwarded:
 * true, e.g. "verified-racer", "weekly-champion"). Client-tracked
 * achievements are unioned in during ProgressMergeService instead.
 */
class AchievementAwardService
{
    public function award(User $user, string $achievementId): bool
    {
        $achievement = UserAchievement::firstOrCreate(
            ['user_id' => $user->id, 'achievement_id' => $achievementId],
            ['unlocked_at' => now(), 'source' => 'server'],
        );

        return $achievement->wasRecentlyCreated;
    }

    public function hasUnlocked(User $user, string $achievementId): bool
    {
        return UserAchievement::where('user_id', $user->id)
            ->where('achievement_id', $achievementId)
            ->exists();
    }
}
