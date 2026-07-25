<?php
namespace App\Domain\Integrity\Models; use Illuminate\Database\Eloquent\Model;
class IntegrityAuditRun extends Model { protected $fillable=['audit_type','dry_run','status','findings_count','repairs_count','summary_json','started_by','started_at','completed_at']; protected function casts():array{return ['dry_run'=>'boolean','summary_json'=>'array','started_at'=>'datetime','completed_at'=>'datetime'];} }
