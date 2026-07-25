<?php

namespace App\Domain\Replays\Models;

use App\Domain\Races\Models\RaceRun;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReplayRecord extends Model
{
    protected $fillable = [
        'race_run_id', 'storage', 'format', 'frame_count', 'size_bytes',
        'payload', 'disk_path', 'purge_after',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'purge_after' => 'datetime',
        ];
    }

    public function raceRun(): BelongsTo
    {
        return $this->belongsTo(RaceRun::class);
    }
}
