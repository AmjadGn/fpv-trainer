import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MissionPhotographyHudComponent } from './mission-photography-hud.component';

describe('MissionPhotographyHudComponent', () => {
  let fixture: ComponentFixture<MissionPhotographyHudComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissionPhotographyHudComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(MissionPhotographyHudComponent);
  });

  it('disables the shutter while inactive or pending', () => {
    fixture.componentRef.setInput('captureEnabled', false);
    fixture.componentRef.setInput('capturePending', false);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '[data-testid="mission-shutter"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fixture.componentRef.setInput('captureEnabled', true);
    fixture.componentRef.setInput('capturePending', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    fixture.componentRef.setInput('capturePending', false);
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('emits captureRequested when the shutter is pressed', () => {
    fixture.componentRef.setInput('captureEnabled', true);
    fixture.detectChanges();
    let emitted = false;
    fixture.componentInstance.captureRequested.subscribe(() => {
      emitted = true;
    });
    const button = fixture.nativeElement.querySelector(
      '[data-testid="mission-shutter"]',
    ) as HTMLButtonElement;
    button.click();
    expect(emitted).toBe(true);
  });

  it('shows objective index and keyboard hint', () => {
    fixture.componentRef.setInput('missionTitle', 'Coastal Ruins Survey');
    fixture.componentRef.setInput('objectiveTitle', 'Photograph the stone sea arch');
    fixture.componentRef.setInput('objectiveNumber', 1);
    fixture.componentRef.setInput('objectiveCount', 3);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Coastal Ruins Survey');
    expect(text).toContain('Objective 1 of 3');
    expect(text).toContain('V');
  });
});
