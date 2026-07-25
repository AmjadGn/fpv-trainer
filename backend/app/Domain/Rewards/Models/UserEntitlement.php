<?php
namespace App\Domain\Rewards\Models; use Illuminate\Database\Eloquent\Model;
class UserEntitlement extends Model { protected $fillable=['user_id','entitlement_type','entitlement_key','source_type','source_id','granted_at','revoked_at','metadata_json']; protected function casts():array{return ['granted_at'=>'datetime','revoked_at'=>'datetime','metadata_json'=>'array'];} }
