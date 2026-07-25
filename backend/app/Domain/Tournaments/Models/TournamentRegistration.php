<?php
namespace App\Domain\Tournaments\Models; use App\Models\User; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\BelongsTo;
class TournamentRegistration extends Model { protected $fillable=['tournament_id','user_id','registered_at']; protected function casts(): array { return ['registered_at'=>'datetime']; } public function tournament(): BelongsTo{return $this->belongsTo(Tournament::class);} public function user(): BelongsTo{return $this->belongsTo(User::class);} }
