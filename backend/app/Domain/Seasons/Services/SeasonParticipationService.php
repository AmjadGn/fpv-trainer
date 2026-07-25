<?php

namespace App\Domain\Seasons\Services;

use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Models\SeasonDivision;
use App\Domain\Seasons\Models\SeasonParticipant;
use App\Models\User;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

class SeasonParticipationService
{
    public function join(User $user, Season $season): SeasonParticipant
    {
        if ($user->isBanned() || $user->isSuspended()) throw ApiException::forbidden('Your account cannot join competitive seasons.');
        if (!in_array($season->status, [Season::STATUS_REGISTRATION, Season::STATUS_ACTIVE], true)) throw ApiException::conflict('Season registration is closed.');
        return DB::transaction(function () use ($user, $season) { $existing = SeasonParticipant::where('season_id',$season->id)->where('user_id',$user->id)->lockForUpdate()->first(); if ($existing) return $existing; $rookie = SeasonDivision::where('season_id',$season->id)->where('key','rookie')->first(); return SeasonParticipant::create(['season_id'=>$season->id,'user_id'=>$user->id,'joined_at'=>now(),'current_division_id'=>$rookie?->id,'highest_division_id'=>$rookie?->id,'current_rating'=>1000,'peak_rating'=>1000,'placement_status'=>SeasonParticipant::PLACEMENT_UNPLACED]); });
    }
    public function me(User $user, Season $season): ?SeasonParticipant { return SeasonParticipant::where('season_id',$season->id)->where('user_id',$user->id)->first(); }
    public function leave(User $user, Season $season): ?SeasonParticipant { return DB::transaction(function () use ($user,$season) { $participant = SeasonParticipant::where('season_id',$season->id)->where('user_id',$user->id)->lockForUpdate()->first(); if (!$participant || $participant->left_at) return $participant; $participant->update(['left_at'=>now()]); return $participant->fresh(); }); }
}
