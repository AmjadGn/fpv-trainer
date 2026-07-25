<?php

namespace App\Domain\Seasons\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeasonParticipant extends Model
{
    public const PLACEMENT_UNPLACED = 'unplaced'; public const PLACEMENT_PLACING = 'placing'; public const PLACEMENT_PLACED = 'placed';
    public const REWARD_PENDING = 'pending'; public const REWARD_AWARDED = 'awarded'; public const REWARD_SKIPPED = 'skipped';
    protected $fillable = ['season_id', 'user_id', 'joined_at', 'current_division_id', 'highest_division_id', 'current_rating', 'peak_rating', 'placement_status', 'placement_runs_completed', 'total_ranked_runs', 'accepted_ranked_runs', 'rejected_ranked_runs', 'wins', 'personal_bests', 'seasonal_points', 'mission_points', 'final_rank', 'final_percentile', 'reward_status', 'last_promotion_at', 'demotion_protection_until', 'left_at', 'metadata_json'];
    protected function casts(): array { return ['joined_at' => 'datetime', 'last_promotion_at' => 'datetime', 'demotion_protection_until' => 'datetime', 'left_at' => 'datetime', 'metadata_json' => 'array', 'final_percentile' => 'decimal:3']; }
    public function season(): BelongsTo { return $this->belongsTo(Season::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function currentDivision(): BelongsTo { return $this->belongsTo(SeasonDivision::class, 'current_division_id'); }
    public function highestDivision(): BelongsTo { return $this->belongsTo(SeasonDivision::class, 'highest_division_id'); }
}
