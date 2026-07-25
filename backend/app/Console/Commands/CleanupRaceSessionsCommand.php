<?php

namespace App\Console\Commands;

use App\Jobs\CleanupExpiredRaceSessionsJob;
use Illuminate\Console\Command;

class CleanupRaceSessionsCommand extends Command
{
    protected $signature = 'fpv:race-sessions:cleanup';

    protected $description = 'Mark stale active race sessions as expired.';

    public function handle(): int
    {
        $count = CleanupExpiredRaceSessionsJob::dispatchSync();

        $this->info("Expired {$count} stale race session(s).");

        return self::SUCCESS;
    }
}
