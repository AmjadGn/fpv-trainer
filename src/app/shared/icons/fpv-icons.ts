export type FpvIconName =
  | 'home'
  | 'fly'
  | 'academy'
  | 'challenge'
  | 'trophy'
  | 'season'
  | 'tournament'
  | 'ghost'
  | 'replay'
  | 'leaderboard'
  | 'notification'
  | 'settings'
  | 'profile'
  | 'locker'
  | 'weather'
  | 'wind'
  | 'camera'
  | 'audio'
  | 'fullscreen'
  | 'controller'
  | 'check'
  | 'close'
  | 'chevron-right'
  | 'chevron-down'
  | 'more'
  | 'menu'
  | 'offline'
  | 'warning'
  | 'info'
  | 'success'
  | 'play'
  | 'pause'
  | 'retry'
  | 'share'
  | 'logout'
  | 'compete';

/** Centralized outline SVG paths (24×24 viewBox). Lucide-compatible stroke style. */
export const FPV_ICON_PATHS: Record<FpvIconName, string> = {
  home: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  fly: 'M12 19V5M5 12l7-7 7 7',
  academy: 'M22 10 12 5 2 10l10 5 10-5zM6 12.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5',
  challenge: 'M12 2l2.4 7.2H22l-6 4.4 2.3 7L12 16.8 5.7 20.6 8 13.6 2 9.2h7.6z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1',
  season: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  tournament: 'M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M8 21h8M12 17v4M8 5v4a4 4 0 0 0 8 0V5H8z',
  ghost: 'M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v10l2.5-1.5L9 20l2.5-1.5L14 20l2.5-1.5L19 20V10a8 8 0 0 0-7-8z',
  replay: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  leaderboard: 'M8 18V9M12 18V5M16 18v-6M4 20h16',
  notification: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  locker: 'M21 8v13H3V8M1 8h22M10 12h4M12 3v5',
  weather: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  wind: 'M9.6 10H17a2.5 2.5 0 1 0-2.5-2.5M4 14h12.5a2.5 2.5 0 1 1-2.5 2.5M4 18h6',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  audio: 'M11 5 6 9H2v6h4l5 4V5zM19.1 4.9a10 10 0 0 1 0 14.2M15.5 8.5a5 5 0 0 1 0 7',
  fullscreen: 'M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5',
  controller: 'M6 11h4M14 11h4M8 8v6M17 9v4M6.5 5h11A3.5 3.5 0 0 1 21 8.5v7A3.5 3.5 0 0 1 17.5 19h-11A3.5 3.5 0 0 1 3 15.5v-7A3.5 3.5 0 0 1 6.5 5z',
  check: 'M20 6 9 17l-5-5',
  close: 'M18 6 6 18M6 6l12 12',
  'chevron-right': 'm9 18 6-6-6-6',
  'chevron-down': 'm6 9 6 6 6-6',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  offline: 'M1 1l22 22M16.7 11.2A6 6 0 0 1 19 16M5 12.6A10 10 0 0 1 12.6 5M9.2 9.2a5 5 0 0 1 6.6 6.6M1.4 9A16 16 0 0 1 9 1.4M12 20h.01',
  warning: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  info: 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  success: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3',
  play: 'm5 3 14 9-14 9V3z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  retry: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  compete: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z',
};
