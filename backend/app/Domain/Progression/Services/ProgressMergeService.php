<?php

namespace App\Domain\Progression\Services;

use App\Domain\Achievements\Models\UserAchievement;
use App\Domain\Progression\Models\PlayerProgress;
use App\Domain\Progression\Models\ProgressSyncEvent;
use App\Domain\Progression\Models\TrainingProgress;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Reconciles client-tracked progress (local IndexedDB/localStorage state)
 * with the server record. All operations are monotone (max/union) so
 * calling merge()/sync() repeatedly with the same payload is a no-op after
 * the first application — this is what makes the endpoint safe to retry.
 *
 * Client-reported race best times are stored as informational personal
 * bests only; they never touch leaderboard_entries, which is populated
 * exclusively from server-verified race_runs.
 */
class ProgressMergeService
{
    private const MEDAL_RANK = ['none' => 0, 'bronze' => 1, 'silver' => 2, 'gold' => 3];

    public function merge(User $user, array $payload): PlayerProgress
    {
        return $this->apply($user, $payload, 'merge');
    }

    public function sync(User $user, array $payload): PlayerProgress
    {
        return $this->apply($user, $payload, 'sync');
    }

    private function apply(User $user, array $payload, string $eventType): PlayerProgress
    {
        return DB::transaction(function () use ($user, $payload, $eventType) {
            /** @var PlayerProgress $progress */
            $progress = PlayerProgress::firstOrCreate(['user_id' => $user->id]);

            $incoming = $payload['progress'] ?? [];

            // Explicit (int) casts on both sides: PHP's max() treats null and
            // 0 as equal and returns the *first* argument, so max(null, 0)
            // would return null (and violate the NOT NULL columns) rather
            // than 0. Casting null -> 0 up front avoids that footgun.
            $progress->level = max((int) $progress->level, (int) ($incoming['level'] ?? 1));
            $progress->experience_points = max((int) $progress->experience_points, (int) ($incoming['experiencePoints'] ?? 0));
            $progress->gold_medals = max((int) $progress->gold_medals, (int) ($incoming['goldMedals'] ?? 0));
            $progress->silver_medals = max((int) $progress->silver_medals, (int) ($incoming['silverMedals'] ?? 0));
            $progress->bronze_medals = max((int) $progress->bronze_medals, (int) ($incoming['bronzeMedals'] ?? 0));
            $progress->completed_races = max((int) $progress->completed_races, (int) ($incoming['completedRaces'] ?? 0));
            $progress->total_flight_time_ms = max((int) $progress->total_flight_time_ms, (int) ($incoming['totalFlightTimeMs'] ?? 0));
            $progress->gates_completed = max((int) $progress->gates_completed, (int) ($incoming['gatesCompleted'] ?? 0));
            $progress->crashes = max((int) $progress->crashes, (int) ($incoming['crashes'] ?? 0));

            $progress->best_times = $this->mergeBestTimes($progress->best_times ?? [], $incoming['bestTimes'] ?? []);
            $progress->completed_training_modules = array_values(array_unique(array_merge(
                $progress->completed_training_modules ?? [],
                $incoming['completedTrainingModules'] ?? [],
            )));

            $progress->save();

            $this->mergeTrainingProgress($user, $payload['trainingProgress'] ?? []);
            $unlockedCount = $this->mergeAchievements($user, $incoming['achievementsUnlocked'] ?? $payload['achievementsUnlocked'] ?? []);

            ProgressSyncEvent::create([
                'user_id' => $user->id,
                'event_type' => $eventType,
                'payload_hash' => hash('sha256', json_encode($payload)),
                'summary' => [
                    'newAchievementsUnlocked' => $unlockedCount,
                    'trainingModulesMerged' => count($payload['trainingProgress'] ?? []),
                ],
            ]);

            return $progress->refresh();
        });
    }

    /** @param array<string, int> $existing @param array<string, int> $incoming */
    private function mergeBestTimes(array $existing, array $incoming): array
    {
        foreach ($incoming as $courseId => $timeMs) {
            if (!is_numeric($timeMs)) {
                continue;
            }

            if (!isset($existing[$courseId]) || $timeMs < $existing[$courseId]) {
                $existing[$courseId] = (int) $timeMs;
            }
        }

        return $existing;
    }

    /** @param array<int, array<string, mixed>> $incomingModules */
    private function mergeTrainingProgress(User $user, array $incomingModules): void
    {
        foreach ($incomingModules as $incoming) {
            $moduleId = $incoming['moduleId'] ?? null;

            if (!is_string($moduleId)) {
                continue;
            }

            $record = TrainingProgress::firstOrNew(['user_id' => $user->id, 'module_id' => $moduleId]);

            $record->module_version = max($record->module_version ?? 1, (int) ($incoming['moduleVersion'] ?? 1));
            $record->completed = ($record->completed ?? false) || (bool) ($incoming['completed'] ?? false);
            $record->highest_medal = $this->betterMedal($record->highest_medal, $incoming['highestMedal'] ?? null);
            $record->best_score = max($record->best_score ?? 0, (int) ($incoming['bestScore'] ?? 0));

            $incomingDuration = $incoming['bestDurationMs'] ?? null;
            if (is_numeric($incomingDuration)) {
                $record->best_duration_ms = $record->best_duration_ms === null
                    ? (int) $incomingDuration
                    : min($record->best_duration_ms, (int) $incomingDuration);
            }

            $record->attempts = max($record->attempts ?? 0, (int) ($incoming['attempts'] ?? 0));
            $record->best_metrics = $this->mergeMaxMetrics($record->best_metrics ?? [], $incoming['bestMetrics'] ?? []);

            $incomingPlayedAt = $incoming['lastPlayedAt'] ?? null;
            if ($incomingPlayedAt && (!$record->last_played_at || $incomingPlayedAt > $record->last_played_at)) {
                $record->last_played_at = $incomingPlayedAt;
            }

            $record->save();
        }
    }

    private function betterMedal(?string $current, ?string $incoming): ?string
    {
        $currentRank = self::MEDAL_RANK[$current] ?? 0;
        $incomingRank = self::MEDAL_RANK[$incoming] ?? 0;

        return $incomingRank > $currentRank ? $incoming : $current;
    }

    private function mergeMaxMetrics(array $existing, array $incoming): array
    {
        foreach ($incoming as $key => $value) {
            if (!is_numeric($value)) {
                continue;
            }

            if (!isset($existing[$key]) || $value > $existing[$key]) {
                $existing[$key] = $value;
            }
        }

        return $existing;
    }

    /** @param array<int, string> $achievementIds */
    private function mergeAchievements(User $user, array $achievementIds): int
    {
        $newCount = 0;

        foreach ($achievementIds as $achievementId) {
            if (!is_string($achievementId)) {
                continue;
            }

            $achievement = UserAchievement::firstOrCreate(
                ['user_id' => $user->id, 'achievement_id' => $achievementId],
                ['unlocked_at' => now(), 'source' => 'client'],
            );

            if ($achievement->wasRecentlyCreated) {
                $newCount++;
            }
        }

        return $newCount;
    }
}
