<?php

namespace Database\Seeders;

use App\Domain\Challenges\Services\ChallengeRotationService;
use Illuminate\Database\Seeder;

/**
 * Ensures today's daily and this week's weekly challenge instances exist.
 * Safe to re-run (unique (pool, period) index makes generation idempotent).
 */
class ChallengeSeeder extends Seeder
{
    public function run(): void
    {
        $service = app(ChallengeRotationService::class);
        [$daily, $weekly] = $service->ensureActive();

        $this->command?->info("Daily challenge: {$daily->definition->slug} ({$daily->period})");
        $this->command?->info("Weekly challenge: {$weekly->definition->slug} ({$weekly->period})");
    }
}
