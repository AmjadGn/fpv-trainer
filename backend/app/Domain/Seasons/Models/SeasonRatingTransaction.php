<?php

namespace App\Domain\Seasons\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SeasonRatingTransaction extends Model
{
    public const UPDATED_AT = null;
    protected $fillable = ['season_id', 'user_id', 'source_type', 'source_id', 'previous_rating', 'delta', 'new_rating', 'reason_code', 'metadata_json'];
    protected function casts(): array { return ['metadata_json' => 'array', 'created_at' => 'datetime']; }
    public function season(): BelongsTo { return $this->belongsTo(Season::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
