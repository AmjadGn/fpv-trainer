<?php
namespace App\Domain\Cosmetics\Models; use Illuminate\Database\Eloquent\Model;
class UserLoadout extends Model { protected $fillable=['user_id','category','cosmetic_key']; }
