<?php

namespace App\Domain\Seasons\Services;

use App\Domain\Races\Models\RaceRun;
use App\Domain\Seasons\Models\Season;
use App\Domain\Seasons\Models\SeasonDivision;
use App\Domain\Seasons\Models\SeasonParticipant;
use App\Domain\Seasons\Models\SeasonRatingTransaction;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class SeasonRatingService
{
    public function applyAcceptedRun(User $user, RaceRun $run, Season $season): array
    {
        $empty = fn (string $code) => ['delta'=>0,'newRating'=>null,'divisionBefore'=>null,'divisionAfter'=>null,'promotion'=>false,'demotion'=>false,'explanationCodes'=>[$code]];
        if ($run->status === RaceRun::STATUS_SUSPICIOUS || $run->status === RaceRun::STATUS_MANUAL_REVIEW) return $empty('rating_frozen_suspicious');
        if (!$run->isAccepted()) return $empty('run_not_accepted');
        if (!($run->context_type === 'season' && (string)$run->context_id === (string)$season->id)) return $empty('run_outside_season_context');
        return DB::transaction(function () use ($user, $run, $season, $empty) {
            $participant = SeasonParticipant::where('season_id',$season->id)->where('user_id',$user->id)->lockForUpdate()->first();
            if (!$participant) $participant = app(SeasonParticipationService::class)->join($user, $season);
            $before = $participant->currentDivision;
            $placementTransaction = SeasonRatingTransaction::where('season_id', $season->id)->where('user_id', $user->id)->where('source_type', 'placement_run')->where('source_id', (string) $run->id)->first();
            $courseTransaction = SeasonRatingTransaction::where('season_id', $season->id)->where('user_id', $user->id)->where('source_type', 'season_course_best')->where('source_id', (string) $run->course_id)->first();
            if ($placementTransaction || (int) ($courseTransaction?->metadata_json['run_id'] ?? 0) === (int) $run->id) {
                return $this->result($participant, $before, $before, 0, ['already_applied']);
            }
            $participant->increment('total_ranked_runs');
            $participant->increment('accepted_ranked_runs');
            if ($participant->placement_runs_completed < 5) {
                $previous = $participant->current_rating;
                $placement = min(1800, $this->performanceRating($run));
                $completed = $participant->placement_runs_completed + 1;
                $rating = $completed === 1 ? $placement : (int) round((($participant->current_rating * ($completed - 1)) + $placement) / $completed);
                $participant->fill(['current_rating'=>$rating,'peak_rating'=>max($participant->peak_rating,$rating),'placement_runs_completed'=>$completed,'placement_status'=>$completed === 5 ? SeasonParticipant::PLACEMENT_PLACED : SeasonParticipant::PLACEMENT_PLACING]);
                $this->assignDivision($participant, $season, $rating);
                $participant->save();
                SeasonRatingTransaction::firstOrCreate(['season_id'=>$season->id,'user_id'=>$user->id,'source_type'=>'placement_run','source_id'=>(string)$run->id], ['previous_rating'=>$previous, 'delta'=>$rating - $previous, 'new_rating'=>$rating, 'reason_code'=>'placement', 'metadata_json'=>['run_id'=>$run->id]]);
                return $this->result($participant, $before, $participant->fresh()->currentDivision, $rating - $previous, ['placement_run']);
            }
            $best = RaceRun::where('user_id',$user->id)->where('course_id',$run->course_id)->where('status',RaceRun::STATUS_ACCEPTED)->where('context_type','season')->where('context_id',$season->id)->min('duration_ms');
            if ($best === null || $run->duration_ms > $best) return $this->result($participant, $before, $before, 0, ['slower_duplicate']);
            $source = SeasonRatingTransaction::where('season_id',$season->id)->where('user_id',$user->id)->where('source_type','season_course_best')->where('source_id',(string)$run->course_id)->lockForUpdate()->first();
            $candidate = max(0, (int) round(($this->performanceRating($run) - 1000) / 8));
            $todayGain = SeasonRatingTransaction::where('season_id',$season->id)->where('user_id',$user->id)->where('delta','>',0)->whereDate('created_at', today())->sum('delta');
            $delta = min($candidate, max(0, 50 - $todayGain));
            if ($delta === 0) return $this->result($participant, $before, $before, 0, ['daily_gain_cap']);
            $previous = $participant->current_rating; $new = $previous + $delta;
            $participant->fill(['current_rating'=>$new,'peak_rating'=>max($participant->peak_rating,$new)]); $this->assignDivision($participant, $season, $new); $participant->save();
            SeasonRatingTransaction::updateOrCreate(['season_id'=>$season->id,'user_id'=>$user->id,'source_type'=>'season_course_best','source_id'=>(string)$run->course_id], ['previous_rating'=>$previous,'delta'=>$delta,'new_rating'=>$new,'reason_code'=>'course_best','metadata_json'=>['run_id'=>$run->id,'duration_ms'=>$run->duration_ms]]);
            return $this->result($participant, $before, $participant->fresh()->currentDivision, $delta, ['course_personal_best']);
        });
    }
    private function performanceRating(RaceRun $run): int { $reference = (int) ($run->client_metadata['reference_duration_ms'] ?? $run->client_metadata['reference_ms'] ?? 60000); return max(0, min(2400, (int) round(1000 * $reference / max(1, $run->duration_ms)))); }
    private function assignDivision(SeasonParticipant $participant, Season $season, int $rating): void { $division = SeasonDivision::where('season_id',$season->id)->where('enabled',true)->where('minimum_rating','<=',$rating)->where(fn($q)=>$q->whereNull('maximum_rating')->orWhere('maximum_rating','>=',$rating))->orderByDesc('minimum_rating')->first(); if (!$division) return; $highest = $participant->highestDivision; if ($highest && $division->order < $highest->order && (!$participant->demotion_protection_until || $participant->demotion_protection_until->isFuture())) $division = $highest; $participant->current_division_id=$division->id; if (!$highest || $division->order > $highest->order) { $participant->highest_division_id=$division->id; $participant->last_promotion_at=now(); $participant->demotion_protection_until=now()->addDays(7); } }
    private function result(SeasonParticipant $p, ?SeasonDivision $before, ?SeasonDivision $after, int $delta, array $codes): array { return ['delta'=>$delta,'newRating'=>$p->current_rating,'divisionBefore'=>$before?->key,'divisionAfter'=>$after?->key,'promotion'=>$before && $after && $after->order > $before->order,'demotion'=>$before && $after && $after->order < $before->order,'explanationCodes'=>$codes]; }
}
