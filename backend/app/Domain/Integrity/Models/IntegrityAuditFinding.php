<?php
namespace App\Domain\Integrity\Models; use Illuminate\Database\Eloquent\Model;
class IntegrityAuditFinding extends Model { const UPDATED_AT=null; protected $fillable=['integrity_audit_run_id','severity','subject_type','subject_id','details_json','repaired','created_at']; protected function casts():array{return ['details_json'=>'array','repaired'=>'boolean','created_at'=>'datetime'];} }
