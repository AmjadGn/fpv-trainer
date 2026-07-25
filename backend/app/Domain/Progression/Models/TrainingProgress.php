<?php

namespace App\Domain\Progression\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TrainingProgress extends Model
{
    protected $table = 'training_progress';

    protected $fillable = [
        'user_id', 'module_id', 'module_version', 'completed', 'highest_medal',
        'best_score', 'best_duration_ms', 'attempts', 'last_played_at', 'best_metrics',
    ];

    protected function casts(): array
    {
        return [
            'completed' => 'boolean',
            'best_metrics' => 'array',
            'last_played_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function toApiArray(): array
    {
        return [
            'moduleId' => $this->module_id,
            'moduleVersion' => $this->module_version,
            'completed' => $this->completed,
            'highestMedal' => $this->highest_medal,
            'bestScore' => $this->best_score,
            'bestDurationMs' => $this->best_duration_ms,
            'attempts' => $this->attempts,
            'lastPlayedAt' => optional($this->last_played_at)->toIso8601String(),
            'bestMetrics' => $this->best_metrics ?? [],
        ];
    }
}
