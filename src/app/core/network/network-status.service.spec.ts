import { NetworkStatusService } from './network-status.service';

describe('NetworkStatusService', () => {
  it('tracks browser offline events', () => {
    const service = new NetworkStatusService();
    window.dispatchEvent(new Event('offline'));
    expect(service.offline()).toBe(true);
  });
});
