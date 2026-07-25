import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ControllerCalibrationService } from './core/controller/services/controller-calibration.service';
import { TrainerSessionService } from './core/session/services/trainer-session.service';
import { TrainerSettingsService } from './core/settings/services/trainer-settings.service';
import { AppShellService } from './core/shell/app-shell.service';
import { AcademyComponent } from './features/academy/academy.component';
import { ControllerCalibrationComponent } from './features/controller-calibration/controller-calibration.component';
import { CoursesComponent } from './features/courses/courses.component';
import { EnvironmentsComponent } from './features/environments/environments.component';
import { FlightComponent } from './features/flight/flight.component';
import { HangarComponent } from './features/hangar/hangar.component';
import { HomeComponent } from './features/home/home.component';
import { LearnHubComponent } from './features/learn/learn-hub.component';
import { FlyHubComponent } from './features/fly/fly-hub.component';
import { OnboardingComponent } from './features/onboarding/onboarding.component';
import { FeedbackComponent } from './features/feedback/feedback.component';
import { PrivacyCenterComponent } from './features/privacy/privacy-center.component';
import { DiagnosticsPanelComponent } from './features/diagnostics/diagnostics-panel.component';
import { AchievementToastComponent } from './features/progression/achievement-toast.component';
import { WeatherChallengesComponent } from './features/weather-challenges/weather-challenges.component';
import { AccountInviteBannerComponent } from './features/auth/account-invite-banner.component';
import { AuthSessionService } from './core/auth/services/auth-session.service';
import { NetworkStatusService } from './core/network/network-status.service';
import { FeatureFlagService } from './core/features/services/feature-flag.service';
import { NotificationApiService } from './core/notifications/services/notification-api.service';
import { ShellLayoutService } from './shared/layout/shell-layout.service';
import { FpvIconComponent } from './shared/ui/fpv-icon.component';
import { FpvNetworkStatusComponent } from './shared/ui/fpv-network-status.component';
import { FpvDialogComponent } from './shared/ui/fpv-dialog.component';
import { SettingsHubComponent } from './features/settings/settings-hub.component';
import { ProductAnalyticsService } from './core/analytics/product-analytics.service';
import { AnalyticsEvents } from './core/analytics/analytics-events';
import { ErrorReporterService } from './core/error-reporting/error-reporter.service';
import { BrowserCapabilityService } from './core/browser/browser-capability.service';
import type { FpvIconName } from './shared/icons/fpv-icons';

