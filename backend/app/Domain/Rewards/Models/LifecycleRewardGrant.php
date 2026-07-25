<?php

namespace App\Domain\Rewards\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LifecycleRewardGrant extends Model
{
    public $timestamps = false;
    protected $fillable = ['source_type', 'source_id', 'user_id', 'reward_key', 'granted_at', 'metadata_json'];
    protected function casts(): array { return ['granted_at' => 'datetime', 'metadata_json' => 'array']; }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
