<?php

namespace App\Domain\Challenges\Services;

use App\Domain\Challenges\Models\ChallengeDefinition;
use App\Domain\Challenges\Models\ChallengeInstance;
use App\Domain\Courses\Services\CatalogService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Picks a deterministic challenge from shared/catalog/challenge-rotation.json
 * for a given calendar day / ISO week, so every server process (and the
 * scheduled command) computes the same rotation without coordination.
 * The unique (pool, period) index on challenge_instances makes generation
 * idempotent — calling generate*() twice for the same period is a no-op.
 */
class ChallengeRotationService
{
    public function __construct(private readonly CatalogService $catalog)
    {
    }

    public function generateDaily(?Carbon $date = null): ChallengeInstance
    {
        $date = ($date ?? Carbon::today())->startOfDay();
        $period = $date->format('Y-m-d');

        return $this->generate('daily', $period, $this->catalog->dailyChallengePool(), $date->copy(), $date->copy()->addDay());
    }

    public function generateWeekly(?Carbon $date = null): ChallengeInstance
    {
        $date = ($date ?? Carbon::today());
        $startOfWeek = $date->copy()->startOfWeek(Carbon::MONDAY);
        $endOfWeek = $startOfWeek->copy()->addWeek();
        $period = $startOfWeek->format('o').'-W'.$startOfWeek->format('W');

        return $this->generate('weekly', $period, $this->catalog->weeklyChallengePool(), $startOfWeek, $endOfWeek);
    }

    /**
     * @param array<int, array<string, mixed>> $pool
     */
    private function generate(string $pool, string $period, array $pool_, Carbon $startsAt, Carbon $endsAt): ChallengeInstance
    {
        $existing = ChallengeInstance::where('pool', $pool)->where('period', $period)->first();

        if ($existing) {
            return $existing;
        }

        if (empty($pool_)) {
            throw new \RuntimeException("Challenge rotation pool '{$pool}' is empty.");
        }

        $seed = hash('sha256', "{$pool}:{$period}");
        $index = intval(substr($seed, 0, 8), 16) % count($pool_);
        $definitionData = $pool_[$index];

        return DB::transaction(function () use ($pool, $period, $seed, $definitionData, $startsAt, $endsAt) {
            // Re-check under transaction to guard against a race between the
            // existence check above and this insert (unique index is the
            // real backstop; this just avoids a noisy exception in the
            // common case of two workers racing the same cron tick).
            $existing = ChallengeInstance::where('pool', $pool)->where('period', $period)->first();

            if ($existing) {
                return $existing;
            }

            $definition = ChallengeDefinition::updateOrCreate(
                ['slug' => $definitionData['slug']],
                [
                    'title' => $definitionData['title'],
                    'description' => $definitionData['description'] ?? null,
                    'environment_id' => $definitionData['environmentId'],
                    'course_id' => $definitionData['courseId'],
                    'weather_preset_id' => $definitionData['weatherPresetId'],
                    'scoring_type' => $definitionData['scoringType'] ?? 'fastest_time',
                    'xp_reward' => $definitionData['xpReward'] ?? 0,
                    'medal_thresholds_ms' => $definitionData['medalThresholdsMs'] ?? null,
                    'pool' => $pool,
                ],
            );

            return ChallengeInstance::create([
                'challenge_definition_id' => $definition->id,
                'pool' => $pool,
                'period' => $period,
                'seed' => $seed,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'status' => ChallengeInstance::STATUS_ACTIVE,
            ]);
        });
    }

    public function closeExpired(): int
    {
        return ChallengeInstance::where('status', ChallengeInstance::STATUS_ACTIVE)
            ->where('ends_at', '<', Carbon::now())
            ->update(['status' => ChallengeInstance::STATUS_CLOSED]);
    }

    /**
     * Self-healing accessor used by the API and the scheduler: ensures
     * today's daily and this week's weekly challenge instances exist.
     *
     * @return array<int, ChallengeInstance>
     */
    public function ensureActive(): array
    {
        return [$this->generateDaily(), $this->generateWeekly()];
    }
}
