<?php

namespace App\Domain\Achievements\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserAchievement extends Model
{
    protected $fillable = ['user_id', 'achievement_id', 'unlocked_at', 'source'];

    protected function casts(): array
    {
        return [
            'unlocked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
