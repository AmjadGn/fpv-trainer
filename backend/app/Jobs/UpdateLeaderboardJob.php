<?php

namespace App\Jobs;

use App\Domain\Leaderboards\Services\LeaderboardService;
use App\Domain\Races\Models\RaceRun;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class UpdateLeaderboardJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly int $raceRunId)
    {
    }

    public function handle(LeaderboardService $leaderboards): void
    {
        $run = RaceRun::find($this->raceRunId);

        if ($run && $run->isAccepted()) {
            $leaderboards->recordAcceptedRun($run);
        }
    }
}
