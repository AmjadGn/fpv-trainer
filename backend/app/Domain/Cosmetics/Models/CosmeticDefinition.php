<?php
namespace App\Domain\Cosmetics\Models; use Illuminate\Database\Eloquent\Model;
class CosmeticDefinition extends Model { protected $fillable=['key','category','name','description','preview_json','material_preset_json','default_owned','enabled']; protected function casts():array{return ['preview_json'=>'array','material_preset_json'=>'array','default_owned'=>'boolean','enabled'=>'boolean'];} }
