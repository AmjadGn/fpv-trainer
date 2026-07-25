import { Component } from '@angular/core';
@Component({standalone:true,template:`<main class="online-page"><h1>Run history</h1><section class="panel"><p>Your verified and local runs will appear here after sync.</p></section></main>`,styles:[`.online-page{width:min(900px,calc(100% - 2rem));margin:3rem auto}.panel{padding:1.5rem;border:1px solid var(--fpv-border);background:var(--fpv-panel)}`]})
export class RunsHistoryComponent {}
