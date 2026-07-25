<?php
namespace App\Domain\Integrity\Models; use Illuminate\Database\Eloquent\Model;
class ReviewQueueItem extends Model { protected $fillable=['race_run_id','user_id','reason','priority','anomaly_score','leaderboard_impact','tournament_impact','season_impact','status','reviewed_by','review_reason','reviewed_at','metadata_json']; protected function casts():array{return ['leaderboard_impact'=>'boolean','tournament_impact'=>'boolean','season_impact'=>'boolean','reviewed_at'=>'datetime','metadata_json'=>'array'];} }
