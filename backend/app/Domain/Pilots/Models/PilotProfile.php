<?php

namespace App\Domain\Pilots\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PilotProfile extends Model
{
    protected $fillable = [
        'user_id',
        'bio',
        'avatar_url',
        'home_environment_id',
        'is_public',
    ];

    protected function casts(): array
    {
        return [
            'is_public' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
