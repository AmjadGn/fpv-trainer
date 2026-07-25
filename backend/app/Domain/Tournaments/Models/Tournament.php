<?php

namespace App\Domain\Tournaments\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Domain\Seasons\Models\Season;

class Tournament extends Model
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_REGISTRATION = 'registration';
    public const STATUS_UPCOMING = 'upcoming';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_CALCULATING = 'calculating';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_ARCHIVED = 'archived';

    public const FORMAT_OPEN_TIME_TRIAL = 'open_time_trial';
    public const FORMAT_LIMITED_ATTEMPTS = 'limited_attempts';
    public const FORMAT_QUALIFICATION = 'qualification';
    public const FORMAT_MULTI_STAGE = 'multi_stage';

    protected $fillable = [
        'season_id', 'slug', 'name', 'description', 'status', 'format',
        'starts_at', 'ends_at', 'registration_starts_at', 'registration_ends_at',
        'max_attempts', 'environment_id', 'course_id', 'course_version',
        'weather_preset_id', 'weather_seed', 'rules_version', 'physics_version',
        'scoring_type', 'count_rejected_attempts', 'qualification_rules_json',
        'reward_configuration_json', 'visibility', 'featured',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'registration_starts_at' => 'datetime',
            'registration_ends_at' => 'datetime',
            'featured' => 'boolean',
            'count_rejected_attempts' => 'boolean',
            'qualification_rules_json' => 'array',
            'reward_configuration_json' => 'array',
        ];
    }

    public function season(): BelongsTo
    {
        return $this->belongsTo(Season::class);
    }

    public function registrations(): HasMany
    {
        return $this->hasMany(TournamentRegistration::class);
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(TournamentAttempt::class);
    }
}
