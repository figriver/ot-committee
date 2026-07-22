import 'server-only';
import { deny } from '@/lib/action-result';
import { getServiceClient } from '@/lib/supabase/server';
import type { Member } from '@/lib/types';

// Week LOCK enforcement.
//
// A reporting week closes at its lock moment: the week_ending date at the
// configured time, in the configured zone. After that, its stat_entries and
// member_hours are read-only — the record of what was reported at the time
// stops moving. Weeks freeze independently: the current week stays open while
// every past week is already locked.
//
// The boundary is CONFIGURATION, never hardcoded here — it is read from the
// settings table (seeded in 0007):
//   week_lock_dow  — day of week the week ends on (0=Sun … 3=Wed)
//   week_lock_time — HH:MM, 24h
//   week_lock_tz   — IANA zone the time is read in
//
// WHY A ZONE: the rest of the app does week math in UTC, which is right for a
// DATE. A TIME OF DAY is different — "11:59pm Wednesday" means 11:59pm where the
// committee is. Treating it as UTC would lock Central-time members out at
// 6:59pm their Wednesday, hours before the boundary they were told about.

const DEFAULTS = { dow: 3, time: '23:59', timeZone: 'America/Chicago' };

export type LockConfig = { dow: number; time: string; timeZone: string };

export type WeekLock = {
  locked: boolean;
  lockAt: Date;
  /** An admin writing to a locked week — allowed, but it is an override. */
  isOverride: boolean;
};

export async function getLockConfig(): Promise<LockConfig> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('settings')
    .select('key, value')
    .in('key', ['week_lock_dow', 'week_lock_time', 'week_lock_tz']);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));

  const dowRaw = parseInt(map.get('week_lock_dow') ?? '', 10);
  const dow = Number.isInteger(dowRaw) && dowRaw >= 0 && dowRaw <= 6 ? dowRaw : DEFAULTS.dow;
  const timeRaw = map.get('week_lock_time') ?? '';
  const time = /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw : DEFAULTS.time;
  const tzRaw = map.get('week_lock_tz') ?? '';
  const timeZone = isValidZone(tzRaw) ? tzRaw : DEFAULTS.timeZone;

  return { dow, time, timeZone };
}

function isValidZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** How far `date` is from UTC in the given zone, in ms. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // Intl renders midnight as hour 24 in some locales/versions; normalise it.
  const asUTC = Date.UTC(at('year'), at('month') - 1, at('day'), at('hour') % 24, at('minute'), at('second'));
  return asUTC - date.getTime();
}

/**
 * The instant a week closes: `weekEnding` at the configured time, in the
 * configured zone, as a real UTC instant.
 *
 * Two passes: the first treats the wall time as UTC and measures the zone's
 * offset there; near a DST change that offset can itself be off by an hour, so
 * the second pass re-measures at the corrected instant.
 */
export function lockInstant(weekEnding: string, cfg: LockConfig): Date {
  const [h, m] = cfg.time.split(':').map(Number);
  const naive = Date.parse(
    `${weekEnding}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
  );
  let instant = new Date(naive - zoneOffsetMs(new Date(naive), cfg.timeZone));
  instant = new Date(naive - zoneOffsetMs(instant, cfg.timeZone));
  return instant;
}

export function isLockedAt(weekEnding: string, cfg: LockConfig, now: Date = new Date()): boolean {
  return now.getTime() > lockInstant(weekEnding, cfg).getTime();
}

/**
 * Can this member write to this week — and if so, is it an override?
 *
 * Members: open weeks only. Admins: any week, but writing to a locked one is an
 * OVERRIDE (the caller surfaces it as such; updated_by records who did it).
 */
export async function getWeekLock(member: Member, weekEnding: string): Promise<WeekLock> {
  const cfg = await getLockConfig();
  const lockAt = lockInstant(weekEnding, cfg);
  const locked = Date.now() > lockAt.getTime();
  return { locked, lockAt, isOverride: locked && member.role === 'admin' };
}

/**
 * Throw if the week has closed, for ANYONE — including admins.
 *
 * This guards the weekly report FORM. An admin override has to be a visible,
 * attributed act, and a re-submit of the whole report form is neither: it would
 * rewrite several values at once with nothing marking it as an override. Admins
 * correct a closed week one value at a time from the History page instead
 * (assertWeekWritable below), where it is labelled and records updated_by.
 */
export async function assertWeekOpen(weekEnding: string): Promise<void> {
  const cfg = await getLockConfig();
  if (isLockedAt(weekEnding, cfg)) {
    deny(`Week ending ${weekEnding} is closed.`);
  }
}

/** Throw unless this member may write to this week. Returns override status. */
export async function assertWeekWritable(
  member: Member,
  weekEnding: string,
): Promise<{ isOverride: boolean }> {
  const { locked, isOverride } = await getWeekLock(member, weekEnding);
  if (locked && !isOverride) {
    deny(`Week ending ${weekEnding} is locked. Ask an admin if it needs correcting.`);
  }
  return { isOverride };
}

/** Human statement of the boundary, e.g. "Wednesday 11:59 PM (America/Chicago)". */
export function describeLock(cfg: LockConfig): string {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const [h, m] = cfg.time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${days[cfg.dow]} ${h12}:${String(m).padStart(2, '0')} ${suffix} (${cfg.timeZone})`;
}
