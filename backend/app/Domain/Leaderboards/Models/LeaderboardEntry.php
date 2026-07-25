<?php

namespace App\Domain\Leaderboards\Models;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaderboardEntry extends Model
{
    protected $table = 'leaderboard_entries';

    protected $fillable = ['user_id', 'course_id', 'weather_preset_id', 'race_run_id', 'best_duration_ms', 'rules_version'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function raceRun(): BelongsTo
    {
        return $this->belongsTo(RaceRun::class);
    }
}
