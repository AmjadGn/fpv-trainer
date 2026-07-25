<?php

namespace App\Domain\Seasons\Services;

use App\Domain\Rewards\Models\LifecycleRewardGrant;
use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Models\SeasonParticipant;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SeasonLifecycleService
{
    public function openRegistration(Season $season): Season { return $this->transition($season, [Season::STATUS_DRAFT, Season::STATUS_SCHEDULED], Season::STATUS_REGISTRATION, true); }

    public function activate(Season $season): Season
    {
        return DB::transaction(function () use ($season) {
            $locked = Season::whereKey($season->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === Season::STATUS_ACTIVE) return $locked;
            $this->guard($locked, [Season::STATUS_REGISTRATION, Season::STATUS_SCHEDULED]);
            if ($locked->is_primary && Season::where('is_primary', true)->where('status', Season::STATUS_ACTIVE)->whereKeyNot($locked->id)->lockForUpdate()->exists()) {
                throw ApiException::conflict('Another primary season is already active.');
            }
            $locked->update(['status' => Season::STATUS_ACTIVE, 'published_at' => $locked->published_at ?? now()]);
            Log::info('Season activated.', ['season_id' => $locked->id]);
            return $locked->fresh();
        });
    }

    public function close(Season $season): Season { return $this->transition($season, [Season::STATUS_ACTIVE], Season::STATUS_CALCULATING, true); }

    public function finalize(Season $season): Season
    {
        return DB::transaction(function () use ($season) {
            $locked = Season::whereKey($season->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === Season::STATUS_COMPLETED) return $locked;
            $this->guard($locked, [Season::STATUS_CALCULATING]);
            $participants = SeasonParticipant::where('season_id', $locked->id)->orderByDesc('current_rating')->orderByDesc('seasonal_points')->orderBy('id')->lockForUpdate()->get();
            $count = $participants->count();
            foreach ($participants as $index => $participant) {
                $rank = $index + 1;
                $participant->update(['final_rank' => $rank, 'final_percentile' => $count ? round((($count - $index) / $count) * 100, 3) : null]);
                $this->grantCompletionRewards($locked, $participant, $rank);
            }
            $locked->update(['status' => Season::STATUS_COMPLETED]);
            Log::info('Season finalized.', ['season_id' => $locked->id, 'participants' => $count]);
            return $locked->fresh();
        });
    }

    public function archive(Season $season): Season { return $this->transition($season, [Season::STATUS_COMPLETED], Season::STATUS_ARCHIVED, true); }

    public function cancel(Season $season): Season
    {
        return DB::transaction(function () use ($season) {
            $locked = Season::whereKey($season->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === Season::STATUS_CANCELLED) return $locked;
            $this->guard($locked, [Season::STATUS_DRAFT, Season::STATUS_SCHEDULED, Season::STATUS_REGISTRATION, Season::STATUS_ACTIVE, Season::STATUS_CALCULATING]);
            if (($locked->reward_configuration_json['award_on_cancel'] ?? false) === true) foreach (SeasonParticipant::where('season_id', $locked->id)->lockForUpdate()->get() as $participant) $this->grantCompletionRewards($locked, $participant, null, 'cancel');
            $locked->update(['status' => Season::STATUS_CANCELLED]);
            Log::info('Season cancelled.', ['season_id' => $locked->id]);
            return $locked->fresh();
        });
    }

    public function seedDivisions(Season $season): void
    {
        $defaults = [['key'=>'rookie','name'=>'Rookie','minimum_rating'=>0,'maximum_rating'=>999],['key'=>'bronze','name'=>'Bronze','minimum_rating'=>1000,'maximum_rating'=>1199],['key'=>'silver','name'=>'Silver','minimum_rating'=>1200,'maximum_rating'=>1399],['key'=>'gold','name'=>'Gold','minimum_rating'=>1400,'maximum_rating'=>1599],['key'=>'platinum','name'=>'Platinum','minimum_rating'=>1600,'maximum_rating'=>1799],['key'=>'diamond','name'=>'Diamond','minimum_rating'=>1800,'maximum_rating'=>1999],['key'=>'elite','name'=>'Elite','minimum_rating'=>2000,'maximum_rating'=>null]];
        foreach (($season->division_configuration_json ?: $defaults) as $order => $division) $season->divisions()->updateOrCreate(['key' => $division['key']], array_merge(['name'=>ucfirst($division['key']), 'order'=>$order, 'promotion_threshold'=>$division['maximum_rating'] ? $division['maximum_rating'] + 1 : $division['minimum_rating'], 'demotion_threshold'=>$division['minimum_rating'], 'reward_multiplier'=>1, 'enabled'=>true], $division));
    }

    private function transition(Season $season, array $from, string $to, bool $idempotent): Season { return DB::transaction(function () use ($season, $from, $to, $idempotent) { $locked = Season::whereKey($season->id)->lockForUpdate()->firstOrFail(); if ($idempotent && $locked->status === $to) return $locked; $this->guard($locked, $from); $locked->update(['status'=>$to]); Log::info('Season lifecycle transitioned.', ['season_id'=>$locked->id, 'from'=>$from, 'to'=>$to]); return $locked->fresh(); }); }
    private function guard(Season $season, array $allowed): void { if (!in_array($season->status, $allowed, true)) throw ApiException::conflict('Season cannot transition from its current status.', ['status'=>$season->status]); }
    private function grantCompletionRewards(Season $season, SeasonParticipant $participant, ?int $rank, string $reason = 'completion'): void { $rewards = $season->reward_configuration_json['rewards'] ?? []; foreach ($rewards as $reward) { $maxRank = $reward['max_rank'] ?? null; if ($maxRank !== null && $rank !== null && $rank > $maxRank) continue; LifecycleRewardGrant::firstOrCreate(['source_type'=>'season_'.$reason, 'source_id'=>(string)$season->id, 'user_id'=>$participant->user_id, 'reward_key'=>(string)($reward['key'] ?? 'season_completion')], ['granted_at'=>now(), 'metadata_json'=>['season_id'=>$season->id,'rank'=>$rank,'reward'=>$reward]]); } $participant->update(['reward_status'=>SeasonParticipant::REWARD_AWARDED]); }
}
