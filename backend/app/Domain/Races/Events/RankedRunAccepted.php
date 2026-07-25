<?php
namespace App\Domain\Races\Events; use App\Domain\Races\Models\RaceRun; use Illuminate\Foundation\Events\Dispatchable; use Illuminate\Queue\SerializesModels;
class RankedRunAccepted { use Dispatchable,SerializesModels; public function __construct(public readonly RaceRun $run){} }
