<?php

namespace App\Console\Commands;

use App\Domain\Challenges\Services\ChallengeRotationService;
use Illuminate\Console\Command;

class GenerateDailyChallengeCommand extends Command
{
    protected $signature = 'fpv:challenges:generate-daily';

    protected $description = 'Ensure today\'s daily challenge instance exists (idempotent).';

    public function handle(ChallengeRotationService $service): int
    {
        $instance = $service->generateDaily();

        $this->info("Daily challenge for {$instance->period}: {$instance->definition->slug}");

        return self::SUCCESS;
    }
}
