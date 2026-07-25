/**
 * Consistent display formatters for FPV Trainer UI.
 * Prefer these over ad-hoc template formatting.
 */

/** Race time: 00:42.82 or --:--.-- */
export function formatRaceTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--.--';
  }
  const totalCs = Math.round(seconds * 100);
  const mins = Math.floor(totalCs / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Milliseconds → race time string */
export function formatRaceTimeMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return '--:--.--';
  }
  return formatRaceTime(ms / 1000);
}

/** Signed delta: +1.24 s / −0.38 s */
export function formatDeltaSeconds(delta: number | null | undefined, digits = 2): string {
  if (delta == null || !Number.isFinite(delta)) {
    return '—';
  }
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${Math.abs(delta).toFixed(digits)} s`;
}

export function formatDeltaMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return '—';
  }
  return formatDeltaSeconds(ms / 1000);
}

/** Duration: 2m 14s / 3h 12m */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

/** Flight time from seconds: 12h 48m */
export function formatFlightTime(seconds: number | null | undefined): string {
  return formatDuration(seconds);
}

/** Rank: #1 / #42 */
export function formatRank(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank) || rank < 1) {
    return '—';
  }
  return `#${Math.floor(rank)}`;
}

/** XP: 1,250 XP */
export function formatXp(xp: number | null | undefined): string {
  if (xp == null || !Number.isFinite(xp)) {
    return '0 XP';
  }
  return `${Math.floor(xp).toLocaleString()} XP`;
}

/** Wind: 4.2 m/s */
export function formatWind(mps: number | null | undefined, digits = 1): string {
  if (mps == null || !Number.isFinite(mps)) {
    return '—';
  }
  return `${mps.toFixed(digits)} m/s`;
}

/** Locale-aware date */
export function formatDate(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  locale?: string,
): string {
  if (value == null || value === '') {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(locale, options);
}

/** Relative-ish timestamp for notifications */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  now = Date.now(),
): string {
  if (value == null || value === '') {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const diffSec = Math.round((now - date.getTime()) / 1000);
  if (diffSec < 60) {
    return 'Just now';
  }
  if (diffSec < 3600) {
    return `${Math.floor(diffSec / 60)}m ago`;
  }
  if (diffSec < 86400) {
    return `${Math.floor(diffSec / 3600)}h ago`;
  }
  if (diffSec < 86400 * 7) {
    return `${Math.floor(diffSec / 86400)}d ago`;
  }
  return formatDate(date);
}

/** “Last updated 18 minutes ago” */
export function formatCacheAge(updatedAt: number | null | undefined, now = Date.now()): string {
  if (updatedAt == null || !Number.isFinite(updatedAt)) {
    return 'Cached data';
  }
  const mins = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (mins < 1) {
    return 'Last updated just now';
  }
  if (mins === 1) {
    return 'Last updated 1 minute ago';
  }
  if (mins < 60) {
    return `Last updated ${mins} minutes ago`;
  }
  const hours = Math.floor(mins / 60);
  return hours === 1 ? 'Last updated 1 hour ago' : `Last updated ${hours} hours ago`;
}

export function formatRemaining(endsAt: string | null | undefined, now = Date.now()): string {
  if (!endsAt) {
    return '—';
  }
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) {
    return '—';
  }
  const ms = end - now;
  if (ms <= 0) {
    return 'Ended';
  }
  return formatDuration(ms / 1000) + ' left';
}
