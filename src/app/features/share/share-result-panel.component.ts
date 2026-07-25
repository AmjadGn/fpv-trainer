import { Component, input, inject } from '@angular/core';
import { ShareCardService } from '../../core/online/services/share-card.service';
@Component({standalone:true,selector:'app-share-result-panel',template:`<section class="share"><strong>Share your run</strong><button (click)="download()">Download card</button></section>`,styles:[`.share{display:flex;gap:1rem;align-items:center;padding:1rem;border:1px solid var(--fpv-border)}button{padding:.5rem;background:var(--fpv-accent);border:0}`]})
export class ShareResultPanelComponent {
  readonly title=input('FPV Trainer run'); readonly detail=input('Local result'); readonly verified=input(false);
  private readonly cards=inject(ShareCardService);
  download(): void { const link=document.createElement('a'); link.download='fpv-run.png'; link.href=this.cards.create({title:this.title(),detail:this.detail(),verified:this.verified()}).toDataURL('image/png'); link.click(); }
}
