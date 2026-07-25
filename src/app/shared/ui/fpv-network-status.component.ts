import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NetworkStatusService } from '../../core/network/network-status.service';
import { FpvBadgeComponent } from './fpv-badge.component';
import { FpvIconComponent } from './fpv-icon.component';

@Component({
  selector: 'fpv-network-status',
  standalone: true,
  imports: [FpvBadgeComponent, FpvIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fpv-badge [tone]="tone()" [attr.title]="detail()">
      <fpv-icon [name]="icon()" [size]="12" />
      {{ label() }}
      @if (pending() > 0) {
        · {{ pending() }} pending
      }
    </fpv-badge>
  `,
})
export class FpvNetworkStatusComponent {
  private readonly network = inject(NetworkStatusService);

  protected readonly pending = this.network.pendingSubmissions;

  protected readonly label = computed(() => {
    if (this.network.sessionExpired()) {
      return 'Session expired';
    }
    if (this.network.offline()) {
      return 'Offline';
    }
    if (this.network.reconnecting()) {
      return 'Reconnecting';
    }
    if (this.network.apiUnavailable()) {
      return 'API unavailable';
    }
    return 'Online';
  });

  protected readonly detail = computed(() => {
    if (this.network.offline()) {
      return 'Local flying remains available. Online features will resume when connected.';
    }
    if (this.network.apiUnavailable()) {
      return 'The competitive API is unreachable. Cached data may be shown.';
    }
    return this.label();
  });

  protected readonly tone = computed(() => {
    if (this.network.sessionExpired() || this.network.apiUnavailable()) {
      return 'warning' as const;
    }
    if (this.network.offline() || this.network.reconnecting()) {
      return 'offline' as const;
    }
    return 'success' as const;
  });

  protected readonly icon = computed(() => {
    if (this.network.offline() || this.network.reconnecting()) {
      return 'offline' as const;
    }
    if (this.network.apiUnavailable() || this.network.sessionExpired()) {
      return 'warning' as const;
    }
    return 'success' as const;
  });
}
