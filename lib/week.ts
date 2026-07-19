import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

// Reporting weeks end on a configurable day-of-week (seeded to Wednesday). The
// week_ending date stored on entries is that day. All date math is done in UTC
// (Vercel runs UTC) on plain YYYY-MM-DD strings to avoid timezone drift.

const DEFAULT_LOCK_DOW = 3; // Wednesday (Sun=0 .. Sat=6)

export async function getWeekLockDow(): Promise<number> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('settings')
    .select('value')
    .eq('key', 'week_lock_dow')
    .maybeSingle();
  const n = data ? parseInt(data.value as string, 10) : DEFAULT_LOCK_DOW;
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : DEFAULT_LOCK_DOW;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The lock day on or after `fromISO` — i.e. the end of that date's week. */
export function weekEndingOnOrAfter(fromISO: string, lockDow: number): string {
  const base = parseISO(fromISO);
  const add = (lockDow - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + add);
  return toISO(base);
}

export function addDaysISO(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function isWeekEnding(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseISO(iso).getTime());
}

/** The current reporting week's week_ending date. */
export async function currentWeekEnding(): Promise<string> {
  const lockDow = await getWeekLockDow();
  return weekEndingOnOrAfter(toISO(new Date()), lockDow);
}

/** Resolve a requested `?week=` param to a valid week_ending, else the current one. */
export async function resolveWeekEnding(requested?: string): Promise<string> {
  const lockDow = await getWeekLockDow();
  if (requested && isWeekEnding(requested)) {
    // snap any date to its week's lock day, so ?week= is always a valid boundary
    return weekEndingOnOrAfter(requested, lockDow);
  }
  return weekEndingOnOrAfter(toISO(new Date()), lockDow);
}

export function formatWeekEnding(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
