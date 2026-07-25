import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FpvBadgeComponent, type FpvBadgeTone } from './fpv-badge.component';

export type FpvStatusKind =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'offline'
  | 'ahead'
  | 'behind'
  | 'local'
  | 'ranked';

const STATUS_MAP: Record<FpvStatusKind, { label: string; tone: FpvBadgeTone }> = {
  verified: { label: 'Verified', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  offline: { label: 'Offline', tone: 'offline' },
  ahead: { label: 'Ahead', tone: 'success' },
  behind: { label: 'Behind', tone: 'danger' },
  local: { label: 'Local Result', tone: 'neutral' },
  ranked: { label: 'Ranked', tone: 'ranked' },
};

@Component({
  selector: 'fpv-status-badge',
  standalone: true,
  imports: [FpvBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<fpv-badge [tone]="meta.tone">{{ meta.label }}</fpv-badge>`,
})
export class FpvStatusBadgeComponent {
  @Input({ required: true }) status!: FpvStatusKind;

  protected get meta() {
    return STATUS_MAP[this.status] ?? STATUS_MAP.local;
  }
}
