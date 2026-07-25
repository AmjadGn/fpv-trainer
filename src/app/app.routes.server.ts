import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Online competitive routes are client-rendered (they need live API data and
 * dynamic path params). The shell SPA remains available offline without SSR.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Client },
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'register', renderMode: RenderMode.Client },
  { path: 'forgot-password', renderMode: RenderMode.Client },
  { path: 'reset-password', renderMode: RenderMode.Client },
  { path: 'leaderboards', renderMode: RenderMode.Client },
  { path: 'leaderboards/challenges/:challengeId', renderMode: RenderMode.Client },
  { path: 'leaderboards/:courseId', renderMode: RenderMode.Client },
  { path: 'profile', renderMode: RenderMode.Client },
  { path: 'profile/runs', renderMode: RenderMode.Client },
  { path: 'account', renderMode: RenderMode.Client },
  { path: 'sync', renderMode: RenderMode.Client },
  { path: 'pilots/:username', renderMode: RenderMode.Client },
  { path: 'results/:publicId', renderMode: RenderMode.Client },
  { path: 'replays/:publicId', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
