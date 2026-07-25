<?php

namespace App\Domain\Races\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RaceRunSplit extends Model
{
    protected $fillable = ['race_run_id', 'gate_index', 'time_ms'];

    public function raceRun(): BelongsTo
    {
        return $this->belongsTo(RaceRun::class);
    }
}
