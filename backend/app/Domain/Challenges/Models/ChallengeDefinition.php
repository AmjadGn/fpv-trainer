<?php

namespace App\Domain\Challenges\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ChallengeDefinition extends Model
{
    protected $fillable = [
        'slug', 'title', 'description', 'environment_id', 'course_id',
        'weather_preset_id', 'scoring_type', 'xp_reward', 'medal_thresholds_ms', 'pool',
    ];

    protected function casts(): array
    {
        return [
            'medal_thresholds_ms' => 'array',
        ];
    }

    public function instances(): HasMany
    {
        return $this->hasMany(ChallengeInstance::class);
    }
}
