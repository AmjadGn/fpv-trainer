<?php

namespace App\Domain\Seasons\Models;

use App\Domain\Missions\Models\SeasonMission;
use App\Domain\Tournaments\Models\Tournament;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Season extends Model
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_REGISTRATION = 'registration';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_CALCULATING = 'calculating';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_ARCHIVED = 'archived';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = ['slug', 'name', 'description', 'status', 'starts_at', 'ends_at', 'registration_starts_at', 'registration_ends_at', 'rules_version', 'catalog_version', 'physics_version', 'featured_environment_id', 'reward_configuration_json', 'division_configuration_json', 'mission_configuration_json', 'leaderboard_configuration_json', 'is_primary', 'published_at'];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'registration_starts_at' => 'datetime', 'registration_ends_at' => 'datetime', 'published_at' => 'datetime', 'is_primary' => 'boolean', 'reward_configuration_json' => 'array', 'division_configuration_json' => 'array', 'mission_configuration_json' => 'array', 'leaderboard_configuration_json' => 'array'];
    }

    public function divisions(): HasMany { return $this->hasMany(SeasonDivision::class)->orderBy('order'); }
    public function participants(): HasMany { return $this->hasMany(SeasonParticipant::class); }
    public function missions(): HasMany { return $this->hasMany(SeasonMission::class); }
    public function tournaments(): HasMany { return $this->hasMany(Tournament::class); }
}
