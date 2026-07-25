<?php

namespace App\Jobs;

use App\Domain\Replays\Models\ReplayRecord;
use App\Domain\Replays\Services\ReplayStorageService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class CleanupAbandonedReplaysJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(ReplayStorageService $storage): int
    {
        $expired = ReplayRecord::where('purge_after', '<', now())->get();

        foreach ($expired as $record) {
            $storage->delete($record);
        }

        return $expired->count();
    }
}
