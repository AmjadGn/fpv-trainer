<?php

namespace App\Console\Commands;

use App\Jobs\CleanupAbandonedReplaysJob;
use Illuminate\Console\Command;

class CleanupReplaysCommand extends Command
{
    protected $signature = 'fpv:replays:cleanup';

    protected $description = 'Delete replay records (and disk files) past their purge_after date.';

    public function handle(): int
    {
        $count = CleanupAbandonedReplaysJob::dispatchSync();

        $this->info("Purged {$count} abandoned replay(s).");

        return self::SUCCESS;
    }
}
