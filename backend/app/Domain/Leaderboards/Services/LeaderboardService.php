<?php

namespace App\Domain\Leaderboards\Services;

use App\Domain\Leaderboards\Models\LeaderboardEntry;
use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * Maintains one "best accepted run" leaderboard entry per user per course
 * (the "overall" board — weather_preset_id is stored as an empty string).
 * Only ever called with runs whose status is already `accepted`.
 */
class LeaderboardService
{
    public function recordAcceptedRun(RaceRun $run): void
    {
        if (!$run->isAccepted()) {
            return;
        }

        $existing = LeaderboardEntry::where('user_id', $run->user_id)
            ->where('course_id', $run->course_id)
            ->where('weather_preset_id', '')
            ->first();

        if ($existing && $existing->best_duration_ms <= $run->duration_ms) {
            // Slower (or equal) run never replaces a faster verified time.
            return;
        }

        LeaderboardEntry::updateOrCreate(
            ['user_id' => $run->user_id, 'course_id' => $run->course_id, 'weather_preset_id' => ''],
            ['race_run_id' => $run->id, 'best_duration_ms' => $run->duration_ms, 'rules_version' => $run->course_version],
        );
    }

    /**
     * Deterministic order: fastest time first, tie-broken by earliest entry
     * (i.e. whoever set the time first keeps the higher rank).
     */
    public function forCourse(string $courseId, int $perPage = 25, int $page = 1): LengthAwarePaginator
    {
        $query = LeaderboardEntry::where('course_id', $courseId)
            ->where('weather_preset_id', '')
            ->with(['user:id,username,display_name,country_code'])
            ->orderBy('best_duration_ms')
            ->orderBy('id');

        return $query->paginate($perPage, ['*'], 'page', $page);
    }

    /**
     * Returns a window of entries centered on the given user's rank
     * ("around me"), or the top of the board if the user has no entry.
     */
    public function aroundUser(string $courseId, User $user, int $windowSize = 5): Collection
    {
        $ordered = LeaderboardEntry::where('course_id', $courseId)
            ->where('weather_preset_id', '')
            ->with(['user:id,username,display_name,country_code'])
            ->orderBy('best_duration_ms')
            ->orderBy('id')
            ->get();

        $userIndex = $ordered->search(fn (LeaderboardEntry $entry) => (int) $entry->user_id === (int) $user->id);

        if ($userIndex === false) {
            return $ordered->take($windowSize * 2 + 1)->values();
        }

        $start = max(0, $userIndex - $windowSize);
        $length = $windowSize * 2 + 1;

        return $ordered->slice($start, $length)->values();
    }

    public function rankFor(LeaderboardEntry $entry): int
    {
        return LeaderboardEntry::where('course_id', $entry->course_id)
            ->where('weather_preset_id', $entry->weather_preset_id)
            ->where(function ($query) use ($entry) {
                $query->where('best_duration_ms', '<', $entry->best_duration_ms)
                    ->orWhere(function ($inner) use ($entry) {
                        $inner->where('best_duration_ms', $entry->best_duration_ms)
                            ->where('id', '<', $entry->id);
                    });
            })
            ->count() + 1;
    }

    public static function serializeEntry(LeaderboardEntry $entry, int $rank): array
    {
        return [
            'rank' => $rank,
            'userId' => $entry->user_id,
            'username' => $entry->user?->username,
            'displayName' => $entry->user?->display_name,
            'countryCode' => $entry->user?->country_code,
            'courseId' => $entry->course_id,
            'bestDurationMs' => $entry->best_duration_ms,
            'rulesVersion' => $entry->rules_version,
        ];
    }
}
