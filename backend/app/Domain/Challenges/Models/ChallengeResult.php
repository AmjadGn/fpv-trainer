<?php

namespace App\Domain\Challenges\Models;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChallengeResult extends Model
{
    protected $fillable = ['challenge_instance_id', 'user_id', 'race_run_id', 'best_duration_ms', 'medal', 'xp_awarded'];

    public function instance(): BelongsTo
    {
        return $this->belongsTo(ChallengeInstance::class, 'challenge_instance_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function raceRun(): BelongsTo
    {
        return $this->belongsTo(RaceRun::class);
    }
}
