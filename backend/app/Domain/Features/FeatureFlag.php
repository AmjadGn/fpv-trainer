<?php
namespace App\Domain\Features; use Illuminate\Database\Eloquent\Model;
class FeatureFlag extends Model { protected $fillable=['key','enabled','targeting','targeting_config_json','description']; protected function casts():array{return ['enabled'=>'boolean','targeting_config_json'=>'array'];} }
