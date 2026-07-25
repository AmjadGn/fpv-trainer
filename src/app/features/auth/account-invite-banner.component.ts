import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountPromptService } from '../../core/online/services/account-prompt.service';
@Component({standalone:true,selector:'app-account-invite-banner',imports:[RouterLink],template:`@if (prompt.visible()) {<aside class="invite"><span>Keep your local progress safe across devices.</span><a routerLink="/register">Create account</a><button aria-label="Dismiss" (click)="prompt.dismiss()">×</button></aside>}`,styles:[`.invite{display:flex;gap:1rem;align-items:center;padding:.75rem 1rem;border:1px solid color-mix(in srgb,var(--fpv-accent) 55%,transparent);background:rgba(46,196,182,.08);color:var(--fpv-text)}a{color:var(--fpv-accent)}button{margin-left:auto;background:none;border:0;color:var(--fpv-text);font-size:1.3rem}`]})
export class AccountInviteBannerComponent { readonly prompt=inject(AccountPromptService); }
