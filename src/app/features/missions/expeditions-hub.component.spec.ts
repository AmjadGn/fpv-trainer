import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppShellService } from '../../core/shell/app-shell.service';
import { ExpeditionsHubComponent } from './expeditions-hub.component';

describe('ExpeditionsHubComponent', () => {
  let fixture: ComponentFixture<ExpeditionsHubComponent>;
  let shell: AppShellService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpeditionsHubComponent],
      providers: [AppShellService],
    }).compileComponents();
    shell = TestBed.inject(AppShellService);
    fixture = TestBed.createComponent(ExpeditionsHubComponent);
    fixture.detectChanges();
  });

  it('shows a truthful empty / unavailable state', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Expedition content is not installed in this build.');
    expect(text).not.toMatch(/best score|medal|complete the mediterranean/i);
  });

  it('navigates back to Fly', () => {
    shell.showExpeditions();
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    ) as HTMLButtonElement;
    button.click();
    expect(shell.view()).toBe('fly');
  });
});
