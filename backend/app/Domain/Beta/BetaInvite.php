<?php
namespace App\Domain\Beta; use Illuminate\Database\Eloquent\Model;
class BetaInvite extends Model { protected $fillable=['code','usage_limit','usage_count','expires_at','email_binding','campaign','source','enabled','metadata_json']; protected function casts():array{return ['expires_at'=>'datetime','enabled'=>'boolean','metadata_json'=>'array'];} }
