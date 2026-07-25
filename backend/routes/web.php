<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Health\HealthController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/health', [HealthController::class, 'health']);
Route::get('/health/ready', [HealthController::class, 'ready']);
