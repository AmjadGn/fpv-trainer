import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
@Component({standalone:true,template:`<main class="online-page"><p class="eyebrow">Read-only replay</p><h1>Replay viewer</h1><section class="panel"><p>Replay ID: {{id}}</p><p>The replay metadata is available publicly. Full 3D playback will be added after replay verification wiring.</p></section></main>`,styles:[`.online-page{width:min(900px,calc(100% - 2rem));margin:3rem auto}.eyebrow{color:var(--fpv-accent)}.panel{padding:1.5rem;border:1px solid var(--fpv-border);background:var(--fpv-panel)}`]})
export class PublicReplayComponent { readonly id=inject(ActivatedRoute).snapshot.paramMap.get('publicId')??''; }
