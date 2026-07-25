<?php
namespace App\Domain\Notifications\Models; use Illuminate\Database\Eloquent\Model;
class UserNotification extends Model { const UPDATED_AT=null; protected $fillable=['user_id','type','title','body','action_url','read_at','metadata_json','expires_at','created_at']; protected function casts():array{return ['read_at'=>'datetime','expires_at'=>'datetime','created_at'=>'datetime','metadata_json'=>'array'];} }
