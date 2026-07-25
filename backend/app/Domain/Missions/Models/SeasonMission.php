<?php

namespace App\Domain\Missions\Models;

use App\Domain\Seasons\Models\Season;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SeasonMission extends Model
{
    protected $fillable = ['season_id', 'key', 'title', 'description', 'category', 'progress_type', 'target_value', 'reward_xp', 'reward_season_points', 'reward_cosmetic_key', 'starts_at', 'ends_at', 'repeatable', 'enabled', 'configuration_json'];
    protected function casts(): array { return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'repeatable' => 'boolean', 'enabled' => 'boolean', 'configuration_json' => 'array']; }
    public function season(): BelongsTo { return $this->belongsTo(Season::class); }
    public function progress(): HasMany { return $this->hasMany(SeasonMissionProgress::class, 'mission_id'); }
}
