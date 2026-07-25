<?php

namespace App\Domain\Seasons\Services;

use App\Domain\Seasons\Models\Season;
use Illuminate\Support\Collection;

class SeasonQueryService
{
    public function current(): ?Season { return Season::where('is_primary',true)->whereIn('status',[Season::STATUS_ACTIVE,Season::STATUS_REGISTRATION])->orderByRaw("status = 'active' desc")->first(); }
    public function bySlug(string $slug): ?Season { return Season::where('slug',$slug)->first(); }
    public function history(): Collection { return Season::where('status',Season::STATUS_COMPLETED)->orderByDesc('ends_at')->get(); }
}
