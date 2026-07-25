<?php
namespace App\Domain\Retention; use Illuminate\Database\Eloquent\Model;
class ParticipationStreak extends Model { protected $fillable=['user_id','current_streak','longest_streak','last_qualifying_date','active_competitive_days','daily_challenge_days']; protected function casts():array{return ['last_qualifying_date'=>'date'];} }
