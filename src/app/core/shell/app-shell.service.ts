import { Injectable, signal } from '@angular/core';

export type AppView =
  | 'home'
  | 'learn'
  | 'fly'
  | 'courses'
  | 'environments'
  | 'challenges'
  | 'academy'
  | 'diagnostics'
  | 'calibration'
  | 'settings'
  | 'privacy'
  | 'feedback'
  | 'onboarding'
  | 'leaderboards'
  | 'account'
  | 'profile'
  | 'sync'
  | 'online-challenges'
  | 'hangar'
  | 'builder'
  | 'flight';

export type FlightLaunchIntent =
  | { kind: 'free'; aircraftId?: string }
  | {
      kind: 'race';
      courseId: string;
      weatherPresetId?: string;
      challengeId?: string;
      ranked?: boolean;
      aircraftId?: string;
      rankedSession?: { id: string; nonce: string; environmentId: string; weatherPresetId: string; rulesVersion: number; expiresAt: string };
    }
  | { kind: 'training'; moduleId: string; aircraftId?: string }
  | { kind: 'replay' }
  | { kind: 'test-flight'; aircraftId: string };

/**
 * Shell navigation for the trainer SPA (no feature routes).
 */
@Injectable({ providedIn: 'root' })
export class AppShellService {
  readonly view = signal<AppView>('home');
  readonly flightIntent = signal<FlightLaunchIntent | null>(null);

  showHome(): void {
    this.view.set('home');
    this.flightIntent.set(null);
  }

  showLearn(): void {
    this.view.set('learn');
  }

  showFly(): void {
    this.view.set('fly');
  }

  showOnboarding(): void {
    this.view.set('onboarding');
  }

  showFeedback(): void {
    this.view.set('feedback');
  }

  showPrivacy(): void {
    this.view.set('privacy');
  }

  showCourses(): void {
    this.view.set('courses');
  }

  showEnvironments(): void {
    this.view.set('environments');
  }

  showChallenges(): void {
    this.view.set('challenges');
  }

  showAcademy(): void {
    this.view.set('academy');
  }

  showDiagnostics(): void {
    this.view.set('diagnostics');
  }

  showCalibration(): void {
    this.view.set('calibration');
  }

  showSettings(): void {
    this.view.set('settings');
  }

  showLeaderboards(): void { this.view.set('leaderboards'); }
  showAccount(): void { this.view.set('account'); }
  showProfile(): void { this.view.set('profile'); }
  showSync(): void { this.view.set('sync'); }
  showOnlineChallenges(): void { this.view.set('online-challenges'); }

  showHangar(): void {
    this.view.set('hangar');
  }

  showBuilder(): void {
    this.view.set('builder');
  }

  showFlight(intent?: FlightLaunchIntent): void {
    if (intent) {
      this.flightIntent.set(intent);
    }
    this.view.set('flight');
  }

  consumeFlightIntent(): FlightLaunchIntent | null {
    const intent = this.flightIntent();
    this.flightIntent.set(null);
    return intent;
  }
}
