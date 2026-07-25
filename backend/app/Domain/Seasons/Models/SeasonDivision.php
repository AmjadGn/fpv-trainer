<?php

namespace App\Domain\Seasons\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SeasonDivision extends Model
{
    protected $fillable = ['season_id', 'key', 'name', 'order', 'minimum_rating', 'maximum_rating', 'promotion_threshold', 'demotion_threshold', 'badge_style', 'reward_multiplier', 'enabled'];
    protected function casts(): array { return ['enabled' => 'boolean', 'reward_multiplier' => 'decimal:2']; }
    public function season(): BelongsTo { return $this->belongsTo(Season::class); }
    public function participants(): HasMany { return $this->hasMany(SeasonParticipant::class, 'current_division_id'); }
}
