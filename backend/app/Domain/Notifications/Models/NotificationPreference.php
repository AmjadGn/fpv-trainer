<?php
namespace App\Domain\Notifications\Models; use Illuminate\Database\Eloquent\Model;
class NotificationPreference extends Model { protected $fillable=['user_id','email_security','email_tournament_reminder','email_season_ending','email_weekly_summary','email_engagement_opt_in','unsubscribe_token']; protected function casts():array{return ['email_security'=>'boolean','email_tournament_reminder'=>'boolean','email_season_ending'=>'boolean','email_weekly_summary'=>'boolean','email_engagement_opt_in'=>'boolean'];} }
