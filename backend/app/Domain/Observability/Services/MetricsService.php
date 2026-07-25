<?php
namespace App\Domain\Observability\Services; use Illuminate\Support\Facades\DB;
class MetricsService { public function increment(string $key,int $by=1,string $period='all',array $metadata=[]):void{DB::table('operational_metrics')->upsert([['metric_key'=>$key,'period'=>$period,'value'=>$by,'metadata_json'=>json_encode($metadata),'updated_at'=>now()]],['metric_key','period'],['value'=>DB::raw('value + '.max(1,$by)),'metadata_json','updated_at']);} }
