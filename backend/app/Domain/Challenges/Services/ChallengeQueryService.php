<?php

namespace App\Domain\Challenges\Services;

use App\Domain\Challenges\Models\ChallengeInstance;
use App\Support\ApiException;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class ChallengeQueryService
{
    public function __construct(private readonly ChallengeRotationService $rotation)
    {
    }

    /** @return Collection<int, ChallengeInstance> */
    public function active(): Collection
    {
        $instances = $this->rotation->ensureActive();

        return collect($instances)->map(fn (ChallengeInstance $instance) => $instance->loadMissing('definition'));
    }

    public function findActiveBySlug(string $slug): ChallengeInstance
    {
        $instance = ChallengeInstance::query()
            ->whereHas('definition', fn ($query) => $query->where('slug', $slug))
            ->where('status', ChallengeInstance::STATUS_ACTIVE)
            ->with('definition')
            ->latest('starts_at')
            ->first();

        if (!$instance) {
            throw ApiException::notFound('No active challenge with that slug.');
        }

        return $instance;
    }

    public function leaderboard(ChallengeInstance $instance, int $perPage = 25, int $page = 1): LengthAwarePaginator
    {
        return $instance->results()
            ->with('user:id,username,display_name,country_code')
            ->orderBy('best_duration_ms')
            ->orderBy('id')
            ->paginate($perPage, ['*'], 'page', $page);
    }

    public static function serializeInstance(ChallengeInstance $instance): array
    {
        $definition = $instance->definition;

        return [
            'slug' => $definition->slug,
            'title' => $definition->title,
            'description' => $definition->description,
            'pool' => $instance->pool,
            'period' => $instance->period,
            'environmentId' => $definition->environment_id,
            'courseId' => $definition->course_id,
            'weatherPresetId' => $definition->weather_preset_id,
            'scoringType' => $definition->scoring_type,
            'xpReward' => $definition->xp_reward,
            'medalThresholdsMs' => $definition->medal_thresholds_ms,
            'startsAt' => $instance->starts_at->toIso8601String(),
            'endsAt' => $instance->ends_at->toIso8601String(),
            'status' => $instance->status,
        ];
    }
}
