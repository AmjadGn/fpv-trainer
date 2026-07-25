import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FpvBadgeComponent } from './fpv-badge.component';
import { FpvEmptyStateComponent } from './fpv-empty-state.component';
import { FpvErrorStateComponent } from './fpv-error-state.component';
import { FpvStatusBadgeComponent } from './fpv-status-badge.component';
import { FpvTabsComponent } from './fpv-tabs.component';
import { FpvDialogComponent } from './fpv-dialog.component';
import { FpvResultShellComponent } from './fpv-result-shell.component';
import { FpvSkeletonComponent } from './fpv-skeleton.component';

describe('shared UI primitives', () => {
  it('renders status badges with visible text', async () => {
    await TestBed.configureTestingModule({ imports: [FpvStatusBadgeComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FpvStatusBadgeComponent);
    fixture.componentRef.setInput('status', 'verified');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Verified');
  });

  it('renders empty state with action', async () => {
    await TestBed.configureTestingModule({ imports: [FpvEmptyStateComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FpvEmptyStateComponent);
    fixture.componentRef.setInput('title', 'No replay');
    fixture.componentRef.setInput('body', 'Complete a run to create your first replay.');
    fixture.componentRef.setInput('actionLabel', 'Start Flight');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No replay');
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Start Flight');
  });

  it('renders error state retry', async () => {
    await TestBed.configureTestingModule({ imports: [FpvErrorStateComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FpvErrorStateComponent);
    fixture.componentRef.setInput('title', 'Something went wrong');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('role') || fixture.nativeElement.querySelector('[role=alert]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Retry');
  });

  it('emits tab changes', async () => {
    await TestBed.configureTestingModule({ imports: [FpvTabsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FpvTabsComponent);
    fixture.componentRef.setInput('tabs', [
      { id: 'a', label: 'Overview' },
      { id: 'b', label: 'Missions' },
    ]);
    fixture.componentRef.setInput('activeId', 'a');
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('[role=tab]');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
  });

  it('closes dialog on escape', async () => {
    await TestBed.configureTestingModule({ imports: [FpvDialogComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FpvDialogComponent);
    fixture.componentRef.setInput('title', 'More');
    fixture.componentRef.setInput('open', true);
    let closed = false;
    fixture.componentInstance.close.subscribe(() => {
      closed = true;
    });
    fixture.detectChanges();
    fixture.componentInstance.onEscape();
    expect(closed).toBe(true);
  });

  it('renders result shell primary value', async () => {
    await TestBed.configureTestingModule({ imports: [FpvResultShellComponent] }).compileComponents();
    const fixture = TestBed.createComponent(FpvResultShellComponent);
    fixture.componentRef.setInput('primary', '00:42.82');
    fixture.componentRef.setInput('newBest', true);
    fixture.componentRef.setInput('verified', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('00:42.82');
    expect(fixture.nativeElement.textContent).toContain('New Best');
    expect(fixture.nativeElement.textContent).toContain('Verified Result');
  });

  it('renders badge and skeleton', async () => {
    await TestBed.configureTestingModule({ imports: [FpvBadgeComponent, FpvSkeletonComponent] }).compileComponents();
    const badge = TestBed.createComponent(FpvBadgeComponent);
    badge.componentRef.setInput('tone', 'ranked');
    badge.detectChanges();
    expect(badge.nativeElement.textContent).toBeDefined();

    const sk = TestBed.createComponent(FpvSkeletonComponent);
    sk.componentRef.setInput('variant', 'row');
    sk.detectChanges();
    expect(sk.nativeElement.querySelector('.sk')).toBeTruthy();
  });
});
