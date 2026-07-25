<?php

namespace App\Domain\Moderation\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminAuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['admin_user_id', 'action', 'subject_type', 'subject_id', 'ip_address', 'metadata', 'created_at'];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }
}
