<?php
namespace App\Domain\Integrity\Services; use App\Domain\Replays\Models\ReplayRecord; use App\Domain\Replays\Services\ReplayStorageService;
class ReplayIntegrityService { public function __construct(private readonly ReplayStorageService $storage){} public function check(ReplayRecord $replay):bool{try{$payload=$this->storage->retrieve($replay);$ok=is_array($payload)&&!empty($payload);$replay->update(['integrity_ok'=>$ok,'integrity_checked_at'=>now()]);return $ok;}catch(\Throwable){$replay->update(['integrity_ok'=>false,'integrity_checked_at'=>now()]);return false;}} }
