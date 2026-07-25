import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AccountPromptService {
  readonly visible = signal(false);

  promptAfterRun(hasLocalProgress: boolean, strongResult = false): void {
    if (hasLocalProgress && (strongResult || !sessionStorage.getItem('fpv.account-prompted'))) {
      this.visible.set(true);
      sessionStorage.setItem('fpv.account-prompted', '1');
    }
  }

  dismiss(): void { this.visible.set(false); }
}
