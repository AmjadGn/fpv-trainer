<?php

namespace App\Domain\Moderation\Models;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ModerationAction extends Model
{
    protected $fillable = ['admin_user_id', 'target_user_id', 'target_race_run_id', 'action', 'reason', 'metadata'];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }

    public function targetUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    public function targetRaceRun(): BelongsTo
    {
        return $this->belongsTo(RaceRun::class, 'target_race_run_id');
    }
}
