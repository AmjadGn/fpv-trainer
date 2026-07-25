<?php

namespace App\Domain\Races\Models;

use App\Domain\Replays\Models\ReplayRecord;
use App\Domain\Sharing\Models\PublicResultShare;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class RaceRun extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_ACCEPTED = 'accepted';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_SUSPICIOUS = 'suspicious';
    public const STATUS_MANUAL_REVIEW = 'manual_review';

    public const TERMINAL_STATUSES = [
        self::STATUS_ACCEPTED,
        self::STATUS_REJECTED,
    ];

    protected $fillable = [
        'user_id', 'race_session_id', 'submission_id', 'course_id',
        'environment_id', 'weather_preset_id', 'course_version',
        'environment_version', 'weather_preset_version', 'physics_version',
        'client_build_version', 'replay_version', 'submission_version',
        'duration_ms', 'gate_count', 'completed', 'crashed', 'status',
        'suspicion_score', 'verification_notes', 'session_nonce',
        'client_digest', 'client_metadata', 'submitted_at', 'verified_at',
        'context_type', 'context_id',
    ];

    protected function casts(): array
    {
        return [
            'completed' => 'boolean',
            'crashed' => 'boolean',
            'verification_notes' => 'array',
            'client_metadata' => 'array',
            'submitted_at' => 'datetime',
            'verified_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function raceSession(): BelongsTo
    {
        return $this->belongsTo(RaceSession::class);
    }

    public function splits(): HasMany
    {
        return $this->hasMany(RaceRunSplit::class)->orderBy('gate_index');
    }

    public function replay(): HasOne
    {
        return $this->hasOne(ReplayRecord::class);
    }

    public function publicShare(): HasOne
    {
        return $this->hasOne(PublicResultShare::class);
    }

    public function isAccepted(): bool
    {
        return $this->status === self::STATUS_ACCEPTED;
    }
}
