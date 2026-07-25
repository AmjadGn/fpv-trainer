<?php

namespace App\Domain\Sharing\Models;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PublicResultShare extends Model
{
    public const VISIBILITY_PRIVATE = 'private';
    public const VISIBILITY_UNLISTED = 'unlisted';
    public const VISIBILITY_PUBLIC = 'public';

    protected $fillable = ['public_id', 'race_run_id', 'user_id', 'visibility', 'title', 'view_count'];

    public function raceRun(): BelongsTo
    {
        return $this->belongsTo(RaceRun::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isViewableByPublic(): bool
    {
        return in_array($this->visibility, [self::VISIBILITY_UNLISTED, self::VISIBILITY_PUBLIC], true);
    }
}
