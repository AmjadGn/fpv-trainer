import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
@Component({standalone:true,template:`<main class="online-page"><p class="eyebrow">Public pilot card</p><h1>{{username}}</h1><section class="panel">Public statistics are loaded when the profile service is available.</section></main>`,styles:[`.online-page{width:min(900px,calc(100% - 2rem));margin:3rem auto}.eyebrow{color:var(--fpv-accent)}.panel{padding:1.5rem;border:1px solid var(--fpv-border);background:var(--fpv-panel)}`]})
export class PublicPilotComponent { readonly username=inject(ActivatedRoute).snapshot.paramMap.get('username')??'Pilot'; }
