<?php

namespace App\Domain\Replays\Services;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Replays\Models\ReplayRecord;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Persists flight replay payloads. Small payloads (the common case for MVP
 * training/race sessions) are stored inline as JSON on the replay_records
 * row; payloads over the disk threshold are written to storage/app/replays
 * as plain JSON files instead.
 *
 * Security note: replay payloads are always decoded with json_decode() and
 * re-encoded with json_encode(). We never call PHP's unserialize() on
 * client-controlled data, which avoids PHP object injection entirely.
 */
class ReplayStorageService
{
    private const DISK_THRESHOLD_BYTES = 512 * 1024;

    public function __construct(private readonly int $maxBytes, private readonly int $maxFrames)
    {
    }

    /**
     * @param array{metadata?: array, frames?: array} $replay Decoded JSON, never a raw string.
     */
    public function store(RaceRun $raceRun, array $replay): ReplayRecord
    {
        $frames = $replay['frames'] ?? [];

        if (!is_array($frames)) {
            throw new RuntimeException('Replay frames must be an array.');
        }

        if (count($frames) > $this->maxFrames) {
            throw new RuntimeException('Replay frame count exceeds the configured maximum.');
        }

        $encoded = json_encode($replay);

        if ($encoded === false) {
            throw new RuntimeException('Replay payload could not be encoded as JSON.');
        }

        $size = strlen($encoded);

        if ($size > $this->maxBytes) {
            throw new RuntimeException('Replay payload exceeds the configured maximum size.');
        }

        $attributes = [
            'format' => 'json',
            'frame_count' => count($frames),
            'size_bytes' => $size,
            // Replays backing a non-accepted run are abandoned/garbage after
            // a grace period (kept briefly for manual-review inspection);
            // accepted runs keep their replay indefinitely.
            'purge_after' => $raceRun->status === RaceRun::STATUS_ACCEPTED ? null : now()->addDays(30),
        ];

        if ($size > self::DISK_THRESHOLD_BYTES) {
            $path = "replays/{$raceRun->id}.json";
            Storage::disk('local')->put($path, $encoded);

            $attributes['storage'] = 'disk';
            $attributes['disk_path'] = $path;
            $attributes['payload'] = null;
        } else {
            $attributes['storage'] = 'database';
            $attributes['disk_path'] = null;
            $attributes['payload'] = $replay;
        }

        return $raceRun->replay()->exists()
            ? tap($raceRun->replay, function (ReplayRecord $record) use ($attributes) {
                $record->update($attributes);
            })
            : $raceRun->replay()->create($attributes);
    }

    /**
     * @return array{metadata?: array, frames?: array}|null
     */
    public function retrieve(ReplayRecord $record): ?array
    {
        if ($record->storage === 'disk') {
            if (!$record->disk_path || !Storage::disk('local')->exists($record->disk_path)) {
                return null;
            }

            $decoded = json_decode(Storage::disk('local')->get($record->disk_path), true);

            return is_array($decoded) ? $decoded : null;
        }

        return $record->payload;
    }

    public function delete(ReplayRecord $record): void
    {
        if ($record->storage === 'disk' && $record->disk_path) {
            Storage::disk('local')->delete($record->disk_path);
        }

        $record->delete();
    }
}
