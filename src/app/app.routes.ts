import { Routes } from '@angular/router';
import { optionalAuth, requireAuth } from './core/auth/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'app',
    loadComponent: () =>
      import('./features/shell-host/shell-host.component').then((m) => m.ShellHostComponent),
  },
  { path: 'hangar', loadComponent: () => import('./features/hangar/hangar.component').then((m) => m.HangarComponent) },
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent) },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent) },
  { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password.component').then((m) => m.ResetPasswordComponent) },
  { path: 'leaderboards', canActivate: [optionalAuth], loadComponent: () => import('./features/leaderboards/leaderboards.component').then((m) => m.LeaderboardsComponent) },
  { path: 'leaderboards/challenges/:challengeId', canActivate: [optionalAuth], loadComponent: () => import('./features/challenges-online/online-challenges.component').then((m) => m.OnlineChallengesComponent) },
  { path: 'leaderboards/:courseId', canActivate: [optionalAuth], loadComponent: () => import('./features/leaderboards/course-leaderboard.component').then((m) => m.CourseLeaderboardComponent) },
  { path: 'profile', canActivate: [requireAuth], loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent) },
  { path: 'profile/runs', canActivate: [requireAuth], loadComponent: () => import('./features/profile/runs-history.component').then((m) => m.RunsHistoryComponent) },
  { path: 'account', canActivate: [requireAuth], loadComponent: () => import('./features/account/account.component').then((m) => m.AccountComponent) },
  { path: 'sync', canActivate: [requireAuth], loadComponent: () => import('./features/sync/sync.component').then((m) => m.SyncComponent) },
  { path: 'pilots/:username', canActivate: [optionalAuth], loadComponent: () => import('./features/profile/public-pilot.component').then((m) => m.PublicPilotComponent) },
  { path: 'results/:publicId', canActivate: [optionalAuth], loadComponent: () => import('./features/results/public-result.component').then((m) => m.PublicResultComponent) },
  { path: 'replays/:publicId', canActivate: [optionalAuth], loadComponent: () => import('./features/replays/public-replay.component').then((m) => m.PublicReplayComponent) },
  { path: 'compete', canActivate: [optionalAuth], loadComponent: () => import('./features/compete/compete-hub.component').then((m) => m.CompeteHubComponent) },
  { path: 'season', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.SeasonHomeComponent) },
  { path: 'season/leaderboard', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.SeasonLeaderboardComponent) },
  { path: 'season/missions', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.SeasonMissionsComponent) },
  { path: 'season/rewards', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.SeasonRewardsComponent) },
  { path: 'season/history', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.SeasonHistoryComponent) },
  { path: 'tournaments', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.TournamentListComponent) },
  { path: 'tournaments/:slug', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.TournamentDetailComponent) },
  { path: 'ghost-events', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.GhostEventListComponent) },
  { path: 'ghost-events/:slug', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.GhostEventDetailComponent) },
  { path: 'locker', canActivate: [optionalAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.LockerComponent) },
  { path: 'profile/customize', canActivate: [requireAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.ProfileCustomizeComponent) },
  { path: 'notifications', canActivate: [requireAuth], loadComponent: () => import('./features/competitive-pages.component').then((m) => m.NotificationsCenterComponent) },
  {
    path: 'privacy',
    loadComponent: () => import('./features/legal/legal-doc.component').then((m) => m.LegalDocComponent),
    data: { doc: 'privacy' },
  },
  {
    path: 'terms',
    loadComponent: () => import('./features/legal/legal-doc.component').then((m) => m.LegalDocComponent),
    data: { doc: 'terms' },
  },
  {
    path: 'cookies',
    loadComponent: () => import('./features/legal/legal-doc.component').then((m) => m.LegalDocComponent),
    data: { doc: 'cookies' },
  },
  {
    path: 'licenses',
    loadComponent: () => import('./features/legal/legal-doc.component').then((m) => m.LegalDocComponent),
    data: { doc: 'licenses' },
  },
  {
    path: 'asset-licenses',
    loadComponent: () => import('./features/legal/legal-doc.component').then((m) => m.LegalDocComponent),
    data: { doc: 'asset-licenses' },
  },
  {
    path: 'alpha-disclaimer',
    loadComponent: () => import('./features/legal/legal-doc.component').then((m) => m.LegalDocComponent),
    data: { doc: 'alpha-disclaimer' },
  },
  {
    path: 'safety',
    loadComponent: () => import('./features/legal/legal-doc.component').then((m) => m.LegalDocComponent),
    data: { doc: 'safety' },
  },
];
