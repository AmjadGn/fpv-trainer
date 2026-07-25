<?php

namespace App\Domain\Missions\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeasonMissionProgress extends Model
{
    protected $table = 'season_mission_progress';
    protected $fillable = ['mission_id', 'user_id', 'progress_value', 'progress_version', 'completed_at', 'reward_claimed_at', 'metadata_json'];
    protected function casts(): array { return ['completed_at' => 'datetime', 'reward_claimed_at' => 'datetime', 'metadata_json' => 'array']; }
    public function mission(): BelongsTo { return $this->belongsTo(SeasonMission::class, 'mission_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
