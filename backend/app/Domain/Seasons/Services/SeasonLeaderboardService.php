<?php

namespace App\Domain\Seasons\Services;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Models\SeasonParticipant;
use App\Models\User;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class SeasonLeaderboardService
{
    public function global(Season $season, int $perPage = 25, int $page = 1): LengthAwarePaginator { return $this->base($season)->paginate($perPage, ['*'], 'page', $page); }
    public function division(Season $season, int $divisionId, int $perPage = 25, int $page = 1): LengthAwarePaginator { return $this->base($season)->where('current_division_id',$divisionId)->paginate($perPage,['*'],'page',$page); }
    public function country(Season $season, string $countryCode, int $perPage = 25, int $page = 1): LengthAwarePaginator { return $this->base($season)->whereHas('user',fn($q)=>$q->where('country_code',$countryCode))->paginate($perPage,['*'],'page',$page); }
    public function course(Season $season, string $courseId, int $perPage = 25, int $page = 1): LengthAwarePaginator { return $this->base($season)->whereIn('user_id', RaceRun::where('context_type','season')->where('context_id',$season->id)->where('course_id',$courseId)->where('status',RaceRun::STATUS_ACCEPTED)->select('user_id'))->paginate($perPage,['*'],'page',$page); }
    public function missionPoints(Season $season, int $perPage = 25, int $page = 1): LengthAwarePaginator { return SeasonParticipant::where('season_id',$season->id)->with('user:id,username,display_name,country_code')->orderByDesc('mission_points')->orderByDesc('current_rating')->paginate($perPage,['*'],'page',$page); }
    public function aroundMe(Season $season, User $user, int $window = 5): Collection { $entries=$this->base($season)->get(); $index=$entries->search(fn($p)=>(int)$p->user_id===(int)$user->id); return $entries->slice($index === false ? 0 : max(0,$index-$window),$window*2+1)->values(); }
    private function base(Season $season) { return SeasonParticipant::where('season_id',$season->id)->with('user:id,username,display_name,country_code','currentDivision')->orderByDesc('current_rating')->orderByDesc('seasonal_points')->orderByDesc('accepted_ranked_runs')->orderBy('id'); }
}
