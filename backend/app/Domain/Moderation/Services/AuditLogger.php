<?php

namespace App\Domain\Moderation\Services;

use App\Domain\Moderation\Models\AdminAuditLog;
use App\Models\User;

class AuditLogger
{
    public function log(User $admin, string $action, ?string $subjectType = null, ?string $subjectId = null, array $metadata = [], ?string $ip = null): AdminAuditLog
    {
        return AdminAuditLog::create([
            'admin_user_id' => $admin->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'ip_address' => $ip,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }
}
