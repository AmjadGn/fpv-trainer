import { TestBed } from '@angular/core/testing';

import { MissionPhotographyHudComponent } from './mission-photography-hud.component';

describe('MissionPhotographyHudComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MissionPhotographyHudComponent] });
  });

  function shutterButton(fixture: ReturnType<typeof TestBed.createComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('[data-testid="mission-shutter"]') as HTMLButtonElement;
  }

  it('disables the shutter when capture is not enabled', () => {
    const fixture = TestBed.createComponent(MissionPhotographyHudComponent);
    fixture.componentRef.setInput('captureEnabled', false);
    fixture.componentRef.setInput('capturePending', false);
    fixture.detectChanges();

    expect(shutterButton(fixture).disabled).toBe(true);
  });

  it('disables the shutter while a capture is pending, even when otherwise enabled', () => {
    const fixture = TestBed.createComponent(MissionPhotographyHudComponent);
    fixture.componentRef.setInput('captureEnabled', true);
    fixture.componentRef.setInput('capturePending', true);
    fixture.detectChanges();

    expect(shutterButton(fixture).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toMatch(/Capturing/);
  });

  it('enables the shutter only when capture is enabled and not pending', () => {
    const fixture = TestBed.createComponent(MissionPhotographyHudComponent);
    fixture.componentRef.setInput('captureEnabled', true);
    fixture.componentRef.setInput('capturePending', false);
    fixture.detectChanges();

    expect(shutterButton(fixture).disabled).toBe(false);
  });

  it('emits captureRequested exactly once per shutter click', () => {
    const fixture = TestBed.createComponent(MissionPhotographyHudComponent);
    fixture.componentRef.setInput('captureEnabled', true);
    fixture.detectChanges();

    let emitted = 0;
    fixture.componentInstance.captureRequested.subscribe(() => {
      emitted += 1;
    });

    shutterButton(fixture).click();
    expect(emitted).toBe(1);

    shutterButton(fixture).click();
    expect(emitted).toBe(2);
  });

  it('does not emit when the disabled shutter is clicked', () => {
    const fixture = TestBed.createComponent(MissionPhotographyHudComponent);
    fixture.componentRef.setInput('captureEnabled', false);
    fixture.detectChanges();

    let emitted = 0;
    fixture.componentInstance.captureRequested.subscribe(() => {
      emitted += 1;
    });

    shutterButton(fixture).click();
    expect(emitted).toBe(0);
  });

  it('maps feedback codes to pilot-readable text rather than raw domain codes', () => {
    const fixture = TestBed.createComponent(MissionPhotographyHudComponent);
    fixture.componentRef.setInput('feedbackCodes', ['HOLD_STEADY', 'TOO_LOW']);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toMatch(/Hold steady/);
    expect(text).toMatch(/Climb higher/);
    expect(text).not.toMatch(/HOLD_STEADY/);
  });
});
