<?php

namespace App\Console\Commands;

use App\Domain\Challenges\Services\ChallengeRotationService;
use Illuminate\Console\Command;

class CloseExpiredChallengesCommand extends Command
{
    protected $signature = 'fpv:challenges:close-expired';

    protected $description = 'Mark challenge instances past their end date as closed.';

    public function handle(ChallengeRotationService $service): int
    {
        $count = $service->closeExpired();

        $this->info("Closed {$count} expired challenge instance(s).");

        return self::SUCCESS;
    }
}