interface ShellNavItem {
  id: string;
  label: string;
  icon: FpvIconName;
  kind: 'view' | 'route' | 'action';
  view?: string;
  route?: string;
  primary?: boolean;
  feature?: 'seasons' | 'tournaments' | 'ghostEvents';
  authOnly?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [
    HomeComponent,
    LearnHubComponent,
    FlyHubComponent,
    OnboardingComponent,
    FeedbackComponent,
    PrivacyCenterComponent,
    DiagnosticsPanelComponent,
    HangarComponent,
    CoursesComponent,
    EnvironmentsComponent,
    WeatherChallengesComponent,
    AcademyComponent,
    ControllerCalibrationComponent,
    FlightComponent,
    AchievementToastComponent,
    AccountInviteBannerComponent,
    SettingsHubComponent,
    RouterOutlet,
    FpvIconComponent,
    FpvNetworkStatusComponent,
    FpvDialogComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly shell = inject(AppShellService);
  protected readonly layout = inject(ShellLayoutService);
  protected readonly auth = inject(AuthSessionService);
  protected readonly network = inject(NetworkStatusService);
  protected readonly features = inject(FeatureFlagService);
  protected readonly notifications = inject(NotificationApiService);
  private readonly calibration = inject(ControllerCalibrationService);
  private readonly session = inject(TrainerSessionService);
  private readonly trainerSettings = inject(TrainerSettingsService);
  private readonly router = inject(Router);
  private readonly analytics = inject(ProductAnalyticsService);
  private readonly errorReporter = inject(ErrorReporterService);
  private readonly browserCaps = inject(BrowserCapabilityService);
  protected readonly onlineRoute = signal(isOnlinePath(this.router.url));
  protected readonly currentPath = signal(normalizePath(this.router.url));
  protected readonly shellChromeHidden = computed(() => {
    const path = this.currentPath();
    return path === '/' || path === '';
  });

  protected readonly flightMode = computed(
    () => !this.onlineRoute() && this.shell.view() === 'flight',
  );

  protected readonly primaryNav: ShellNavItem[] = [
    { id: 'home', label: 'Home', icon: 'home', kind: 'view', view: 'home', primary: true },
    { id: 'learn', label: 'Learn', icon: 'academy', kind: 'view', view: 'learn', primary: true },
    { id: 'fly', label: 'Fly', icon: 'fly', kind: 'view', view: 'fly', primary: true },
    { id: 'compete', label: 'Compete', icon: 'compete', kind: 'route', route: '/compete', primary: true },
  ];

  protected readonly secondaryNav: ShellNavItem[] = [
    { id: 'hangar', label: 'Hangar', icon: 'fly', kind: 'view', view: 'hangar' },
    { id: 'academy', label: 'Academy', icon: 'academy', kind: 'view', view: 'academy' },
    { id: 'replays', label: 'Replays', icon: 'replay', kind: 'action' },
    { id: 'leaderboards', label: 'Leaderboards', icon: 'leaderboard', kind: 'route', route: '/leaderboards' },
    { id: 'locker', label: 'Locker', icon: 'locker', kind: 'route', route: '/locker' },
    { id: 'feedback', label: 'Feedback', icon: 'info', kind: 'view', view: 'feedback' },
    { id: 'profile', label: 'Profile', icon: 'profile', kind: 'route', route: '/profile', authOnly: true },
    { id: 'settings', label: 'Settings', icon: 'settings', kind: 'view', view: 'settings' },
  ];

  protected readonly competeChildren: ShellNavItem[] = [
    { id: 'season', label: 'Season', icon: 'season', kind: 'route', route: '/season', feature: 'seasons' },
    { id: 'tournaments', label: 'Tournaments', icon: 'tournament', kind: 'route', route: '/tournaments', feature: 'tournaments' },
    { id: 'ghost-events', label: 'Ghost Events', icon: 'ghost', kind: 'route', route: '/ghost-events', feature: 'ghostEvents' },
  ];

  protected readonly competeOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.onlineRoute.set(isOnlinePath(event.urlAfterRedirects));
        this.currentPath.set(normalizePath(event.urlAfterRedirects));
        this.errorReporter.setRoute(normalizePath(event.urlAfterRedirects));
        if (event.urlAfterRedirects.startsWith('/season')
          || event.urlAfterRedirects.startsWith('/tournaments')
          || event.urlAfterRedirects.startsWith('/ghost-events')
          || event.urlAfterRedirects.startsWith('/compete')) {
          this.competeOpen.set(true);
        }
      });
    this.features.load().subscribe();
    this.auth.restoreSession().subscribe(() => this.refreshNotifications());
    this.browserCaps.refresh();
    const caps = this.browserCaps.capabilities();
    this.analytics.track(AnalyticsEvents.appOpened, { support: caps.status });
    if (caps.status === 'unsupported') {
      this.analytics.track(AnalyticsEvents.unsupportedBrowserDetected, {
        blockers: caps.blockers,
      });
    }
    this.analytics.track(AnalyticsEvents.appReady, {});
    if (typeof window !== 'undefined') {
      window.setInterval(() => this.refreshNotifications(), 60_000);
      window.addEventListener('unhandledrejection', (event) => {
        this.errorReporter.report(event.reason, 'promise');
      });
    }
  }

  protected isNavActive(item: ShellNavItem): boolean {
    if (this.onlineRoute()) {
      if (item.kind === 'route' && item.route) {
        if (item.route === '/compete') {
          const p = this.currentPath();
          return p === '/compete' || p.startsWith('/season') || p.startsWith('/tournaments') || p.startsWith('/ghost-events');
        }
        return this.currentPath() === item.route || this.currentPath().startsWith(item.route + '/');
      }
      return false;
    }
    if (item.kind === 'view' && item.view) {
      if (item.view === 'fly') {
        return (
          this.shell.view() === 'fly' ||
          this.shell.view() === 'courses' ||
          this.shell.view() === 'environments' ||
          this.shell.view() === 'challenges' ||
          this.shell.view() === 'hangar'
        );
      }
      if (item.view === 'learn') {
        return (
          this.shell.view() === 'learn' ||
          this.shell.view() === 'academy' ||
          this.shell.view() === 'onboarding' ||
          this.shell.view() === 'calibration'
        );
      }
      return this.shell.view() === item.view;
    }
    return false;
  }

  protected isFeatureVisible(item: ShellNavItem): boolean {
    if (item.authOnly && !this.auth.isAuthenticated()) {
      return false;
    }
    if (item.feature === 'seasons') {
      return this.features.seasonsEnabled();
    }
    if (item.feature === 'tournaments') {
      return this.features.tournamentsEnabled();
    }
    if (item.feature === 'ghostEvents') {
      return this.features.ghostEventsEnabled();
    }
    return true;
  }

  protected onNav(item: ShellNavItem): void {
    this.layout.closeMobileMore();
    if (item.id === 'replays') {
      this.showLatestReplay();
      return;
    }
    if (item.id === 'compete') {
      this.competeOpen.update((v) => !v);
      this.openOnline('/compete');
      return;
    }
    if (item.kind === 'route' && item.route) {
      this.openOnline(item.route);
      return;
    }
    if (item.view === 'home') {
      this.showHome();
    } else if (item.view === 'learn') {
      this.showLearn();
    } else if (item.view === 'fly') {
      this.showFlyHub();
    } else if (item.view === 'hangar') {
      this.showHangar();
    } else if (item.view === 'courses') {
      this.showCourses();
    } else if (item.view === 'academy') {
      this.showAcademy();
    } else if (item.view === 'challenges') {
      this.showChallenges();
    } else if (item.view === 'settings') {
      this.showSettings();
    } else if (item.view === 'feedback') {
      this.showFeedback();
    } else if (item.view === 'environments') {
      this.showEnvironments();
    }
  }

  protected showHome(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showHome();
  }

  protected showLearn(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showLearn();
  }

  protected showFlyHub(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showFly();
  }

  protected showFeedback(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showFeedback();
    this.layout.closeMobileMore();
  }

  protected showHangar(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showHangar();
  }

  protected showCourses(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showCourses();
  }

  protected showEnvironments(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showEnvironments();
  }

  protected showChallenges(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showChallenges();
  }

  protected showAcademy(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showAcademy();
  }

  protected showDiagnostics(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showDiagnostics();
    this.layout.closeMobileMore();
  }

  protected showCalibration(): void {
    void this.router.navigateByUrl('/app');
    this.calibration.openWelcomeOrComplete();
    this.shell.showCalibration();
    this.layout.closeMobileMore();
  }

  protected showSettings(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showSettings();
  }

  protected showFlight(): void {
    void this.router.navigateByUrl('/app');
    if (this.trainerSettings.settings().autoFullscreenOnFlight) {
      this.session.armAutoFullscreen();
    }
    this.shell.showFlight({ kind: 'free' });
  }

  protected showLatestReplay(): void {
    void this.router.navigateByUrl('/app');
    this.shell.showFlight({ kind: 'replay' });
  }

  protected openOnline(path: string): void {
    void this.router.navigateByUrl(path);
  }

  protected openAccount(): void {
    this.openOnline(this.auth.isAuthenticated() ? '/account' : '/login');
    this.layout.closeMobileMore();
  }

  protected openNotifications(): void {
    this.openOnline('/notifications');
    this.layout.closeMobileMore();
  }

  protected exitFlight(): void {
    this.showHome();
  }

  private refreshNotifications(): void {
    if (this.auth.isAuthenticated() && this.network.online()) {
      this.notifications.fetch().subscribe();
    }
  }
}

function isOnlinePath(url: string): boolean {
  const path = normalizePath(url);
  // Product shell lives at /app. Landing and all other routes use the outlet.
  return path !== '/app';
}

function normalizePath(url: string): string {
  return url.split('?')[0]?.split('#')[0] ?? '';
}
