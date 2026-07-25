<?php

namespace App\Jobs;

use App\Domain\Pilots\Actions\ExportProfileDataAction;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/**
 * Builds a pilot's data export and writes it to storage/app/exports so the
 * request/response cycle doesn't have to hold the (potentially large,
 * up to 500 recent runs) payload in memory synchronously.
 */
class ExportProfileDataJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly int $userId)
    {
    }

    public function handle(ExportProfileDataAction $action): void
    {
        $user = User::find($this->userId);

        if (!$user) {
            return;
        }

        $data = $action->execute($user);

        Storage::disk('local')->put(
            "exports/user-{$user->id}.json",
            json_encode($data, JSON_PRETTY_PRINT),
        );
    }
}
