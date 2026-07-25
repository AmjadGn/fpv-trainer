<?php

namespace App\Domain\Progression\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlayerProgress extends Model
{
    protected $table = 'player_progress';

    protected $fillable = [
        'user_id', 'level', 'experience_points', 'gold_medals', 'silver_medals',
        'bronze_medals', 'completed_races', 'total_flight_time_ms',
        'gates_completed', 'crashes', 'best_times', 'completed_training_modules',
        'version',
    ];

    protected function casts(): array
    {
        return [
            'best_times' => 'array',
            'completed_training_modules' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function toApiArray(): array
    {
        return [
            'level' => $this->level,
            'experiencePoints' => $this->experience_points,
            'completedTrainingModules' => $this->completed_training_modules ?? [],
            'goldMedals' => $this->gold_medals,
            'silverMedals' => $this->silver_medals,
            'bronzeMedals' => $this->bronze_medals,
            'completedRaces' => $this->completed_races,
            'totalFlightTimeMs' => $this->total_flight_time_ms,
            'gatesCompleted' => $this->gates_completed,
            'crashes' => $this->crashes,
            'bestTimes' => $this->best_times ?? [],
            'version' => $this->version,
        ];
    }
}
