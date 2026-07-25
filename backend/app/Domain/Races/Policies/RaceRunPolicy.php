<?php

namespace App\Domain\Races\Policies;

use App\Domain\Races\Models\RaceRun;
use App\Models\User;

class RaceRunPolicy
{
    public function view(User $user, RaceRun $run): bool
    {
        return $user->is_admin || (int) $user->id === (int) $run->user_id;
    }

    public function share(User $user, RaceRun $run): bool
    {
        return (int) $user->id === (int) $run->user_id;
    }
}
