<?php

namespace App\Console\Commands;

use App\Domain\Challenges\Services\ChallengeRotationService;
use Illuminate\Console\Command;

class GenerateWeeklyChallengeCommand extends Command
{
    protected $signature = 'fpv:challenges:generate-weekly';

    protected $description = 'Ensure this week\'s weekly challenge instance exists (idempotent).';

    public function handle(ChallengeRotationService $service): int
    {
        $instance = $service->generateWeekly();

        $this->info("Weekly challenge for {$instance->period}: {$instance->definition->slug}");

        return self::SUCCESS;
    }
}
