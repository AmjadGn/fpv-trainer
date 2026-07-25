<?php

namespace App\Domain\Progression\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgressSyncEvent extends Model
{
    protected $fillable = ['user_id', 'event_type', 'payload_hash', 'summary'];

    protected function casts(): array
    {
        return [
            'summary' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
