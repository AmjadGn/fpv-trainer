<?php

namespace App\Models;

use App\Domain\Pilots\Models\PilotProfile;
use App\Domain\Progression\Models\PlayerProgress;
use App\Domain\Progression\Models\TrainingProgress;
use App\Domain\Achievements\Models\UserAchievement;
use App\Domain\Notifications\Models\NotificationPreference;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    public const STATUS_ACTIVE = 'active';
    public const STATUS_RESTRICTED = 'restricted';
    public const STATUS_BANNED = 'banned';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'username',
        'display_name',
        'email',
        'password',
        'country_code',
        'competitive_status',
        'accepted_terms_at',
        'is_admin',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'accepted_terms_at' => 'datetime',
            'suspended_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
        ];
    }

    public function pilotProfile(): HasOne
    {
        return $this->hasOne(PilotProfile::class);
    }

    public function playerProgress(): HasOne
    {
        return $this->hasOne(PlayerProgress::class);
    }

    public function trainingProgress(): HasMany
    {
        return $this->hasMany(TrainingProgress::class);
    }

    public function achievements(): HasMany
    {
        return $this->hasMany(UserAchievement::class);
    }

    public function notificationPreference(): HasOne
    {
        return $this->hasOne(NotificationPreference::class);
    }

    public function isActive(): bool
    {
        return $this->competitive_status === self::STATUS_ACTIVE;
    }

    public function isBanned(): bool
    {
        return $this->competitive_status === self::STATUS_BANNED;
    }

    public function isSuspended(): bool
    {
        return $this->suspended_at !== null || $this->competitive_status !== self::STATUS_ACTIVE;
    }
}
